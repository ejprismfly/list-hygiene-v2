import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import type Stripe from "stripe"

import {
  cachePaymentMethods,
  getInvoiceSubscriptionId,
  type StripeAccountWebhookRecord,
} from "@/lib/billing/webhook"
import { getStripeClient } from "@/lib/billing/stripe"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"

type StripeAccountQuery = {
  eq: (column: string, value: unknown) => StripeAccountQuery
  limit: (count: number) => {
    maybeSingle: () => Promise<{
      data: StripeAccountWebhookRecord | null
      error: { message?: string } | null
    }>
  }
}

type EventLease = { event: string; lease: string }
async function claimWebhookEvent(supabase: ReturnType<typeof createAdminClient>, event: Stripe.Event, lease: string) {
  const { data, error } = await supabase.rpc("claim_billing_event", { p_event: event.id, p_type: event.type, p_lease: lease })
  if (error) throw new Error("Unable to claim billing event")
  if (!["claimed", "processed", "busy"].includes(data)) throw new Error("Invalid billing claim")
  return data as string
}
async function finishWebhookEvent(supabase: ReturnType<typeof createAdminClient>, context: EventLease, failure?: unknown) {
  const { data, error } = await supabase.rpc("finish_billing_event", {
    p_event: context.event, p_lease: context.lease, p_error: failure ? "Webhook processing failed" : null,
  })
  if (error || !data) throw new Error("Unable to finish billing event")
}

async function setDefaultPaymentMethodFromCheckout(
  stripe: Stripe,
  session: Stripe.Checkout.Session
) {
  const customerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id
  if (!customerId) {
    return null
  }

  let paymentMethodId: string | null = null
  if (session.mode === "payment" && session.payment_intent) {
    const intentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent.id
    const paymentIntent = await stripe.paymentIntents.retrieve(intentId)
    paymentMethodId =
      typeof paymentIntent.payment_method === "string"
        ? paymentIntent.payment_method
        : paymentIntent.payment_method?.id || null
  } else if (session.mode === "setup" && session.setup_intent) {
    const intentId =
      typeof session.setup_intent === "string"
        ? session.setup_intent
        : session.setup_intent.id
    const setupIntent = await stripe.setupIntents.retrieve(intentId)
    paymentMethodId =
      typeof setupIntent.payment_method === "string"
        ? setupIntent.payment_method
        : setupIntent.payment_method?.id || null
  } else if (session.mode === "subscription" && session.subscription) {
    const subscriptionId =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription.id
    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ["default_payment_method", "latest_invoice.payment_intent"],
    })
    const defaultPaymentMethod = subscription.default_payment_method
    if (typeof defaultPaymentMethod === "string") {
      paymentMethodId = defaultPaymentMethod
    } else if (defaultPaymentMethod?.id) {
      paymentMethodId = defaultPaymentMethod.id
    } else {
      const latestInvoice = subscription.latest_invoice as
        | (Stripe.Invoice & {
            payment_intent?: string | Stripe.PaymentIntent | null
          })
        | string
        | null
      const paymentIntent =
        latestInvoice && typeof latestInvoice !== "string"
          ? latestInvoice.payment_intent
          : null

      if (typeof paymentIntent === "string") {
        const intent = await stripe.paymentIntents.retrieve(paymentIntent)
        paymentMethodId =
          typeof intent.payment_method === "string"
            ? intent.payment_method
            : intent.payment_method?.id || null
      } else if (paymentIntent?.payment_method) {
        paymentMethodId =
          typeof paymentIntent.payment_method === "string"
            ? paymentIntent.payment_method
            : paymentIntent.payment_method?.id || null
      }
    }
  }

  if (!paymentMethodId) {
    return null
  }

  const newPaymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId)
  const fingerprint = newPaymentMethod.card?.fingerprint
  if (!fingerprint) {
    return
  }

  const { data: paymentMethods } = await stripe.paymentMethods.list({
    customer: customerId,
    type: "card",
  })
  const duplicates = paymentMethods
    .filter((paymentMethod) => paymentMethod.card?.fingerprint === fingerprint)
    .map((paymentMethod) => paymentMethod.id)
    .filter((id) => id !== paymentMethodId)

  await Promise.all(
    duplicates.map((id) => stripe.paymentMethods.detach(id))
  )
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  })

  return paymentMethodId
}

