import { NextResponse } from "next/server"

import { errorJson } from "@/lib/api/tenant"
import { appHost, getStripeClient } from "@/lib/billing/stripe"
import { getBillingContext, getScopedBillingAccount } from "@/lib/billing/scope"

export async function GET(request: Request) {
  const billing = await getBillingContext(
    request,
    "id, user_id, customer_id, organization_id, workspace_id"
  )
  if (!billing.ok) {
    return errorJson(billing.error, billing.status)
  }

  const stripeAccount = getScopedBillingAccount(billing.context)
  if (!stripeAccount?.customer_id) {
    const referer = request.headers.get("referer") || "/billing"
    return NextResponse.redirect(new URL(referer, request.url), 303)
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return errorJson("STRIPE_SECRET_KEY is not configured.", 500)
  }

  const stripe = getStripeClient()
  const session = await stripe.billingPortal.sessions.create({
    customer: stripeAccount.customer_id,
    return_url: `${appHost()}/billing`,
  })

  return NextResponse.redirect(session.url, 302)
}
