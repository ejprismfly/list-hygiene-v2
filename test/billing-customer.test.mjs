import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import ts from "typescript"

function loadModule(path, dependencies, testExports = "") {
  const source = readFileSync(new URL(path, import.meta.url), "utf8") + testExports
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  const compiledModule = { exports: {} }
  new Function("require", "exports", "module", code)((name) => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`)
    return dependencies[name]
  }, compiledModule.exports, compiledModule)
  return compiledModule.exports
}

function customerHarness({ rows = [], readError = null, racingRow = null } = {}) {
  let creates = 0
  let inserts = 0
  const db = { from(table) {
    assert.equal(table, "stripe_accounts")
    const filters = []
    let payload
    const query = {
      select() { return query },
      eq(key, value) { filters.push((row) => row[key] === value); return query },
      is(key, value) { filters.push((row) => (row[key] ?? null) === value); return query },
      order() { return query },
      insert(value) { payload = value; return query },
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          if (!payload) return { data: rows.filter((row) => filters.every((filter) => filter(row))), error: readError }
          inserts++
          if (racingRow) { rows.push(racingRow); return { data: null, error: { code: "23505" } } }
          const row = { id: String(rows.length + 1), ...payload }
          rows.push(row)
          return { data: [row], error: null }
        }).then(resolve, reject)
      },
    }
    return query
  } }
  const api = loadModule("../src/lib/billing/customer.ts", {
    "@/lib/billing/scope": {
      getScopedBillingAccount: () => null,
      async updateStripeAccountById(_db, row, patch) { Object.assign(row, patch); return { error: null } },
    },
    "@/lib/billing/stripe": {
      async createStripeCustomer() { creates++; return { id: "cus_new" } },
      async getOrCreateStripeCustomerByEmail() { creates++; return { id: "cus_legacy" } },
    },
  })
  return { api, db, rows, counts: () => ({ creates, inserts }) }
}
const params = { userId: "owner", userEmail: "owner@example.invalid", workspaceId: "workspace", organizationId: "org" }

test("registration inserts a mapping without relying on an upsert conflict target", async () => {
  const h = customerHarness()
  const result = await h.api.ensureStripeCustomerForUser({ ...params, supabase: h.db })
  assert.equal(result.customerId, "cus_new")
  assert.deepEqual(h.counts(), { creates: 1, inserts: 1 })
  await h.api.ensureStripeCustomerForUser({ ...params, supabase: h.db })
  assert.deepEqual(h.counts(), { creates: 1, inserts: 1 })
})

test("workspace members and transferred owners reuse the workspace customer", async () => {
  const row = { id: "1", user_id: "previous-owner", workspace_id: "workspace", active: true, customer_id: "cus_existing" }
  const h = customerHarness({ rows: [row] })
  assert.equal((await h.api.ensureStripeCustomerForUser({ ...params, supabase: h.db })).customerId, "cus_existing")
  assert.equal(row.user_id, "previous-owner")
  const scoped = await h.api.ensureScopedStripeCustomer({ supabase: h.db,
    user: { id: params.userId, email: params.userEmail }, organizationId: params.organizationId, workspaceId: params.workspaceId })
  assert.equal(scoped.stripeAccount.user_id, "previous-owner")
  assert.deepEqual(h.counts(), { creates: 0, inserts: 0 })
})

test("an inactive workspace mapping reuses its customer without creating another", async () => {
  const row = { id: "1", user_id: "owner", workspace_id: "workspace", active: false, customer_id: "cus_existing" }
  const h = customerHarness({ rows: [row] })
  const result = await h.api.ensureStripeCustomerForUser({ ...params, supabase: h.db })
  assert.equal(result.customerId, "cus_existing")
  assert.equal(row.active, true)
  assert.deepEqual(h.counts(), { creates: 0, inserts: 0 })
})

test("an active placeholder takes priority over an inactive mapping", async () => {
  const inactive = { id: "1", user_id: "owner", workspace_id: "workspace", active: false, customer_id: "cus_existing" }
  const active = { id: "2", user_id: "owner", workspace_id: "workspace", active: true, customer_id: null }
  const h = customerHarness({ rows: [inactive, active] })
  const result = await h.api.ensureStripeCustomerForUser({ ...params, supabase: h.db })
  assert.equal(result.stripeAccount.id, "2")
  assert.equal(result.customerId, "cus_existing")
  assert.equal(inactive.active, false)
  assert.deepEqual(h.counts(), { creates: 0, inserts: 0 })
})

test("a concurrent mapping insert returns the winner without overwriting it", async () => {
  const h = customerHarness({ racingRow: { id: "2", user_id: "owner", workspace_id: "workspace", active: true, customer_id: "cus_winner" } })
  assert.equal((await h.api.ensureStripeCustomerForUser({ ...params, supabase: h.db })).customerId, "cus_winner")
  assert.equal(h.rows.length, 1)
})

test("database lookup failures cannot trigger duplicate Stripe creation", async () => {
  const h = customerHarness({ readError: { code: "42703", message: "missing column" } })
  await assert.rejects(h.api.ensureStripeCustomerForUser({ ...params, supabase: h.db }), /missing column/)
  assert.deepEqual(h.counts(), { creates: 0, inserts: 0 })
})

test("Stripe customer recovery reuses matching workspace metadata and rejects ambiguity", async () => {
  const oldKey = process.env.STRIPE_SECRET_KEY
  process.env.STRIPE_SECRET_KEY = "test-only"
  let creates = 0
  let customers = [{ id: "cus_recovered", metadata: { organization_id: "org" } }]
  const metadata = { workspace_id: "11111111-1111-4111-8111-111111111111", organization_id: "org" }
  try {
    const api = loadModule("../src/lib/billing/stripe.ts", { stripe: class {
      customers = {
        async search(input) { assert.ok(input.query.includes(metadata.workspace_id)); return { data: customers } },
        async create() { creates++; return { id: "cus_new" } },
      }
    } })
    assert.equal((await api.createStripeCustomer("owner@example.invalid", metadata, "key")).id, "cus_recovered")
    assert.equal(creates, 0)
    customers = [...customers, { id: "cus_other", metadata: {} }]
    await assert.rejects(api.createStripeCustomer("owner@example.invalid", metadata, "key"), /Multiple Stripe customers/)
    assert.equal(creates, 0)
  } finally {
    if (oldKey === undefined) delete process.env.STRIPE_SECRET_KEY
    else process.env.STRIPE_SECRET_KEY = oldKey
  }
})
