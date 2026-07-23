import type Stripe from "stripe"

import { canManageBilling, errorJson, json } from "@/lib/api/tenant"
import { appHost, getStripeClient } from "@/lib/billing/stripe"
import {
  appendBillingScopeParams,
  getBillingContext,
  getScopedBillingAccount,
  STRIPE_ACCOUNT_SELECT,
} from "@/lib/billing/scope"

export type BillingProductItem = Stripe.Product & {
  prices?: Stripe.Price[]
  selected?: boolean
  checkout_url?: string | null
  action_label?: string | null
  display_price?: string | null
  display_credits?: string | null
  display_per_unit?: string | null
}

function formatCurrency(num: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(num)
}

function formatResetDateOnly(dateStr: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(dateStr))
}

function parseNumberRange(input?: string) {
  if (!input) {
    return null
  }

  if (input.includes("-")) {
    const [minStr, maxStr] = input.split("-")
    const min = Number(minStr)
    const max = Number(maxStr)
    if (Number.isNaN(min) || Number.isNaN(max) || min >= max) {
      return null
    }
    return { min, max }
  }

  const max = Number(input)
  if (Number.isNaN(max)) {
    return null
  }
  return { min: 0, max }
}

export async function GET(request: Request) {
  const billing = await getBillingContext(request, STRIPE_ACCOUNT_SELECT)
  if (!billing.ok) {
    return errorJson(billing.error, billing.status)
  }

  const billingHost = appHost(request)
  const stripeAccount = getScopedBillingAccount(billing.context)
  const canManage =
    billing.context.legacyFallback ||
    canManageBilling(billing.context.tenant?.role ?? null)
  const currentCreditsPlan = Number(stripeAccount?.credits_plan || 0)
  const creditsUsed = Number(stripeAccount?.credits_used || 0)
  const creditsRemaining = Number(stripeAccount?.credits_remaining || 0)
  const creditsTurnover = Number(stripeAccount?.credits_turnover || 0)
  const trialPlan = Number(stripeAccount?.trial_plan || 0)
  const trialUsed = Number(stripeAccount?.trial_used || 0)
  const trialRemaining = Number(stripeAccount?.trial_remaining || 0)
  const overagePlan = Number(stripeAccount?.overage_plan || 0)
  const overageUsed = Number(stripeAccount?.overage_used || 0)
  const overageRemaining = Number(stripeAccount?.overage_remaining || 0)
  const resetDate = stripeAccount?.reset_date || ""
  const trialCompleted = trialPlan === 0 || trialUsed >= trialPlan

  let items: BillingProductItem[] = []
  const customer = { id: "", name: "-", email: "-" }
  let payments: {
    id: string
    type: string
    brand: string
    last4: string
    exp_month: string
    exp_year: string
    active: boolean
    is_expired: boolean
    is_default: boolean
    set_default_url?: string
  }[] = []

  if (process.env.STRIPE_SECRET_KEY) {
    const stripe = getStripeClient()
    const { data: products } = await stripe.products.list({
      active: true,
      limit: 100,
    })

    items = products
      .filter((product) => product.metadata?.active)
      .sort(
        (a, b) =>
          Number(a.metadata.credits || 0) - Number(b.metadata.credits || 0)
      )

    items = await Promise.all(
      items.map(async (item) => {
        const { data: prices } = await stripe.prices.list({ product: item.id })
        const price = prices.find(Boolean)
        const result: BillingProductItem = {
          ...item,
          prices,
          selected: item.id === stripeAccount?.plan_id,
          checkout_url: null,
        }

        if (canManage && !result.selected && price?.id) {
          result.checkout_url = appendBillingScopeParams(
            `${billingHost}/api/billing/checkout?price_id=${price.id}`,
            billing.context
          )
        }

        result.display_price = formatCurrency((price?.unit_amount || 0) / 100)
        result.display_credits = Number(
          price?.metadata?.credits || item.metadata.credits || 0
        ).toLocaleString()
        result.display_per_unit =
          price?.unit_amount && price.metadata?.credits
            ? `$${(
                price.unit_amount /
                100 /
                Number(price.metadata.credits)
              )
                .toFixed(4)
                .replace(/\.?0+$/, "")}`
            : "$0"

        const planCredits = Number(item.metadata.credits || 0)
        if (currentCreditsPlan === planCredits) {
          result.action_label = "Your Plan"
        } else if (currentCreditsPlan > planCredits) {
          result.action_label = "Downgrade"
        } else {
          result.action_label = "Upgrade"
        }

        return result
      })
    )

    if (canManage && stripeAccount?.customer_id) {
      const now = new Date()
      const currentMonth = now.getMonth() + 1
      const currentYear = now.getFullYear()
      const stripeCustomer = await stripe.customers.retrieve(
        stripeAccount.customer_id
      )

      if (!stripeCustomer.deleted) {
        customer.id = stripeCustomer.id
        customer.name = stripeCustomer.name || "-"
        customer.email = stripeCustomer.email || "-"
      }

      const paymentMethodsResponse =
        await stripe.customers.listPaymentMethods(stripeAccount.customer_id)
      payments = paymentMethodsResponse.data.map((payment) => {
        const expYear = payment.card?.exp_year || 0
        const expMonth = payment.card?.exp_month || 0
        const isExpired =
          expYear < currentYear ||
          (expYear === currentYear && expMonth < currentMonth)
        const defaultPaymentMethod = !stripeCustomer.deleted
          ? stripeCustomer.invoice_settings?.default_payment_method
          : null
        const defaultPaymentMethodId =
          typeof defaultPaymentMethod === "string"
            ? defaultPaymentMethod
            : defaultPaymentMethod?.id

        return {
          id: payment.id,
          type: payment.type,
          brand: payment.card?.brand || "",
          last4: payment.card?.last4 || "",
          exp_month: String(payment.card?.exp_month || ""),
          exp_year: String(payment.card?.exp_year || ""),
          active: !isExpired,
          is_expired: isExpired,
          is_default: defaultPaymentMethodId === payment.id,
          set_default_url: `${billingHost}/api/billing/payment?payment_id=${payment.id}`,
        }
      })
    }
  }

  const plan = items.find((item) => item.selected)
  const price = plan?.prices?.find(Boolean)
  const totalPlan = currentCreditsPlan + creditsTurnover
  const account = {
    current_plan: plan?.metadata?.plan_name || plan?.name || (trialPlan ? "Trial" : "None"),
    credits_used: creditsUsed,
    credits_plan: plan ? totalPlan : currentCreditsPlan,
    credits_remaining: creditsRemaining,
    trial_plan: trialPlan,
    trial_used: trialUsed,
    trial_remaining: trialRemaining,
    trial_completed: trialCompleted,
    trial_percentage: trialPlan
      ? `${((trialUsed / trialPlan) * 100).toFixed(2)}%`
      : "0%",
    usage_percentage: totalPlan
      ? `${((creditsUsed / totalPlan) * 100).toFixed(2)}%`
      : "0%",
    reset_date: resetDate ? formatResetDateOnly(resetDate) : "-",
    overage_used: overageUsed,
    overage_plan: overagePlan,
    overage_remaining: overageRemaining,
    overage_percentage: overagePlan
      ? `${((overageUsed / overagePlan) * 100).toFixed(2)}%`
      : "0%",
    total: price?.unit_amount ? formatCurrency(price.unit_amount / 100) : "$0",
    invoice_date: resetDate ? formatResetDateOnly(resetDate) : "-",
  }

  const groups = [
    { label: "<10k", range: "9999", selected: false },
    { label: "10k to 50k", range: "10000-50000", selected: false },
    { label: "50k to 1m", range: "50000-1000000", selected: false },
    { label: "Enterprise", range: "enterprise", selected: false },
  ]

  const plans = groups.map((group) => {
    const numberRange = parseNumberRange(group.range)
    if (!numberRange) {
      return group
    }

    const rows = items.filter((item) => {
      const credits = Number(item.metadata.credits || 0)
      return credits >= numberRange.min && credits <= numberRange.max
    })

    return {
      ...group,
      selected: rows.some((item) => item.selected),
      rows,
    }
  })

  return json({
    account,
    plans,
    items,
    customer,
    payments,
    portal: canManage ? `${billingHost}/api/billing/portal` : null,
    permissions: {
      can_manage_billing: canManage,
    },
    billing_context: {
      customer_id: stripeAccount?.customer_id || null,
      organization_id: billing.context.organizationId,
      workspace_id: billing.context.workspaceId,
      account_source: stripeAccount ? billing.context.accountSource : "none",
      billing_scope: billing.context.workspaceId ? "workspace" : "user",
    },
  })
}
