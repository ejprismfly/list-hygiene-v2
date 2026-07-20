import {
  canManageOrganization,
  errorJson,
  json,
  readJsonBody,
  resolveTenantContext,
  type TenantContext,
} from "@/lib/api/tenant"
import { getStripeAccountForBilling } from "@/lib/billing/scope"
import { getSegmentName, type KlaviyoSegment } from "@/lib/klaviyo-segments"

type KlaviyoStoredAccount = {
  id: string
  user_id: string
  organization_id?: string | null
  workspace_id?: string | null
  created_at: string
  account_details?: { id?: string; attributes?: Record<string, unknown> }[]
  segments?: KlaviyoSegment[]
  selected_segment?: KlaviyoSegment | null
  active: boolean
  connection_name: string | null
  fix_typos: boolean
  full_mailbox_retries: number
  greylisted_retries: number
  unexpected_error_retries: number
  mail_server_temporary_error_retries: number
}

type QueryError = { message: string } | null

type ScopedQuery<T> = PromiseLike<{ data: T[] | null; error: QueryError }> & {
  eq: (column: string, value: unknown) => ScopedQuery<T>
  in: (column: string, values: string[]) => ScopedQuery<T>
  single: () => PromiseLike<{ data: T | null; error: QueryError }>
}

function applyAccountScope<T>(query: ScopedQuery<T>, context: TenantContext) {
  if (context.legacyFallback || !context.organizationId) {
    return query.eq("user_id", context.user?.id)
  }

  let scoped = query.eq("organization_id", context.organizationId)
  if (context.workspaceId) {
    scoped = scoped.eq("workspace_id", context.workspaceId)
  } else if (!canManageOrganization(context.role)) {
    scoped = scoped.in("workspace_id", context.allowedWorkspaceIds)
  }

  return scoped
}

function formatAccount(account: KlaviyoStoredAccount, firstOwnerUserId?: string | null) {
  const accountDetails = account.account_details || []
  const [details] = accountDetails
  const externalAccountId = details?.id || account.id
  let segments = account.segments || []

  segments = segments.sort((a, b) => {
    const aDate = new Date(a.attributes?.created || 0).getTime()
    const bDate = new Date(b.attributes?.created || 0).getTime()
    return bDate - aDate
  })

  return {
    id: account.id,
    account_id: externalAccountId,
    created_at: account.created_at,
    connection_date: new Date(account.created_at).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    status: account.active ? "Connected" : "Disconnected",
    active: account.active,
    segments: segments.map((segment) => ({
      id: segment.id,
      name: getSegmentName(segment),
    })),
    selected_segment: {
      id: account.selected_segment?.id || null,
      name: account.selected_segment ? getSegmentName(account.selected_segment) : null,
    },
    connection_name: account.connection_name,
    fix_typos: account.fix_typos,
    full_mailbox_retries: account.full_mailbox_retries,
    greylisted_retries: account.greylisted_retries,
    unexpected_error_retries: account.unexpected_error_retries,
    mail_server_temporary_error_retries:
      account.mail_server_temporary_error_retries,
    is_duplicate: Boolean(firstOwnerUserId && firstOwnerUserId !== account.user_id),
    is_original: !firstOwnerUserId || firstOwnerUserId === account.user_id,
    platform: "klaviyo",
  }
}

