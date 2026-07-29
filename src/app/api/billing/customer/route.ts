import {
  getBillingContext,
  getScopedBillingAccount,
} from "@/lib/billing/scope"
import { canManageBilling, errorJson, json } from "@/lib/api/tenant"
import { ensureScopedStripeCustomer } from "@/lib/billing/customer"
import { getStripeClient } from "@/lib/billing/stripe"

type PaidSubscriptionPayload = {
  transaction_id: string
  transaction_value: number
  transaction_currency: string
  customer_email: string | null
}

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

function getStripeObjectId(value: unknown) {
  if (!value) {
    return null
  }

  if (typeof value === "string") {
    return value
  }

  if (typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id
    return typeof id === "string" ? id : null
  }

  return null
}

function getInvoiceAmountPaid(value: unknown) {
  if (!value || typeof value === "string" || typeof value !== "object") {
    return null
  }

  const amountPaid = (value as { amount_paid?: unknown }).amount_paid
  return typeof amountPaid === "number" ? amountPaid : null
}

async function getPaidSubscriptionPayload({
  scopedCustomerId,
  sessionId,
}: {
  scopedCustomerId?: string | null
  sessionId?: string | null
}): Promise<PaidSubscriptionPayload | null> {
  if (!sessionId || !scopedCustomerId || !process.env.STRIPE_SECRET_KEY) {
    return null
  }

  const stripe = getStripeClient()
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["customer", "invoice", "subscription"],
  })
  const sessionCustomerId = getStripeObjectId(session.customer)

  if (
    session.mode !== "subscription" ||
    session.payment_status !== "paid" ||
    sessionCustomerId !== scopedCustomerId
  ) {
    return null
  }

  const amountPaidCents =
    getInvoiceAmountPaid(session.invoice) ??
    (typeof session.amount_total === "number" ? session.amount_total : null)
  if (!amountPaidCents || amountPaidCents <= 0) {
    return null
  }

  const transactionId = getStripeObjectId(session.subscription) || session.id
  const stripeCustomer = session.customer
  const customerEmail =
    session.customer_details?.email ||
    session.customer_email ||
    (stripeCustomer && typeof stripeCustomer === "object" && !stripeCustomer.deleted
      ? stripeCustomer.email
      : null) ||
    null

  return {
    transaction_id: transactionId,
    transaction_value: Number((amountPaidCents / 100).toFixed(2)),
    transaction_currency: (session.currency || "usd").toUpperCase(),
    customer_email: customerEmail,
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const sessionId = url.searchParams.get("session_id")
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

  const canManage =
    billing.context.legacyFallback ||
    canManageBilling(billing.context.tenant?.role ?? null)
  const stripeAccount = getScopedBillingAccount(billing.context)
  const fallbackAccount = stripeAccount ? null : billing.context.stripeAccount
  const scopedCustomerId = stripeAccount?.customer_id || fallbackAccount?.customer_id || null
  let paidSubscription: PaidSubscriptionPayload | null = null

  if (canManage && sessionId) {
    try {
      paidSubscription = await getPaidSubscriptionPayload({
        scopedCustomerId,
        sessionId,
      })
    } catch (error) {
      console.error("Paid subscription verification failed:", error)
    }
  }

  return json({
    customer_id: canManage ? stripeAccount?.customer_id || null : null,
    fallback_customer_id: canManage ? fallbackAccount?.customer_id || null : null,
    user_id: billing.context.user.id,
    organization_id: billing.context.organizationId,
    workspace_id: billing.context.workspaceId,
    billing_scope: billing.context.workspaceId ? "workspace" : "user",
    account_source: stripeAccount ? billing.context.accountSource : "none",
    is_legacy_fallback: Boolean(
      billing.context.workspaceId && fallbackAccount?.customer_id
    ),
    has_customer: canManage && Boolean(stripeAccount?.customer_id),
    permissions: {
      can_manage_billing: canManage,
    },
    paid_subscription: paidSubscription,
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

  if (
    !billing.context.legacyFallback &&
    !canManageBilling(billing.context.tenant?.role ?? null)
  ) {
    return errorJson("Only owners and admins can manage billing", 403)
  }

  const { user } = billing.context
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

  const customer = await ensureScopedStripeCustomer(billing.context)

  return json({ customer_id: customer.customerId, user_id: user.id })
}
