import {
  canManageOrganization,
  errorJson,
  json,
  readJsonBody,
  resolveTenantContext,
  type TenantContext,
} from "@/lib/api/tenant"

type KlaviyoSegment = {
  id: string
  attributes?: {
    name?: string
    created?: string
  }
}

type SegmentAccount = {
  id: string
  segments: KlaviyoSegment[]
  access_token?: string
  refresh_token?: string
  token_expires_in?: string | null
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

function sortAndMapSegments(segments: KlaviyoSegment[], search = "", limit = 10) {
  return segments
    .sort((a, b) => {
      const aDate = new Date(a.attributes?.created || 0).getTime()
      const bDate = new Date(b.attributes?.created || 0).getTime()
      return bDate - aDate
    })
    .filter(
      (segment) =>
        !search ||
        (segment.attributes?.name || "")
          .toLowerCase()
          .includes(search.toLowerCase()) ||
        segment.id.toLowerCase().includes(search.toLowerCase())
    )
    .slice(0, limit)
    .map((segment) => ({
      id: segment.id,
      name: segment.attributes?.name || segment.id,
    }))
}

async function fetchKlaviyoSegments(accessToken: string, limit = 300) {
  const response = await fetch(
    `https://a.klaviyo.com/api/segments/?page[size]=${limit}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Revision: "2024-10-15",
      },
    }
  )
  const data = await response.json()
  return Array.isArray(data.data) ? data.data : []
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
    const tokenJson = await tokenResponse.json()
    if (!tokenJson.access_token) {
      return errorJson("Token exchange failed", 400)
    }
    accessToken = tokenJson.access_token
  }

  const segments = await fetchKlaviyoSegments(accessToken)
  const updateQuery = supabase
    .from("klaviyo_accounts")
    .update({ segments })
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
