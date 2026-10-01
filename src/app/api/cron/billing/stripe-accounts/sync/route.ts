import { timingSafeEqual } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"

import { createAdminClient } from "@/lib/supabase/admin"
import { ensureStripeCustomerForUser } from "@/lib/billing/customer"
import { errorJson, json } from "@/lib/api/tenant"

const DEFAULT_MAX_WORKSPACE_LIMIT = 200
const MISSING_USER_LIMIT = 200

type StripeScopeRow = {
  user_id: string
  customer_id: string | null
}

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

type WorkspaceSummary = {
  workspace_id: string
  organization_id: string
  attempted: number
  fixed: number
  skipped: number
  failed: number
}

type SyncResult = {
  workspace_id: string
  organization_id: string
  status: "ok" | "skipped" | "failed"
  summary?: WorkspaceSummary
  error?: string
}

function boolFromInput(value: unknown): boolean {
  return (
    value === true ||
    value === 1 ||
    value === "true" ||
    value === "1" ||
    value === "yes"
  )
}

function parseNumber(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number
) {
  if (typeof value !== "string" && typeof value !== "number") {
    return fallback
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }

  return Math.max(minimum, Math.min(maximum, Math.floor(parsed)))
}

function parseWorkspaceIds(workspaceIds: unknown) {
  if (!Array.isArray(workspaceIds)) {
    return []
  }

  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

  return Array.from(
    new Set(
      workspaceIds
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter((value) => value && uuidPattern.test(value))
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

function resolveSyncSecret() {
  return process.env.STRIPE_SYNC_SECRET || process.env.CRON_SECRET || null
}

function hasSyncAuth(request: Request) {
  const secret = resolveSyncSecret()
  if (!secret) {
    return false
  }

  const header = request.headers.get("authorization") || ""
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : header
  const token = request.headers.get("x-stripe-sync-secret") || bearer

  return Boolean(token && Buffer.byteLength(token) === Buffer.byteLength(secret) && timingSafeEqual(Buffer.from(token), Buffer.from(secret)))
}

async function listWorkspaceIds(params: {
  supabase: SupabaseClient
  organizationId: string | null
  workspaceId: string | null
  maxWorkspaces: number
  workspaceOffset: number
}) {
  const { supabase, organizationId, workspaceId, maxWorkspaces, workspaceOffset } =
    params

  let query = supabase
    .from("workspaces")
    .select("id, organization_id")
    .is("archived_at", null)

  if (organizationId) {
    query = query.eq("organization_id", organizationId)
  }

  if (workspaceId) {
    query = query.eq("id", workspaceId)
  }

  const { data, error } = await query
    .order("created_at", { ascending: true })
    .range(workspaceOffset, workspaceOffset + maxWorkspaces - 1)
    .limit(maxWorkspaces)

  if (error) {
    throw new Error(error.message)
  }

  return (data || []).map((row) => ({
    workspaceId: String(row.id),
    organizationId: String(row.organization_id),
  }))
}

async function findMissingWorkspaceCustomers(params: {
  organizationId: string
  workspaceId: string
  supabase: SupabaseClient
}): Promise<
  | {
      workspace_id: string
      organization_id: string
      users: MissingWorkspaceStripeRow[]
      summary: {
        total: number
        with_workspace_customer: number
        with_legacy_customer: number
        effective_missing: number
      }
    }
  | null
> {
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
    return null
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

export async function POST(request: Request) {
  if (!hasSyncAuth(request)) {
    return errorJson("Unauthorized sync request", 401)
  }

  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const requestedOrganizationId =
    typeof body.organization_id === "string" ? body.organization_id.trim() : null
  const requestedWorkspaceId =
    typeof body.workspace_id === "string" ? body.workspace_id.trim() : null
  const dryRun = boolFromInput(
    (body as Record<string, unknown>).dry_run ||
      (body as Record<string, unknown>).dryRun
  )
  const workspaceOffset = parseNumber(
    (body as Record<string, unknown>).workspace_offset,
    0,
    0,
    100000
  )

  const maxWorkspaces = parseNumber(
    (body as Record<string, unknown>).max_workspaces,
    DEFAULT_MAX_WORKSPACE_LIMIT,
    1,
    500
  )
  const userLimit = parseNumber(
    (body as Record<string, unknown>).max_users_per_workspace,
    MISSING_USER_LIMIT,
    1,
    1000
  )
  const workspaceIds = parseWorkspaceIds(
    (body as Record<string, unknown>).workspace_ids
  )

  let supabase: ReturnType<typeof createAdminClient>
  try {
    supabase = createAdminClient()
  } catch {
    return errorJson("SUPABASE_SERVICE_ROLE_KEY is required.", 500)
  }

  const adminClient = supabase
  const targets: Array<{ workspaceId: string; organizationId: string }> = []

  try {
    if (requestedWorkspaceId) {
      const workspaceIdsSet = workspaceIds.includes(requestedWorkspaceId)
        ? workspaceIds
        : [requestedWorkspaceId]
      const list = await listWorkspaceIds({
        supabase,
        organizationId: requestedOrganizationId || null,
        workspaceId: requestedWorkspaceId,
        maxWorkspaces,
        workspaceOffset,
      })

      if (!list.length) {
        return errorJson("Workspace not found or not in this organization", 404)
      }

      for (const row of list) {
        if (!workspaceIdsSet.length || workspaceIdsSet.includes(row.workspaceId)) {
          targets.push(row)
        }
      }
    } else if (requestedOrganizationId) {
      const rows = await listWorkspaceIds({
        supabase,
        organizationId: requestedOrganizationId,
        workspaceId: null,
        maxWorkspaces,
        workspaceOffset,
      })
      rows.forEach((row) => {
        if (!workspaceIds.length || workspaceIds.includes(row.workspaceId)) {
          targets.push(row)
        }
      })
    } else {
      const rows = await listWorkspaceIds({
        supabase,
        organizationId: null,
        workspaceId: null,
        maxWorkspaces,
        workspaceOffset,
      })
      rows.forEach((row) => {
        if (!workspaceIds.length || workspaceIds.includes(row.workspaceId)) {
          targets.push(row)
        }
      })
    }

    const results: SyncResult[] = []
    let attempted = 0
    let fixed = 0
    let failed = 0
    let skipped = 0

    for (const target of targets) {
      try {
        const scan = await findMissingWorkspaceCustomers({
          organizationId: target.organizationId,
          workspaceId: target.workspaceId,
          supabase,
        })

        if (!scan || !scan.users.length) {
          results.push({
            workspace_id: target.workspaceId,
            organization_id: target.organizationId,
            status: "skipped",
          })
          continue
        }

        const selectedUsers = scan.users
          .slice(0, userLimit)
          .map((row) => row.user_id)

        if (!selectedUsers.length) {
          results.push({
            workspace_id: target.workspaceId,
            organization_id: target.organizationId,
            status: "skipped",
          })
          continue
        }

        const detailRows = await supabase
          .from("user_details")
          .select("user_id, email")
          .in("user_id", selectedUsers)

        if (detailRows.error) {
          throw new Error(detailRows.error.message)
        }

        const profileEmails = extractEmailsFromDetails(detailRows.data || [])
        const missingEmails = selectedUsers.filter(
          (userId) => !profileEmails.get(userId)?.email
        )
        const adminEmails = await hydrateEmailsFromAdmin(adminClient, missingEmails)

        if (dryRun) {
          results.push({
            workspace_id: target.workspaceId,
            organization_id: target.organizationId,
            status: "ok",
            summary: {
              workspace_id: target.workspaceId,
              organization_id: target.organizationId,
              attempted: selectedUsers.length,
              fixed: 0,
              skipped: 0,
              failed: 0,
            },
          })
          attempted += selectedUsers.length
          skipped += selectedUsers.length
          continue
        }

        const workspaceResults = await Promise.all(
          selectedUsers.map(async (userId) => {
            const profile = profileEmails.get(userId)
            const email = profile?.email || adminEmails.get(userId)

            if (!email) {
              return {
                user_id: userId,
                status: "skipped",
              } as const
            }

            try {
              await ensureStripeCustomerForUser({
                supabase,
                userId,
                userEmail: email,
                organizationId: target.organizationId,
                workspaceId: target.workspaceId,
              })
              return {
                user_id: userId,
                status: "fixed",
              } as const
            } catch {
              return {
                user_id: userId,
                status: "failed",
              } as const
            }
          })
        )

        const fixedCount = workspaceResults.filter((row) => row.status === "fixed").length
        const skippedCount = workspaceResults.filter((row) => row.status === "skipped").length
        const failedCount = workspaceResults.filter((row) => row.status === "failed").length

        results.push({
          workspace_id: target.workspaceId,
          organization_id: target.organizationId,
          status: failedCount === 0 ? "ok" : "failed",
          summary: {
            workspace_id: target.workspaceId,
            organization_id: target.organizationId,
            attempted: workspaceResults.length,
            fixed: fixedCount,
            skipped: skippedCount,
            failed: failedCount,
          },
        })

        attempted += workspaceResults.length
        fixed += fixedCount
        skipped += skippedCount
        failed += failedCount
      } catch (error) {
        results.push({
          workspace_id: target.workspaceId,
          organization_id: target.organizationId,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    return json({
      mode: "cron",
      dry_run: dryRun,
      max_workspaces: maxWorkspaces,
      max_users_per_workspace: userLimit,
      summary: {
        requested_workspace_count: targets.length,
        attempted,
        fixed,
        skipped,
        failed,
      },
      has_more_workspaces: !requestedWorkspaceId && targets.length === maxWorkspaces,
      next_workspace_offset:
        !requestedWorkspaceId && targets.length === maxWorkspaces
          ? workspaceOffset + maxWorkspaces
          : null,
      results,
    })
  } catch (error) {
    console.error("Billing stripe customer sync failed:", error)
    return errorJson("Unable to run stripe customer sync")
  }
}