async function findStripeAccount({
  customerId,
  stripeAccountId,
  supabase,
}: {
  customerId: string
  stripeAccountId?: string | null
  supabase: ReturnType<typeof createAdminClient>
}) {
  const stripeAccountSelect =
    "id, user_id, customer_id, subscription_id, organization_id, workspace_id, credits_plan, credits_remaining, credits_used, credits_turnover"
  const query = supabase
    .from("stripe_accounts")
    .select(stripeAccountSelect) as unknown as StripeAccountQuery

  query.eq("customer_id", customerId)
  if (stripeAccountId) query.eq("id", stripeAccountId)

  const { data, error } = await query.limit(1).maybeSingle()
  if (error) {
    console.error("Stripe account webhook lookup error:", error)
    throw new Error(error.message || "Unable to look up Stripe account")
  }

  return data
}

async function handleInvoicePaid({
  invoice,
  context,
  stripe,
  supabase,
}: {
  invoice: Stripe.Invoice
  context: EventLease
  stripe: Stripe
  supabase: ReturnType<typeof createAdminClient>
}) {
  const billingReason = String(invoice.billing_reason || "")
  const subscriptionId = getInvoiceSubscriptionId(invoice)
  const customerId =
    typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id

  if (!subscriptionId || !customerId) {
    return
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  if (subscription.status === "canceled") return
  const stripeAccount = await findStripeAccount({
    customerId,
    stripeAccountId: subscription.metadata?.stripe_account_id || null,
    supabase,
  })
  if (!stripeAccount) {
    return
  }

  const [subscriptionItem] = subscription.items.data
  if (!subscriptionItem) {
    return
  }

  const productId =
    typeof subscriptionItem.plan.product === "string"
      ? subscriptionItem.plan.product
      : subscriptionItem.plan.product?.id
  if (!productId) {
    return
  }
  const newCredits = Number(subscriptionItem.plan.metadata?.credits || 0)
  const overage = Number(subscriptionItem.plan.metadata?.overage || 0)
  let oldCredits = Number(stripeAccount.credits_plan || 0)

  if (!["subscription_create", "subscription_cycle", "subscription_update"].includes(billingReason)) return
  if (stripeAccount.subscription_id && stripeAccount.subscription_id !== subscriptionId) {
    const oldSubscription = await stripe.subscriptions.retrieve(stripeAccount.subscription_id)
    oldCredits = Number(oldSubscription.items.data[0]?.plan.metadata?.credits || stripeAccount.credits_plan || 0)
  }
  const { data: effect, error } = await supabase.rpc("apply_billing_invoice", {
    p_event: context.event, p_lease: context.lease, p_invoice: invoice.id, p_invoice_created: invoice.created,
    p_account: stripeAccount.id, p_customer: customerId, p_subscription: subscriptionId,
    p_reason: billingReason, p_period_end: new Date(subscriptionItem.current_period_end * 1000).toISOString(),
    p_product: productId, p_credits: newCredits, p_old_credits: oldCredits, p_overage: overage,
  })
  if (error || !effect) throw new Error("Unable to commit invoice credits")
  if (effect.ignored) return
  if (effect.old_subscription_id && !effect.cancellation_done) {
    const old = await stripe.subscriptions.retrieve(effect.old_subscription_id)
    const oldCustomer = typeof old.customer === "string" ? old.customer : old.customer.id
    if (oldCustomer !== customerId || (old.metadata?.stripe_account_id && old.metadata.stripe_account_id !== String(stripeAccount.id))) {
      throw new Error("Previous subscription ownership mismatch")
    }
    if (old.status !== "canceled") await stripe.subscriptions.cancel(old.id, { prorate: false })
    const { error: cancelError } = await supabase.rpc("finish_invoice_cancellation", {
      p_event: context.event, p_lease: context.lease, p_invoice: invoice.id, p_invoice_created: invoice.created,
    })
    if (cancelError) throw new Error("Unable to record subscription cancellation")
  }

  await cachePaymentMethods({ stripe, stripeAccount, supabase })
}

async function syncPaymentMethodsForCustomer({
  customerId,
  stripe,
  stripeAccountId,
  supabase,
}: {
  customerId?: string | null
  stripe: Stripe
  stripeAccountId?: string | null
  supabase: ReturnType<typeof createAdminClient>
}) {
  if (!customerId) {
    return
  }

  const stripeAccount = await findStripeAccount({
    customerId,
    stripeAccountId,
    supabase,
  })
  if (!stripeAccount) {
    return
  }

  await cachePaymentMethods({ stripe, stripeAccount, supabase })
}

async function handleInvoicePaymentFailed({
  invoice,
  stripe,
  supabase,
}: {
  invoice: Stripe.Invoice
  stripe: Stripe
  supabase: ReturnType<typeof createAdminClient>
}) {
  const subscriptionId = getInvoiceSubscriptionId(invoice)
  const customerId =
    typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id
  let stripeAccountId: string | null = null

  if (subscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId)
    stripeAccountId = subscription.metadata?.stripe_account_id || null
  }

  await syncPaymentMethodsForCustomer({
    customerId,
    stripe,
    stripeAccountId,
    supabase,
  })
}

