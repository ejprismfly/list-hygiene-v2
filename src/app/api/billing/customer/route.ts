import {
  createStripeCustomer,
  getOrCreateStripeCustomerByEmail,
} from "@/lib/billing/stripe"
import {
  getBillingContext,
  getBillingTenantFields,
  getScopedBillingAccount,
  updateStripeAccountById,
} from "@/lib/billing/scope"
import { errorJson, json } from "@/lib/api/tenant"

const BILLING_CONTEXT_TIMEOUT_MS = 6000

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Billing customer lookup timed out")),
          timeoutMs
        )
      }),
    ])
  } finally {
    if (timeout) {
      clearTimeout(timeout)
    }
  }
}

export async function GET(request: Request) {
  let billing: Awaited<ReturnType<typeof getBillingContext>>
  try {
    billing = await withTimeout(
      getBillingContext(
        request,
        "id, user_id, customer_id, subscription_id, organization_id, workspace_id"
      ),
      BILLING_CONTEXT_TIMEOUT_MS
    )
  } catch (error) {
    console.error("Billing customer lookup timed out:", error)
    return errorJson("Billing customer lookup timed out", 504)
  }

  if (!billing.ok) {
    return errorJson(billing.error, billing.status)
  }

  const stripeAccount = getScopedBillingAccount(billing.context)
  const fallbackAccount = stripeAccount ? null : billing.context.stripeAccount

  return json({
    customer_id: stripeAccount?.customer_id || null,
    fallback_customer_id: fallbackAccount?.customer_id || null,
    user_id: billing.context.user.id,
    organization_id: billing.context.organizationId,
    workspace_id: billing.context.workspaceId,
    billing_scope: stripeAccount?.workspace_id ? "workspace" : "user",
    account_source: stripeAccount ? billing.context.accountSource : "none",
    is_legacy_fallback: Boolean(
      billing.context.workspaceId && fallbackAccount?.customer_id
    ),
    has_customer: Boolean(stripeAccount?.customer_id),
  })
}

export async function POST(request: Request) {
  const billing = await getBillingContext(
    request,
    "id, user_id, customer_id, subscription_id, organization_id, workspace_id"
  )
  if (!billing.ok) {
    return errorJson(billing.error, billing.status)
  }

  const { supabase, user, workspaceId } = billing.context
  const stripeAccount = getScopedBillingAccount(billing.context)

  if (!user.email) {
    return errorJson("Not authenticated", 401)
  }

  if (stripeAccount?.customer_id) {
    return json({ customer_id: stripeAccount.customer_id, user_id: user.id })
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return errorJson("STRIPE_SECRET_KEY is not configured.", 500)
  }

  const metadata = {
    user_id: user.id,
    user_email: user.email || "",
    billing_scope: workspaceId ? "workspace" : "user",
    ...(billing.context.organizationId
      ? { organization_id: billing.context.organizationId }
      : {}),
    ...(workspaceId ? { workspace_id: workspaceId } : {}),
  }

  const customer = workspaceId
    ? await createStripeCustomer(
        user.email,
        metadata,
        `customer_create_workspace_${workspaceId}`
      )
    : await getOrCreateStripeCustomerByEmail(user.email, metadata)

  if (stripeAccount) {
    await updateStripeAccountById(supabase, stripeAccount, {
      customer_id: customer.id,
      ...getBillingTenantFields(billing.context),
    })
  } else {
    await supabase.from("stripe_accounts").insert({
      user_id: user.id,
      customer_id: customer.id,
      ...getBillingTenantFields(billing.context),
    })
  }

  return json({ customer_id: customer.id, user_id: user.id })
}
