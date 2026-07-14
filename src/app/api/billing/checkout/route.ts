import { NextResponse } from "next/server"

import { errorJson } from "@/lib/api/tenant"
import {
  appHost,
  createStripeCustomer,
  getOrCreateStripeCustomerByEmail,
  getStripeClient,
} from "@/lib/billing/stripe"
import {
  getBillingContext,
  getBillingTenantFields,
  getScopedBillingAccount,
  updateStripeAccountById,
} from "@/lib/billing/scope"

export async function GET(request: Request) {
  const referer = request.headers.get("referer") || "/billing"
  const url = new URL(request.url)
  const priceId = url.searchParams.get("price_id")

  if (!priceId) {
    return NextResponse.redirect(new URL(referer, request.url), 302)
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return errorJson("STRIPE_SECRET_KEY is not configured.", 500)
  }

  const billing = await getBillingContext(
    request,
    "id, user_id, customer_id, subscription_id, organization_id, workspace_id"
  )
  if (!billing.ok) {
    return errorJson(billing.error, billing.status)
  }

  const { supabase, user, organizationId, workspaceId } = billing.context
  if (!user.email) {
    return errorJson("Not authenticated", 401)
  }

  let stripeAccount = getScopedBillingAccount(billing.context)
  let customerId = stripeAccount?.customer_id

  if (!customerId) {
    const metadata = {
      user_id: user.id,
      user_email: user.email,
      billing_scope: workspaceId ? "workspace" : "user",
      ...(organizationId ? { organization_id: organizationId } : {}),
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
      const { error } = await updateStripeAccountById(supabase, stripeAccount, {
        customer_id: customer.id,
        ...getBillingTenantFields(billing.context),
      })
      if (error) {
        console.error("Checkout update error:", error)
        return NextResponse.redirect(new URL(referer, request.url), 302)
      }
      stripeAccount = { ...stripeAccount, customer_id: customer.id }
    } else {
      const { data: insertedStripeAccount, error } = await supabase
        .from("stripe_accounts")
        .insert({
          user_id: user.id,
          customer_id: customer.id,
          ...getBillingTenantFields(billing.context),
        })
        .select("id, user_id, customer_id, subscription_id, organization_id, workspace_id")
        .single()

      if (error) {
        console.error("Checkout insert error:", error)
        return NextResponse.redirect(new URL(referer, request.url), 302)
      }

      stripeAccount = insertedStripeAccount || {
        user_id: user.id,
        customer_id: customer.id,
        subscription_id: null,
        ...getBillingTenantFields(billing.context),
      }
    }

    customerId = customer.id
  }

  const stripe = getStripeClient()
  const price = await stripe.prices.retrieve(priceId)
  const credits = parseInt(price.metadata?.credits || "0", 10)
  const stripeMetadata = {
    user_id: user.id,
    user_email: user.email,
    ...(stripeAccount?.id ? { stripe_account_id: String(stripeAccount.id) } : {}),
    ...(organizationId ? { organization_id: organizationId } : {}),
    ...(workspaceId ? { workspace_id: workspaceId } : {}),
    billing_scope: workspaceId ? "workspace" : "user",
    credits: credits.toString(),
    old_subscription_id: stripeAccount?.subscription_id || "",
    checkout_url: `${appHost()}/api/billing/checkout?price_id=${priceId}`,
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appHost()}/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appHost()}/billing/failed?cancel=true&session_id={CHECKOUT_SESSION_ID}`,
    metadata: stripeMetadata,
    subscription_data: { metadata: stripeMetadata },
  })

  return NextResponse.redirect(session.url || "/billing", 303)
}
