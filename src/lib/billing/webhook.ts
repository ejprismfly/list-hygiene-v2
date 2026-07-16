import type Stripe from "stripe"
import type { SupabaseClient } from "@supabase/supabase-js"

import { isMissingColumnError } from "@/lib/billing/scope"

export type StripeAccountPaymentContext = {
  customer_id: string
  user_id: string
  organization_id?: string | null
  workspace_id?: string | null
}

export type PaymentMethodCacheRow = {
  customer_id: string
  user_id: string
  organization_id: string | null
  workspace_id: string | null
  billing_scope: string
  payment_id: string
  type: string
  brand: string
  last4: number
  exp_month: number
  exp_year: number
  active: boolean
  is_expired: boolean
  is_default: boolean
}

export type StripeAccountWebhookRecord = StripeAccountPaymentContext & {
  id: string
  subscription_id?: string | null
  credits_plan?: number | null
  credits_remaining?: number | null
  credits_used?: number | null
  credits_turnover?: number | null
}

type CreditHistoryRow = {
  user_id: string
  organization_id: string | null
  workspace_id: string | null
  change: number
  remaining: number
  reason: "new" | "upgrade" | "reset" | "renew"
  context: string
}

type InvoiceUpdateInput = {
  billingReason: string
  currentPeriodEnd: number
  invoiceId: string
  newCredits: number
  oldCredits: number
  overage: number
  productId: string
  stripeAccount: StripeAccountWebhookRecord
  subscriptionId: string
}

const supportedInvoiceReasons = new Set([
  "subscription_create",
  "subscription_cycle",
  "subscription_update",
])

function getDefaultPaymentMethodId(
  stripeCustomer: Stripe.Customer | Stripe.DeletedCustomer
) {
  if (stripeCustomer.deleted) {
    return null
  }

  const defaultPaymentMethod =
    stripeCustomer.invoice_settings?.default_payment_method
  if (typeof defaultPaymentMethod === "string") {
    return defaultPaymentMethod
  }

  return defaultPaymentMethod?.id || null
}

function tenantHistoryFields(stripeAccount: StripeAccountWebhookRecord) {
  return {
    user_id: stripeAccount.user_id,
    organization_id: stripeAccount.organization_id || null,
    workspace_id: stripeAccount.workspace_id || null,
  }
}

export function buildPaymentMethodCacheRows(
  paymentMethods: Stripe.PaymentMethod[],
  stripeCustomer: Stripe.Customer | Stripe.DeletedCustomer,
  stripeAccount: StripeAccountPaymentContext,
  now = new Date()
): PaymentMethodCacheRow[] {
  const currentMonth = now.getMonth() + 1
  const currentYear = now.getFullYear()
  const defaultPaymentMethodId = getDefaultPaymentMethodId(stripeCustomer)

  return paymentMethods.map((payment) => {
    const expYear = payment.card?.exp_year || 0
    const expMonth = payment.card?.exp_month || 0
    const isExpired =
      expYear < currentYear ||
      (expYear === currentYear && expMonth < currentMonth)

    return {
      customer_id: stripeAccount.customer_id,
      user_id: stripeAccount.user_id,
      organization_id: stripeAccount.organization_id || null,
      workspace_id: stripeAccount.workspace_id || null,
      billing_scope: stripeAccount.workspace_id ? "workspace" : "user",
      payment_id: payment.id,
      type: payment.type,
      brand: payment.card?.brand || "",
      last4: Number(payment.card?.last4 || 0),
      exp_month: Number(payment.card?.exp_month || 0),
      exp_year: Number(payment.card?.exp_year || 0),
      active: !isExpired,
      is_expired: isExpired,
      is_default: defaultPaymentMethodId === payment.id,
    }
  })
}

export function toLegacyPaymentMethodCacheRows(
  payments: PaymentMethodCacheRow[]
) {
  return payments.map((payment) => ({
    customer_id: payment.customer_id,
    payment_id: payment.payment_id,
    type: payment.type,
    brand: payment.brand,
    last4: payment.last4,
    exp_month: payment.exp_month,
    exp_year: payment.exp_year,
    active: payment.active,
    is_expired: payment.is_expired,
    is_default: payment.is_default,
  }))
}

export function getInvoiceSubscriptionId(invoice: Stripe.Invoice) {
  const parentSubscription =
    invoice.parent?.subscription_details?.subscription
  if (parentSubscription) {
    return String(parentSubscription)
  }

  const legacyInvoice = invoice as Stripe.Invoice & {
    subscription?: string | Stripe.Subscription | null
  }
  if (typeof legacyInvoice.subscription === "string") {
    return legacyInvoice.subscription
  }

  if (legacyInvoice.subscription?.id) {
    return legacyInvoice.subscription.id
  }

  return null
}

