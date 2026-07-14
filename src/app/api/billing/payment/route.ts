import { errorJson, json, readJsonBody } from "@/lib/api/tenant"
import { getStripeClient } from "@/lib/billing/stripe"
import {
  getBillingContext,
  getScopedBillingAccount,
  isMissingColumnError,
} from "@/lib/billing/scope"

export async function POST(request: Request) {
  const body = await readJsonBody(request)
  const paymentId = typeof body.payment_id === "string" ? body.payment_id : ""

  if (!paymentId) {
    return errorJson("payment_id must be a string.", 400)
  }

  const billing = await getBillingContext(
    request,
    "id, user_id, customer_id, subscription_id, organization_id, workspace_id"
  )
  if (!billing.ok) {
    return errorJson(billing.error, billing.status)
  }

  const { supabase } = billing.context
  const stripeAccount = getScopedBillingAccount(billing.context)
  const customerId = stripeAccount?.customer_id

  if (!customerId) {
    return errorJson("No billing customer for this workspace.", 400)
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return errorJson("STRIPE_SECRET_KEY is not configured.", 500)
  }

  const stripe = getStripeClient()
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentId },
  })

  const tenantUpdate = {
    user_id: stripeAccount.user_id || null,
    organization_id: stripeAccount.organization_id || null,
    workspace_id: stripeAccount.workspace_id || null,
    billing_scope: stripeAccount.workspace_id ? "workspace" : "user",
  }

  const { error: tenantUpdateError } = await supabase
    .from("stripe_payment_methods")
    .update(tenantUpdate)
    .eq("customer_id", customerId)

  if (tenantUpdateError && !isMissingColumnError(tenantUpdateError)) {
    console.error("Payment method tenant cache update error:", tenantUpdateError)
  }

  await supabase
    .from("stripe_payment_methods")
    .update({ is_default: false })
    .eq("customer_id", customerId)

  await supabase
    .from("stripe_payment_methods")
    .update({ is_default: true })
    .eq("customer_id", customerId)
    .or(`payment_id.eq.${paymentId},payment_method_id.eq.${paymentId}`)

  return json({ payment_id: paymentId })
}
