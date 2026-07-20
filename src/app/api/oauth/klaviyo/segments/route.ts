import {
  canManageOrganization,
  errorJson,
  json,
  readJsonBody,
  resolveTenantContext,
  type TenantContext,
} from "@/lib/api/tenant"
import {
  fetchKlaviyoSegments,
  sortAndMapSegments,
  type KlaviyoSegment,
} from "@/lib/klaviyo-segments"

type SegmentAccount = {
  id: string
  segments: KlaviyoSegment[]
  access_token?: string
  refresh_token?: string
  token_expires_in?: string | null
}

type KlaviyoToken = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
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

export async function GET(request: Request) {
  const tenant = await resolveTenantContext(request)
  if (!tenant.ok) {
    return errorJson(tenant.error, tenant.status)
  }

  const { context, supabase } = tenant
  const url = new URL(request.url)
  const id = url.searchParams.get("id")
  const search = url.searchParams.get("segment_search") || ""
  const limit = Number(url.searchParams.get("segment_limit") || "10")

  if (!id) {
    return errorJson("account id must be a string", 400)
  }

  const accountQuery = supabase
    .from("klaviyo_accounts")
    .select("id, segments")
    .eq("active", true)
    .eq("id", id) as unknown as ScopedQuery<SegmentAccount>
  const { data: account, error } = await applyAccountScope(
    accountQuery,
    context
  ).single()

  if (error || !account) {
    return errorJson(error?.message || "Account specified is not available", 403)
  }

  return json(sortAndMapSegments((account.segments || []) as KlaviyoSegment[], search, limit))
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
  if (!id) {
    return errorJson("Account ID is required", 400)
  }

  const accountQuery = supabase
    .from("klaviyo_accounts")
    .select("id, segments, access_token, refresh_token, token_expires_in")
    .eq("id", id) as unknown as ScopedQuery<SegmentAccount>
  const { data: account, error } = await applyAccountScope(
    accountQuery,
    context
  ).single()

  if (error || !account) {
    return errorJson(error?.message || "Account specified is not available", 403)
  }

  let accessToken = account.access_token as string
  const tokenUpdates: Record<string, unknown> = {}
  const expiresAt = account.token_expires_in
    ? new Date(account.token_expires_in).getTime()
    : 0

  if (
    expiresAt &&
    Date.now() >= expiresAt &&
    account.refresh_token &&
    process.env.NEXT_PUBLIC_KLAVIYO_CLIENT_ID &&
    process.env.KLAVIYO_CLIENT_SECRET
  ) {
    const authKey = Buffer.from(
      `${process.env.NEXT_PUBLIC_KLAVIYO_CLIENT_ID}:${process.env.KLAVIYO_CLIENT_SECRET}`
    ).toString("base64")
    const tokenResponse = await fetch("https://a.klaviyo.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${authKey}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: account.refresh_token,
      }),
    })
    const tokenJson = (await tokenResponse.json()) as KlaviyoToken
    if (!tokenJson.access_token) {
      return errorJson("Token exchange failed", 400)
    }
    accessToken = tokenJson.access_token
    tokenUpdates.access_token = tokenJson.access_token
    if (tokenJson.refresh_token) {
      tokenUpdates.refresh_token = tokenJson.refresh_token
    }
    if (tokenJson.expires_in) {
      tokenUpdates.token_expires_in = new Date(
        Date.now() + Number(tokenJson.expires_in) * 1000
      ).toISOString()
    }
  }

  let segments: KlaviyoSegment[]
  try {
    segments = await fetchKlaviyoSegments(accessToken)
  } catch (error) {
    return errorJson(
      error instanceof Error ? error.message : "Unable to refresh segments.",
      502
    )
  }
  const updateQuery = supabase
    .from("klaviyo_accounts")
    .update({ segments, ...tokenUpdates })
    .eq("id", id) as unknown as ScopedQuery<SegmentAccount>
  const { error: updateError } = await applyAccountScope(updateQuery, context)

  if (updateError) {
    return errorJson(updateError.message)
  }

  return json({
    id,
    segments: sortAndMapSegments(segments, "", 300),
  })
}
