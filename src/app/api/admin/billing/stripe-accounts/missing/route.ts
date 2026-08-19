import type { SupabaseClient } from "@supabase/supabase-js"

import {
  canManageWorkspace,
  errorJson,
  getRequestStringParam,
  json,
  readJsonBody,
  resolveTenantContext,
} from "@/lib/api/tenant"
import { createAdminClient } from "@/lib/supabase/admin"
import { ensureStripeCustomerForUser } from "@/lib/billing/customer"

const MISSING_STRIPE_MAX_LIMIT = 200

type MissingWorkspaceStripeRow = {
  user_id: string
  email: string | null
  name: string | null
  workspace_customer_id: string | null
  legacy_customer_id: string | null
  has_workspace_account: boolean
  has_legacy_account: boolean
  effective_customer_id: string | null
}

type StripeScopeRow = {
  user_id: string
  customer_id: string | null
}

function isValidUuid(value: string | null) {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value
      )
  )
}

function normalizeUserIds(userIds: unknown) {
  if (!Array.isArray(userIds)) {
    return []
  }

  return Array.from(
    new Set(
      userIds
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter((value) => isValidUuid(value))
    )
  )
}

function extractEmailsFromDetails(data: Array<{ user_id: string; email?: string | null; name?: string | null }>) {
  const map = new Map<string, { email: string | null; name: string | null }>()
  for (const row of data || []) {
    map.set(String(row.user_id), {
      email: row.email || null,
      name: row.name || null,
    })
  }
  return map
}

function mapStripeByUser(rows: StripeScopeRow[]) {
  const map = new Map<string, string | null>()
  for (const row of rows || []) {
    const userId = String(row.user_id)
    if (!map.has(userId)) {
      map.set(userId, row.customer_id || null)
      continue
    }

    if (!map.get(userId) && row.customer_id) {
      map.set(userId, row.customer_id)
    }
  }
  return map
}

async function findMissingCustomers(params: {
  organizationId: string
  workspaceId: string
  supabase: SupabaseClient
}) {
  const { organizationId, workspaceId, supabase } = params

  const { data: workspaceMembers, error: workspaceMembersError } = await supabase
    .from("workspace_members")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("workspace_id", workspaceId)

  if (workspaceMembersError) {
    throw new Error(workspaceMembersError.message)
  }

  const userIds = (workspaceMembers || []).map((member) => String(member.user_id))
  if (!userIds.length) {
    return {
      workspace_id: workspaceId,
      organization_id: organizationId,
      users: [],
      summary: {
        total: 0,
        with_workspace_customer: 0,
        with_legacy_customer: 0,
        effective_missing: 0,
      },
    }
  }

  const [userDetailsResult, workspaceAccountsResult, legacyAccountsResult] =
    await Promise.all([
      supabase
        .from("user_details")
        .select("user_id, email, name")
        .in("user_id", userIds),
      supabase
        .from("stripe_accounts")
        .select("user_id, customer_id")
        .in("user_id", userIds)
        .eq("workspace_id", workspaceId)
        .eq("active", true),
      supabase
        .from("stripe_accounts")
        .select("user_id, customer_id")
        .in("user_id", userIds)
        .is("workspace_id", null)
        .eq("billing_scope", "user")
        .eq("active", true),
    ])

  if (userDetailsResult.error) {
    throw new Error(userDetailsResult.error.message)
  }
  if (workspaceAccountsResult.error) {
    throw new Error(workspaceAccountsResult.error.message)
  }
  if (legacyAccountsResult.error) {
    throw new Error(legacyAccountsResult.error.message)
  }

  const userDetailsMap = extractEmailsFromDetails(userDetailsResult.data || [])

  const workspaceCustomerByUser = mapStripeByUser(
    (workspaceAccountsResult.data || []) as StripeScopeRow[]
  )
  const legacyCustomerByUser = mapStripeByUser(
    (legacyAccountsResult.data || []) as StripeScopeRow[]
  )

  const workspaceUserCount = new Set(
    Array.from(workspaceCustomerByUser.keys()).filter(
      (userId) => Boolean(workspaceCustomerByUser.get(userId))
    )
  ).size

  const legacyUserCount = new Set(
    Array.from(legacyCustomerByUser.keys()).filter(
      (userId) => Boolean(legacyCustomerByUser.get(userId))
    )
  ).size

  const missingRows: MissingWorkspaceStripeRow[] = userIds
    .map((userId) => {
      const profile = userDetailsMap.get(userId)
      const workspaceCustomerId = workspaceCustomerByUser.get(userId) || null
      const legacyCustomerId = legacyCustomerByUser.get(userId) || null
      const effectiveCustomerId = workspaceCustomerId || legacyCustomerId

      return {
        user_id: userId,
        email: profile?.email || null,
        name: profile?.name || null,
        workspace_customer_id: workspaceCustomerId,
        legacy_customer_id: legacyCustomerId,
        has_workspace_account: Boolean(workspaceCustomerByUser.has(userId)),
        has_legacy_account: Boolean(legacyCustomerByUser.has(userId)),
        effective_customer_id: effectiveCustomerId,
      }
    })
    .filter((row) => !row.effective_customer_id)

  return {
    workspace_id: workspaceId,
    organization_id: organizationId,
    users: missingRows,
    summary: {
      total: userIds.length,
      with_workspace_customer: workspaceUserCount,
      with_legacy_customer: legacyUserCount,
      effective_missing: missingRows.length,
    },
  }
}

