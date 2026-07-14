import {
  canManageOrganization,
  errorJson,
  json,
  readJsonBody,
  resolveTenantContext,
  type TenantContext,
} from "@/lib/api/tenant"

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

  type DisconnectAccount = {
    access_token: string | null
    refresh_token: string | null
    active: boolean
  }
  const accountQuery = supabase
    .from("klaviyo_accounts")
    .select("access_token, refresh_token, active")
    .eq("id", id) as unknown as ScopedQuery<DisconnectAccount>
  const { data: account, error } = await applyAccountScope(
    accountQuery,
    context
  ).single()

  if (error || !account) {
    return errorJson(error?.message || "Account specified is not available", 403)
  }

  if (!account.active) {
    return errorJson("Account specified is already disconnected", 400)
  }

  if (
    process.env.NEXT_PUBLIC_KLAVIYO_CLIENT_ID &&
    process.env.KLAVIYO_CLIENT_SECRET &&
    account.access_token
  ) {
    const authKey = Buffer.from(
      `${process.env.NEXT_PUBLIC_KLAVIYO_CLIENT_ID}:${process.env.KLAVIYO_CLIENT_SECRET}`
    ).toString("base64")

    await fetch("https://a.klaviyo.com/oauth/revoke", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${authKey}`,
      },
      body: new URLSearchParams({
        token: account.access_token,
        token_type_hint: "refresh_token",
      }),
    }).catch((error) => {
      console.error("Klaviyo revoke failed:", error)
    })
  }

  const updateQuery = supabase
    .from("klaviyo_accounts")
    .update({ active: false })
    .eq("id", id) as unknown as ScopedQuery<DisconnectAccount>
  const { error: updateError } = await applyAccountScope(updateQuery, context)

  if (updateError) {
    return errorJson(updateError.message)
  }

  return json({ id, active: false })
}
