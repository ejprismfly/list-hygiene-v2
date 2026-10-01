import type { PostgrestError, SupabaseClient, User } from "@supabase/supabase-js"

import type { BillingContext } from "@/lib/billing/scope"
import { getScopedBillingAccount, updateStripeAccountById } from "@/lib/billing/scope"
import {
  createStripeCustomer,
  getOrCreateStripeCustomerByEmail,
} from "@/lib/billing/stripe"

export type StripeAccountResult = {
  id: string
  user_id: string
  organization_id?: string | null
  workspace_id?: string | null
  billing_scope?: string | null
  customer_id: string | null
  subscription_id?: string | null
  active?: boolean | null
}

type StripeCustomerScopeParams = {
  supabase: SupabaseClient
  userId: string
  userEmail: string
  organizationId: string | null
  workspaceId: string | null
  fallbackCustomerId?: string | null
}

const STRIPE_ACCOUNT_SELECT =
  "id, user_id, customer_id, subscription_id, organization_id, workspace_id, billing_scope, active"

function isUniqueConstraintError(error: PostgrestError | null) {
  return error?.code === "23505"
}

function billingScope(workspaceId: string | null) {
  return workspaceId ? "workspace" : "user"
}

function tenantFields(organizationId: string | null, workspaceId: string | null) {
  return {
    organization_id: organizationId || null,
    workspace_id: workspaceId || null,
    billing_scope: billingScope(workspaceId),
  }
}

function pickPreferredAccount(accounts: StripeAccountResult[]) {
  const activeAccounts = accounts.filter((account) => account.active !== false)
  const candidates = activeAccounts.length ? activeAccounts : accounts
  return candidates.find((account) => Boolean(account.customer_id)) || candidates[0] || null
}

async function queryAccountsForScope(
  supabase: SupabaseClient,
  userId: string,
  workspaceId: string | null,
  includeInactive = false
): Promise<StripeAccountResult[]> {
  let query = supabase
    .from("stripe_accounts")
    .select(STRIPE_ACCOUNT_SELECT)

  if (workspaceId) {
    query = query.eq("workspace_id", workspaceId)
  } else {
    query = query.eq("user_id", userId).is("workspace_id", null)
  }

  if (!includeInactive) {
    query = query.eq("active", true)
  }

  const { data, error } = await query
    .order("active", { ascending: false })
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return (data as StripeAccountResult[] | null) || []
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function withRetries<T>(
  action: () => Promise<T>,
  options: { attempts: number }
): Promise<T> {
  let lastError: unknown

  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      return await action()
    } catch (error) {
      lastError = error
      if (attempt >= options.attempts) {
        break
      }

      await sleep(100 * attempt)
    }
  }

  throw lastError
}

async function upsertScopedAccount(
  supabase: SupabaseClient,
  userId: string,
  organizationId: string | null,
  workspaceId: string | null,
  customerId: string
): Promise<StripeAccountResult> {
  const payload = {
    user_id: userId,
    customer_id: customerId,
    active: true,
    ...tenantFields(organizationId, workspaceId),
  }

  const lookupLatestScoped = async () => {
    const rows = await queryAccountsForScope(supabase, userId, workspaceId, true)
    const preferred = pickPreferredAccount(rows)

    if (!preferred) {
      throw new Error("Unable to create stripe account")
    }

    if (!preferred.customer_id) {
      const { error } = await updateStripeAccountById(supabase, preferred, {
        customer_id: customerId,
        ...tenantFields(organizationId, workspaceId),
      })

      if (error) {
        throw new Error(error.message)
      }

      const afterRetry = await queryAccountsForScope(supabase, userId, workspaceId, true)
      const updated = afterRetry[0]
      if (!updated || !updated.customer_id) {
        throw new Error("Unable to create stripe customer mapping")
      }

      return updated
    }

    return preferred
  }

  let result: { data: StripeAccountResult[] | null; error: PostgrestError | null }

  try {
    // Partial production indexes cannot be inferred by PostgREST upsert.
    // Insert without overwriting another request's customer or billing owner.
    result = await supabase
      .from("stripe_accounts")
      .insert(payload)
      .select(STRIPE_ACCOUNT_SELECT)

    if (result.error) {
      throw result.error
    }
  } catch (error) {
    const candidate = error as PostgrestError
    if (isUniqueConstraintError(candidate)) {
      return lookupLatestScoped()
    }

    throw new Error(candidate.message || "Unable to create stripe account")
  }

  if (result.error) {
    return lookupLatestScoped()
  }

  const row = (result.data || [])[0]
  if (!row) {
    return lookupLatestScoped()
  }

  if (row.customer_id) {
    return row
  }

  return lookupLatestScoped()
}

async function writeExistingAccount(
  supabase: SupabaseClient,
  existingAccount: StripeAccountResult,
  organizationId: string | null,
  workspaceId: string | null,
  customerId: string
): Promise<StripeAccountResult> {
  const { error } = await updateStripeAccountById(supabase, existingAccount, {
    customer_id: customerId,
    active: true,
    ...tenantFields(organizationId, workspaceId),
  })

  if (error) {
    throw new Error(error.message)
  }

  return {
    ...existingAccount,
    customer_id: customerId,
    organization_id: organizationId || existingAccount.organization_id || null,
    workspace_id: workspaceId || existingAccount.workspace_id || null,
    billing_scope: billingScope(workspaceId),
    active: true,
  }
}