async function hydrateEmailsFromAdmin(
  admin: ReturnType<typeof createAdminClient>,
  userIds: string[]
) {
  if (!userIds.length) {
    return new Map<string, string | null>()
  }

  const rows = await Promise.all(
    userIds.map(async (userId) => {
      try {
        const { data, error } = await admin.auth.admin.getUserById(userId)
        if (error) {
          return [userId, null] as const
        }

        return [userId, data.user.email || null] as const
      } catch {
        return [userId, null] as const
      }
    })
  )

  return new Map(rows)
}

type ResolvedWorkspaceContext =
  | { ok: true; workspaceId: string; organizationId: string }
  | { ok: false; error: string }

function resolveWorkspaceId(context: {
  organizationId: string | null
  workspaceId: string | null
  allowedWorkspaceIds: string[]
}, requestedWorkspaceId: string | null): ResolvedWorkspaceContext {
  const workspaceId = requestedWorkspaceId || context.workspaceId
  if (!workspaceId) {
    return { ok: false, error: "Workspace access required" }
  }

  const organizationId = context.organizationId
  if (!organizationId) {
    return { ok: false, error: "Organization access required" }
  }

  if (
    requestedWorkspaceId &&
    requestedWorkspaceId !== context.workspaceId &&
    !context.allowedWorkspaceIds.includes(requestedWorkspaceId)
  ) {
    return { ok: false, error: "Workspace access denied" }
  }

  return {
    ok: true,
    workspaceId,
    organizationId,
  }
}

export async function GET(request: Request) {
  const tenant = await resolveTenantContext(request)
  if (!tenant.ok) {
    return errorJson(tenant.error, tenant.status)
  }

  if (tenant.context.legacyFallback) {
    return errorJson("Admin workspace context is required", 403)
  }

  if (!canManageWorkspace(tenant.context.role)) {
    return errorJson("Only owners and admins can manage billing", 403)
  }

  const requestedWorkspaceId = getRequestStringParam(request, "workspace_id")
  const target = resolveWorkspaceId(tenant.context, requestedWorkspaceId)

  if (!target.ok) {
    return errorJson(target.error, 403)
  }

  try {
    const payload = await findMissingCustomers({
      organizationId: target.organizationId,
      workspaceId: target.workspaceId,
      supabase: tenant.supabase,
    })

    return json(payload)
  } catch (error) {
    console.error("Billing missing customer scan failed:", error)
    return errorJson("Unable to scan missing workspace customers")
  }
}

