import { NextResponse } from "next/server"
import type Stripe from "stripe"

import {
  buildInvoicePaidUpdate,
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
    duplicates.map((id) => stripe.paymentMethods.detach(id).catch(() => null))
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

  if (stripeAccountId) {
    query.eq("id", stripeAccountId)
  } else {
    query.eq("customer_id", customerId)
  }

  const { data, error } = await query.limit(1).maybeSingle()
  if (error) {
    console.error("Stripe account webhook lookup error:", error)
    throw new Error(error.message || "Unable to look up Stripe account")
  }

  return data
}

async function handleInvoicePaid({
  invoice,
  stripe,
  supabase,
}: {
  invoice: Stripe.Invoice
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

  if (
    stripeAccount.subscription_id &&
    stripeAccount.subscription_id !== subscriptionId
  ) {
    try {
      const oldSubscription = await stripe.subscriptions.retrieve(
        stripeAccount.subscription_id
      )
      const oldSubscriptionItem = oldSubscription.items.data[0]
      oldCredits = Number(
        oldSubscriptionItem?.plan.metadata?.credits ||
          stripeAccount.credits_plan ||
          0
      )
      await stripe.subscriptions.cancel(stripeAccount.subscription_id, {
        prorate: false,
      })
    } catch (error) {
      console.error("Problem canceling old subscription:", error)
    }
  }

  const planChange = buildInvoicePaidUpdate({
    billingReason,
    currentPeriodEnd: subscriptionItem.current_period_end,
    invoiceId: invoice.id || "",
    newCredits,
    oldCredits,
    overage,
    productId,
    stripeAccount,
    subscriptionId,
  })
  if (!planChange) {
    return
  }

  const { error: updateError } = await supabase
    .from("stripe_accounts")
    .update(planChange.update)
    .eq("id", stripeAccount.id)

  if (updateError) {
    throw new Error(updateError.message)
  }

  if (planChange.history.length) {
    const { error: historyError } = await supabase
      .from("credit_history")
      .insert(planChange.history)

    if (historyError) {
      throw new Error(historyError.message)
    }
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

async function handleSubscriptionDeleted({
  subscription,
  supabase,
}: {
  subscription: Stripe.Subscription
  supabase: ReturnType<typeof createAdminClient>
}) {
  const stripeAccountId = subscription.metadata?.stripe_account_id
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id

  let query = supabase
    .from("stripe_accounts")
    .update({
      active: false,
      subscription_id: null,
      credits_plan: 0,
      credits_remaining: 0,
      credits_turnover: 0,
      overage_plan: 0,
      overage_remaining: 0,
      overage_used: 0,
    })

  query = stripeAccountId
    ? query.eq("id", stripeAccountId)
    : query.eq("customer_id", customerId)

  const { error } = await query
  if (error) {
    throw new Error(error.message)
  }
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
        subscription: event.data.object as Stripe.Subscription,
        supabase,
      })
      break
    default:
      break
  }

  return NextResponse.json({ received: true })
}