export function buildInvoicePaidUpdate(input: InvoiceUpdateInput) {
  const {
    billingReason,
    currentPeriodEnd,
    invoiceId,
    newCredits,
    oldCredits,
    overage,
    productId,
    stripeAccount,
    subscriptionId,
  } = input

  if (!supportedInvoiceReasons.has(billingReason)) {
    return null
  }

  const baseUpdate = {
    plan_id: productId,
    subscription_id: subscriptionId,
    active: true,
    reset_date: new Date(currentPeriodEnd * 1000),
    credits_plan: newCredits,
    overage_plan: overage,
    overage_remaining: overage,
    overage_used: 0,
  }

  if (billingReason === "subscription_cycle") {
    return {
      update: {
        ...baseUpdate,
        credits_remaining: newCredits,
        credits_used: 0,
        credits_turnover: 0,
      },
      history: [
        {
          ...tenantHistoryFields(stripeAccount),
          change: -Number(stripeAccount.credits_remaining || 0),
          reason: "reset",
          remaining: 0,
          context: invoiceId,
        },
        {
          ...tenantHistoryFields(stripeAccount),
          change: newCredits,
          reason: "renew",
          remaining: newCredits,
          context: invoiceId,
        },
      ] satisfies CreditHistoryRow[],
    }
  }

  if (!stripeAccount.subscription_id) {
    return {
      update: {
        ...baseUpdate,
        credits_remaining: newCredits,
        credits_used: 0,
      },
      history: [
        {
          ...tenantHistoryFields(stripeAccount),
          change: newCredits,
          reason: "new",
          remaining: newCredits,
          context: invoiceId,
        },
      ] satisfies CreditHistoryRow[],
    }
  }

  if (newCredits > oldCredits) {
    const remaining = Number(stripeAccount.credits_remaining || 0) + newCredits
    return {
      update: {
        ...baseUpdate,
        credits_remaining: remaining,
        credits_used: Number(stripeAccount.credits_used || 0),
        credits_turnover:
          Number(stripeAccount.credits_plan || 0) +
          Number(stripeAccount.credits_turnover || 0),
      },
      history: [
        {
          ...tenantHistoryFields(stripeAccount),
          change: newCredits,
          reason: "upgrade",
          remaining,
          context: invoiceId,
        },
      ] satisfies CreditHistoryRow[],
    }
  }

  return {
    update: {
      ...baseUpdate,
      credits_remaining: Number(stripeAccount.credits_remaining || 0),
      credits_used: Number(stripeAccount.credits_used || 0),
      credits_turnover: 0,
    },
    history: [] as CreditHistoryRow[],
  }
}

export async function cachePaymentMethods({
  stripe,
  stripeAccount,
  supabase,
}: {
  stripe: Stripe
  stripeAccount: StripeAccountWebhookRecord
  supabase: SupabaseClient
}) {
  const stripeCustomer = await stripe.customers.retrieve(
    stripeAccount.customer_id
  )
  const paymentMethodsResponse = await stripe.customers.listPaymentMethods(
    stripeAccount.customer_id
  )
  let payments = buildPaymentMethodCacheRows(
    paymentMethodsResponse.data,
    stripeCustomer,
    stripeAccount
  )

  if (payments.length === 1) {
    const singlePayment = payments.find((payment) => payment.payment_id)
    if (singlePayment) {
      await stripe.customers.update(stripeAccount.customer_id, {
        invoice_settings: {
          default_payment_method: singlePayment.payment_id,
        },
      })
      singlePayment.is_default = true
      payments = [singlePayment]
    }
  }

  const { error: deleteError } = await supabase
    .from("stripe_payment_methods")
    .delete()
    .eq("customer_id", stripeAccount.customer_id)

  if (deleteError) {
    console.error("Payment method cache delete error:", deleteError)
  }

  if (!payments.length) {
    return
  }

  const { error: insertError } = await supabase
    .from("stripe_payment_methods")
    .insert(payments)

  if (!insertError) {
    return
  }

  if (!isMissingColumnError(insertError)) {
    console.error("Payment method cache insert error:", insertError)
    return
  }

  const { error: legacyInsertError } = await supabase
    .from("stripe_payment_methods")
    .insert(toLegacyPaymentMethodCacheRows(payments))

  if (legacyInsertError) {
    console.error("Payment method legacy cache insert error:", legacyInsertError)
  }
}