export async function POST(request: Request) {
  const tenant = await resolveTenantContext(request)
  if (!tenant.ok) {
    return errorJson(tenant.error, tenant.status)
  }

  if (tenant.context.legacyFallback) {
    return errorJson("Admin workspace context is required", 403)
  }

  if (!canManageWorkspace(tenant.context.role)) {
    return errorJson("Only owners and admins can manage billing", 403)
  }

  const requestedWorkspaceId = getRequestStringParam(request, "workspace_id")
  const target = resolveWorkspaceId(tenant.context, requestedWorkspaceId)

  if (!target.ok) {
    return errorJson(target.error, 403)
  }

  let adminClient: ReturnType<typeof createAdminClient>
  try {
    adminClient = createAdminClient()
  } catch {
    return errorJson("SUPABASE_SERVICE_ROLE_KEY is required.", 500)
  }

  const body = await readJsonBody(request)
  const selected = normalizeUserIds(body.user_ids)
  const rawDryRun = body.dry_run
  const dryRun =
    rawDryRun === true ||
    rawDryRun === "true" ||
    rawDryRun === 1 ||
    rawDryRun === "1"
  const requestedLimit = Number(body.limit)
  const limit =
    Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, MISSING_STRIPE_MAX_LIMIT)
      : 100

  try {
    const scanned = await findMissingCustomers({
      organizationId: target.organizationId,
      workspaceId: target.workspaceId,
      supabase: tenant.supabase,
    })

    const missingSet = new Set(scanned.users.map((row) => row.user_id))
    const targets = (selected.length
      ? selected.filter((userId) => missingSet.has(userId))
      : scanned.users.map((row) => row.user_id)
    ).slice(0, limit)

    const userDetails = await tenant.supabase
      .from("user_details")
      .select("user_id, email, name")
      .in("user_id", targets)

    if (userDetails.error) {
      throw new Error(userDetails.error.message)
    }

    const profileEmails = extractEmailsFromDetails(userDetails.data || [])
    const missingEmails = targets.filter((userId) => !profileEmails.get(userId)?.email)
    const adminEmails = await hydrateEmailsFromAdmin(adminClient, missingEmails)

    if (dryRun) {
      return json({
        workspace_id: target.workspaceId,
        organization_id: target.organizationId,
        dry_run: true,
        attempted: targets.length,
        targets,
      })
    }

    const results = await Promise.all(
      targets.map(async (userId) => {
        const profile = profileEmails.get(userId)
        const email = profile?.email || adminEmails.get(userId)

        if (!email) {
          return {
            user_id: userId,
            status: "skipped",
            reason: "Missing user email",
          }
        }

        try {
          const bootstrapped = await ensureStripeCustomerForUser({
            supabase: tenant.supabase,
            userId,
            userEmail: email,
            organizationId: target.organizationId,
            workspaceId: target.workspaceId,
          })

          return {
            user_id: userId,
            status: "fixed",
            customer_id: bootstrapped.customerId,
            created: bootstrapped.created,
          }
        } catch (error) {
          return {
            user_id: userId,
            status: "failed",
            reason: error instanceof Error ? error.message : String(error),
          }
        }
      })
    )

    const succeeded = results.filter((entry) => entry.status === "fixed").length
    const failed = results.filter((entry) => entry.status === "failed").length
    const skipped = results.filter((entry) => entry.status === "skipped").length

    return json({
      workspace_id: target.workspaceId,
      organization_id: target.organizationId,
      summary: {
        attempted: targets.length,
        succeeded,
        failed,
        skipped,
      },
      results,
    })
  } catch (error) {
    console.error("Billing missing customer backfill failed:", error)
    return errorJson("Unable to backfill missing stripe customers")
  }
}
