import { NextResponse } from "next/server"

import { canManageBilling, errorJson } from "@/lib/api/tenant"
import { appHost, getStripeClient } from "@/lib/billing/stripe"
import { ensureScopedStripeCustomer } from "@/lib/billing/customer"
import { getBillingContext } from "@/lib/billing/scope"

export async function GET(request: Request) {
  const billing = await getBillingContext(
    request,
    "id, user_id, customer_id, organization_id, workspace_id"
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

  if (!process.env.STRIPE_SECRET_KEY) {
    return errorJson("STRIPE_SECRET_KEY is not configured.", 500)
  }

  let customerId: string
  try {
    const customer = await ensureScopedStripeCustomer(billing.context)
    customerId = customer.customerId
  } catch (error) {
    return errorJson(
      error instanceof Error ? error.message : "Unable to create billing customer",
      500
    )
  }

  const stripe = getStripeClient()
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${appHost(request)}/billing`,
  })

  return NextResponse.redirect(session.url, 302)
}