async function handleSubscriptionDeleted({ subscription, supabase, context }: {
  subscription: Stripe.Subscription; supabase: ReturnType<typeof createAdminClient>; context: EventLease
}) {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id
  const { error } = await supabase.rpc("apply_subscription_deletion", {
    p_event: context.event, p_lease: context.lease, p_customer: customerId,
    p_subscription: subscription.id, p_account: subscription.metadata?.stripe_account_id || null,
  })
  if (error) throw new Error("Unable to commit subscription cancellation")
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature")
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!signature || !webhookSecret) {
    return NextResponse.json(
      { error: "Stripe webhook signature is not configured." },
      { status: 400 }
    )
  }

  const stripe = getStripeClient()
  const rawBody = await request.text()
  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown webhook signature error"
    console.error("Stripe webhook signature error:", message)
    return new NextResponse(`Webhook Error: ${message}`, { status: 400 })
  }

  const supabase = createAdminClient()

  const context = { event: event.id, lease: randomUUID() }
  let claim: string
  try {
    claim = await claimWebhookEvent(supabase, event, context.lease)
  } catch (error) {
    console.error("Stripe webhook claim failed:", error)
    return NextResponse.json({ error: "Unable to claim webhook event" }, { status: 500 })
  }
  if (claim === "busy") return NextResponse.json({ error: "Webhook already processing" }, { status: 503 })
  if (claim === "processed") {
    return NextResponse.json({ received: true, duplicate: true })
  }

  try {
    switch (event.type) {
    case "checkout.session.completed":
      {
        const session = event.data.object as Stripe.Checkout.Session
        await setDefaultPaymentMethodFromCheckout(stripe, session)
        const customerId =
          typeof session.customer === "string"
            ? session.customer
            : session.customer?.id

        await syncPaymentMethodsForCustomer({
          customerId,
          stripe,
          stripeAccountId: session.metadata?.stripe_account_id || null,
          supabase,
        })
      }
      break
    case "invoice.paid":
      await handleInvoicePaid({
        context,
        invoice: event.data.object as Stripe.Invoice,
        stripe,
        supabase,
      })
      break
    case "invoice.payment_failed":
      await handleInvoicePaymentFailed({
        invoice: event.data.object as Stripe.Invoice,
        stripe,
        supabase,
      })
      break
    case "customer.updated":
      await syncPaymentMethodsForCustomer({
        customerId: (event.data.object as Stripe.Customer).id,
        stripe,
        supabase,
      })
      break
    case "payment_method.attached":
    case "payment_method.detached":
      {
        const paymentMethod = event.data.object as Stripe.PaymentMethod
        const previousAttributes = event.data.previous_attributes as
          | { customer?: string | Stripe.Customer | null }
          | undefined
        const previousCustomer = previousAttributes?.customer
        const customerId =
          typeof paymentMethod.customer === "string"
            ? paymentMethod.customer
            : paymentMethod.customer?.id ||
              (typeof previousCustomer === "string"
                ? previousCustomer
                : previousCustomer?.id || null)

        await syncPaymentMethodsForCustomer({
          customerId,
          stripe,
          supabase,
        })
      }
      break
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted({
        context,
        subscription: event.data.object as Stripe.Subscription,
        supabase,
      })
      break
      default:
        break
    }
  } catch (error) {
    console.error(`Stripe webhook ${event.id} failed:`, error)
    try { await finishWebhookEvent(supabase, context, error) } catch { console.error("Billing failure recording failed") }
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 })
  }

  try { await finishWebhookEvent(supabase, context) } catch {
    return NextResponse.json({ error: "Webhook finalization failed" }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
