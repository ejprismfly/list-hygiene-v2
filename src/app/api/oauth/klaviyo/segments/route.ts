import {
  canManageIntegrations,
  canManageOrganization,
  errorJson,
  json,
  readJsonBody,
  resolveTenantContext,
  type TenantContext,
} from "@/lib/api/tenant"
import {
  KlaviyoApiError,
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

async function refreshKlaviyoAccessToken(refreshToken?: string) {
  if (
    !refreshToken ||
    !process.env.NEXT_PUBLIC_KLAVIYO_CLIENT_ID ||
    !process.env.KLAVIYO_CLIENT_SECRET
  ) {
    return null
  }

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
      refresh_token: refreshToken,
    }),
  })
  const tokenJson = (await tokenResponse.json()) as KlaviyoToken

  if (!tokenJson.access_token) {
    throw new Error("Token exchange failed")
  }

  const tokenUpdates: Record<string, unknown> = {
    access_token: tokenJson.access_token,
  }

  if (tokenJson.refresh_token) {
    tokenUpdates.refresh_token = tokenJson.refresh_token
  }

  if (tokenJson.expires_in) {
    tokenUpdates.token_expires_in = new Date(
      Date.now() + Number(tokenJson.expires_in) * 1000
    ).toISOString()
  }

  return {
    accessToken: tokenJson.access_token,
    tokenUpdates,
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
  if (!canManageIntegrations(context.role)) {
    return errorJson("Workspace access is required to manage integrations", 403)
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
    Date.now() >= expiresAt
  ) {
    const refreshedToken = await refreshKlaviyoAccessToken(account.refresh_token)
    if (!refreshedToken) {
      return errorJson("Token exchange failed", 400)
    }
    accessToken = refreshedToken.accessToken
    Object.assign(tokenUpdates, refreshedToken.tokenUpdates)
  }

  let segments: KlaviyoSegment[] | null = null
  try {
    segments = await fetchKlaviyoSegments(accessToken)
  } catch (error) {
    if (
      error instanceof KlaviyoApiError &&
      (error.status === 401 || error.status === 403)
    ) {
      try {
        const refreshedToken = await refreshKlaviyoAccessToken(
          account.refresh_token
        )
        if (refreshedToken) {
          accessToken = refreshedToken.accessToken
          Object.assign(tokenUpdates, refreshedToken.tokenUpdates)
          segments = await fetchKlaviyoSegments(accessToken)
        } else {
          throw error
        }
      } catch (retryError) {
        return errorJson(
          retryError instanceof Error
            ? retryError.message
            : "Unable to refresh segments.",
          502
        )
      }
    } else {
      return errorJson(
        error instanceof Error ? error.message : "Unable to refresh segments.",
        502
      )
    }
  }

  if (!segments) {
    return errorJson(
      "Unable to refresh segments.",
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