async function createOrLookupStripeCustomer(input: {
  userEmail: string
  userId: string
  workspaceId: string | null
  organizationId: string | null
}) {
  const metadata: Record<string, string> = {
    user_id: input.userId,
    user_email: input.userEmail,
    source: "registration",
  }

  if (input.organizationId) {
    metadata.organization_id = input.organizationId
  }

  if (input.workspaceId) {
    metadata.workspace_id = input.workspaceId
    metadata.billing_scope = "workspace"
  } else {
    metadata.billing_scope = "user"
  }

  if (input.workspaceId) {
    const idempotencyKey = `customer_create_workspace_${input.workspaceId}`
    return withRetries(
      () => createStripeCustomer(input.userEmail, metadata, idempotencyKey),
      { attempts: 2 }
    )
  }

  return withRetries(
    () => getOrCreateStripeCustomerByEmail(input.userEmail, metadata),
    { attempts: 2 }
  )
}

export async function ensureStripeCustomerForUser(
  params: StripeCustomerScopeParams
): Promise<{
  ok: true
  customerId: string
  created: boolean
  stripeAccount: StripeAccountResult
}> {
  const {
    supabase,
    userId,
    userEmail,
    organizationId,
    workspaceId,
    fallbackCustomerId,
  } = params

  if (!userEmail) {
    throw new Error("User email is required for billing registration setup.")
  }

  const scopedAccounts = await queryAccountsForScope(
    supabase,
    userId,
    workspaceId,
    true
  )
  const scopedAccount = pickPreferredAccount(scopedAccounts)

  if (scopedAccount?.customer_id && scopedAccount.active !== false) {
    return {
      ok: true,
      customerId: String(scopedAccount.customer_id),
      created: false,
      stripeAccount: {
        ...scopedAccount,
        customer_id: String(scopedAccount.customer_id),
        active: scopedAccount.active ?? true,
      },
    }
  }

  const legacyAccounts = workspaceId
    ? await queryAccountsForScope(supabase, userId, null, true)
    : []

  const legacyAccount = pickPreferredAccount(legacyAccounts)
  const reusableCustomerId =
    scopedAccount?.customer_id ||
    scopedAccounts.find((account) => Boolean(account.customer_id))?.customer_id ||
    fallbackCustomerId || legacyAccount?.customer_id || null

  if (reusableCustomerId) {
    if (scopedAccount) {
      const updated = await writeExistingAccount(
        supabase,
        scopedAccount,
        organizationId,
        workspaceId,
        reusableCustomerId
      )
      return {
        ok: true,
        customerId: reusableCustomerId,
        created: false,
        stripeAccount: updated,
      }
    }

    const upserted = await upsertScopedAccount(
      supabase,
      userId,
      organizationId,
      workspaceId,
      reusableCustomerId
    )
    return {
      ok: true,
      customerId: upserted.customer_id || reusableCustomerId,
      created: false,
      stripeAccount: upserted,
    }
  }

  const customer = await createOrLookupStripeCustomer({
    userEmail,
    userId,
    workspaceId,
    organizationId,
  })

  let upserted: StripeAccountResult
  if (scopedAccount) {
    upserted = await writeExistingAccount(
      supabase,
      scopedAccount,
      organizationId,
      workspaceId,
      customer.id
    )
  } else {
    upserted = await upsertScopedAccount(
      supabase,
      userId,
      organizationId,
      workspaceId,
      customer.id
    )
  }

  return {
    ok: true,
    customerId: upserted.customer_id || customer.id,
    created: !scopedAccount && upserted.customer_id === customer.id,
    stripeAccount: {
      ...upserted,
      customer_id: upserted.customer_id || customer.id,
      active: upserted.active ?? true,
    },
  }
}

export async function ensureScopedStripeCustomer(context: BillingContext) {
  const { supabase, user, organizationId, workspaceId } = context
  if (!user.email) {
    throw new Error("Not authenticated")
  }

  const currentScoped = getScopedBillingAccount(context)
  if (currentScoped?.customer_id) {
    return {
      customerId: currentScoped.customer_id,
      stripeAccount: currentScoped,
    }
  }

  const result = await ensureStripeCustomerForUser({
    supabase,
    userId: user.id,
    userEmail: user.email,
    organizationId,
    workspaceId,
    fallbackCustomerId: currentScoped?.customer_id || null,
  })

  return {
    customerId: result.customerId,
    stripeAccount: {
      ...result.stripeAccount,
      id: result.stripeAccount.id,
      user_id: result.stripeAccount.user_id,
      organization_id: organizationId || result.stripeAccount.organization_id || null,
      workspace_id: workspaceId || result.stripeAccount.workspace_id || null,
      billing_scope: billingScope(workspaceId),
    },
  }
}

export async function ensureStripeCustomerOnRegistration(params: {
  supabase: SupabaseClient
  user: User
}) {
  const { supabase, user } = params

  if (!user.email) {
    throw new Error("User email is required for billing registration setup.")
  }

  const { data: defaultWorkspace } = await supabase
    .from("workspaces")
    .select("id, organization_id")
    .eq("legacy_user_id", user.id)
    .eq("is_default", true)
    .is("archived_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  const workspaceId = defaultWorkspace?.id ? String(defaultWorkspace.id) : null
  const organizationId = defaultWorkspace?.organization_id
    ? String(defaultWorkspace.organization_id)
    : null

  const result = await ensureStripeCustomerForUser({
    supabase,
    userId: user.id,
    userEmail: user.email,
    organizationId,
    workspaceId,
  })

  return {
    ok: true as const,
    customerId: result.customerId,
    created: result.created,
    workspaceId,
    organizationId,
  }
}
