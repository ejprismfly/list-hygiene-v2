import type { SupabaseClient, User } from "@supabase/supabase-js"

import {
  getCurrentUser,
  getDataClient,
  resolveTenantContext,
  shouldUseTenantContext,
  type TenantContext,
} from "@/lib/api/tenant"

export const STRIPE_ACCOUNT_SELECT = [
  "id",
  "user_id",
  "customer_id",
  "subscription_id",
  "plan_id",
  "organization_id",
  "workspace_id",
  "billing_scope",
  "credits_plan",
  "credits_used",
  "credits_remaining",
  "credits_turnover",
  "reset_date",
  "overage_plan",
  "overage_used",
  "overage_remaining",
  "trial_plan",
  "trial_used",
  "trial_remaining",
  "trial_redeemed_with",
].join(", ")

export type BillingAccountSource = "workspace" | "legacy_user" | "none"

export type StripeAccountRecord = {
  id?: string
  user_id?: string
  customer_id?: string | null
  billing_scope?: string | null
  subscription_id?: string | null
  plan_id?: string | null
  organization_id?: string | null
  workspace_id?: string | null
  credits_plan?: number | null
  credits_used?: number | null
  credits_remaining?: number | null
  credits_turnover?: number | null
  reset_date?: string | null
  overage_plan?: number | null
  overage_used?: number | null
  overage_remaining?: number | null
  trial_plan?: number | null
  trial_used?: number | null
  trial_remaining?: number | null
  trial_redeemed_with?: string | null
}

export type BillingScope = {
  user: User
  tenant: TenantContext | null
  organizationId: string | null
  workspaceId: string | null
  legacyFallback: boolean
}

export type BillingContext = BillingScope & {
  supabase: SupabaseClient
  stripeAccount: StripeAccountRecord | null
  accountSource: BillingAccountSource
}

export function isMissingColumnError(error: unknown) {
  const err = error as { code?: string; message?: string }
  return err?.code === "42703" || /column .* does not exist/i.test(err?.message || "")
}

type StripeAccountQueryBuilder = {
  eq: (column: string, value: unknown) => StripeAccountQueryBuilder
  is: (column: string, value: unknown) => StripeAccountQueryBuilder
  limit: (count: number) => {
    maybeSingle: () => Promise<{
      data: StripeAccountRecord | null
      error: { code?: string; message?: string } | null
    }>
  }
}

export async function resolveBillingScope(
  request: Request
): Promise<
  | { ok: true; scope: BillingScope }
  | { ok: false; status: number; error: string }
> {
  if (shouldUseTenantContext(request)) {
    const tenant = await resolveTenantContext(request)
    if (!tenant.ok) {
      return tenant
    }

    return {
      ok: true,
      scope: {
        user: tenant.context.user as User,
        tenant: tenant.context,
        organizationId: tenant.context.legacyFallback
          ? null
          : tenant.context.organizationId,
        workspaceId: tenant.context.legacyFallback
          ? null
          : tenant.context.workspaceId,
        legacyFallback: tenant.context.legacyFallback,
      },
    }
  }

  const user = await getCurrentUser()
  if (!user) {
    return { ok: false, status: 401, error: "Not authenticated" }
  }

  return {
    ok: true,
    scope: {
      user,
      tenant: null,
      organizationId: null,
      workspaceId: null,
      legacyFallback: true,
    },
  }
}

async function queryOneStripeAccount(
  supabase: SupabaseClient,
  select: string,
  buildQuery: (query: StripeAccountQueryBuilder) => StripeAccountQueryBuilder
) {
  const query = buildQuery(
    supabase
      .from("stripe_accounts")
      .select(select) as unknown as StripeAccountQueryBuilder
  )
  const executable = query
  const { data, error } = await executable.limit(1).maybeSingle()

  if (error) {
    if (isMissingColumnError(error)) {
      return { data: null, missingColumn: true }
    }
    console.error("Stripe account lookup error:", error)
  }

  return { data: data || null, missingColumn: false }
}

export async function getStripeAccountForBilling(
  supabase: SupabaseClient,
  userId: string,
  workspaceId: string | null,
  select = STRIPE_ACCOUNT_SELECT
): Promise<{ account: StripeAccountRecord | null; source: BillingAccountSource }> {
  if (workspaceId) {
    const workspaceAccount = await queryOneStripeAccount(
      supabase,
      select,
      (query) => query.eq("workspace_id", workspaceId)
    )

    if (workspaceAccount.data) {
      return { account: workspaceAccount.data, source: "workspace" }
    }

    if (!workspaceAccount.missingColumn) {
      const legacyAccount = await queryOneStripeAccount(
        supabase,
        select,
        (query) => query.eq("user_id", userId).is("workspace_id", null)
      )

      return {
        account: legacyAccount.data,
        source: legacyAccount.data ? "legacy_user" : "none",
      }
    }
  }

  const legacyUserAccount = await queryOneStripeAccount(
    supabase,
    select,
    (query) => query.eq("user_id", userId).is("workspace_id", null)
  )

  if (legacyUserAccount.data) {
    return { account: legacyUserAccount.data, source: "legacy_user" }
  }

  const userAccount = await queryOneStripeAccount(supabase, select, (query) =>
    query.eq("user_id", userId)
  )

  return {
    account: userAccount.data,
    source: userAccount.data ? "legacy_user" : "none",
  }
}

export async function getBillingContext(
  request: Request,
  select = STRIPE_ACCOUNT_SELECT
): Promise<
  | { ok: true; context: BillingContext }
  | { ok: false; status: number; error: string }
> {
  const resolved = await resolveBillingScope(request)
  if (!resolved.ok) {
    return resolved
  }

  const supabase = await getDataClient()
  const { account, source } = await getStripeAccountForBilling(
    supabase,
    resolved.scope.user.id,
    resolved.scope.workspaceId,
    select
  )

  return {
    ok: true,
    context: {
      ...resolved.scope,
      supabase,
      stripeAccount: account,
      accountSource: source,
    },
  }
}

export function getBillingTenantFields(scope: BillingScope) {
  if (!scope.organizationId) {
    return {}
  }

  return {
    organization_id: scope.organizationId,
    workspace_id: scope.workspaceId,
    billing_scope: scope.workspaceId ? "workspace" : "user",
  }
}

export function getScopedBillingAccount(
  context: Pick<BillingContext, "workspaceId" | "accountSource" | "stripeAccount">
) {
  if (context.workspaceId && context.accountSource !== "workspace") {
    return null
  }

  return context.stripeAccount
}

export function appendBillingScopeParams(url: string, scope: BillingScope) {
  const params = new URLSearchParams()
  if (scope.organizationId) {
    params.set("organization_id", scope.organizationId)
  }
  if (scope.workspaceId) {
    params.set("workspace_id", scope.workspaceId)
  }

  const query = params.toString()
  if (!query) {
    return url
  }

  return `${url}${url.includes("?") ? "&" : "?"}${query}`
}

export async function updateStripeAccountById(
  supabase: SupabaseClient,
  stripeAccount: StripeAccountRecord,
  update: Record<string, unknown>
) {
  if (stripeAccount.id) {
    return await supabase
      .from("stripe_accounts")
      .update(update)
      .eq("id", stripeAccount.id)
  }

  return await supabase
    .from("stripe_accounts")
    .update(update)
    .eq("user_id", stripeAccount.user_id)
}