export async function GET(request: Request) {
  const tenant = await resolveTenantContext(request)
  if (!tenant.ok) {
    return errorJson(tenant.error, tenant.status)
  }

  const { context, supabase } = tenant
  const url = new URL(request.url)
  const id = url.searchParams.get("id")
  const segmentSearch = url.searchParams.get("segment_search") || ""
  const segmentLimit = Number(url.searchParams.get("segment_limit") || "10")

  const baseQuery = supabase
    .from("klaviyo_accounts")
    .select(
      "id, user_id, organization_id, workspace_id, created_at, account_details, segments, selected_segment, active, connection_name, fix_typos, full_mailbox_retries, greylisted_retries, unexpected_error_retries, mail_server_temporary_error_retries"
    )
    .eq("active", true) as unknown as ScopedQuery<KlaviyoStoredAccount>
  let query = applyAccountScope(baseQuery, context)

  if (id) {
    query = query.eq("id", id)
  }

  const { data, error } = await query
  if (error) {
    return errorJson(error.message)
  }

  const accounts = (data || []) as KlaviyoStoredAccount[]
  const result = await Promise.all(
    accounts.map(async (account) => {
      const externalAccountId = account.account_details?.[0]?.id
      const { data: directoryRow } = externalAccountId
        ? await supabase
            .from("klaviyo_accounts_directory")
            .select("user_id, account_id")
            .eq("account_id", externalAccountId)
            .maybeSingle()
        : { data: null }

      const formatted = formatAccount(account, directoryRow?.user_id || null)
      const filteredSegments = formatted.segments
        .filter(
          (segment) =>
            !segmentSearch ||
            segment.name.toLowerCase().includes(segmentSearch.toLowerCase()) ||
            segment.id.toLowerCase().includes(segmentSearch.toLowerCase())
        )
        .slice(0, segmentLimit)

      const billingLookup = await getStripeAccountForBilling(
        supabase,
        account.user_id,
        account.workspace_id || null,
        "id, user_id, trial_redeemed_with"
      )

      return {
        ...formatted,
        segments: filteredSegments,
        trial_redeem_with:
          billingLookup.source === "workspace" || !account.workspace_id
            ? billingLookup.account?.trial_redeemed_with || null
            : null,
      }
    })
  )

  return json(result)
}

export async function POST(request: Request) {
  const tenant = await resolveTenantContext(request)
  if (!tenant.ok) {
    return errorJson(tenant.error, tenant.status)
  }

  const { context, supabase } = tenant
  if (!canManageOrganization(context.role)) {
    return errorJson("Only owners and admins can manage integrations", 403)
  }

  const body = await readJsonBody(request)
  const id = typeof body.id === "string" ? body.id : ""
  const segmentId =
    typeof body.segment_id === "string" || body.segment_id === null
      ? body.segment_id
      : undefined
  const connectionName =
    typeof body.connection_name === "string" ? body.connection_name : ""

  if (!id) {
    return errorJson("Account ID is required", 400)
  }

  if (segmentId === undefined) {
    return errorJson("Segment ID must be a string or null", 400)
  }

  if (connectionName.length > 64) {
    return errorJson("Connection name must be 64 characters or less", 400)
  }

  type AccountSegments = { id: string; segments: KlaviyoSegment[] }
  const accountQuery = supabase
    .from("klaviyo_accounts")
    .select("id, segments")
    .eq("id", id) as unknown as ScopedQuery<AccountSegments>
  const { data: account, error } = await applyAccountScope(
    accountQuery,
    context
  ).single()

  if (error || !account) {
    return errorJson(error?.message || "Account specified is not available", 403)
  }

  const segments = (account.segments || []) as KlaviyoSegment[]
  const selectedSegment = segmentId
    ? segments.find((segment) => segment.id === segmentId) || null
    : null

  if (segmentId && !selectedSegment) {
    return errorJson("Selected segment does not exist", 400)
  }

  const updateQuery = supabase
    .from("klaviyo_accounts")
    .update({
      selected_segment: selectedSegment,
      fix_typos: Boolean(body.fix_typos),
      full_mailbox_retries: Number(body.full_mailbox_retries || 0),
      greylisted_retries: Number(body.greylisted_retries || 0),
      unexpected_error_retries: Number(body.unexpected_error_retries || 0),
      mail_server_temporary_error_retries: Number(
        body.mail_server_temporary_error_retries || 0
      ),
      connection_name: connectionName,
    })
    .eq("id", id) as unknown as ScopedQuery<AccountSegments>
  await applyAccountScope(updateQuery, context)

  return GET(request)
}
