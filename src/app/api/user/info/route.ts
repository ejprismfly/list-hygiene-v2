import { errorJson, json } from "@/lib/api/tenant"
import { appHost, getStripeClient } from "@/lib/billing/stripe"
import {
  getBillingContext,
  getScopedBillingAccount,
  STRIPE_ACCOUNT_SELECT,
} from "@/lib/billing/scope"

export async function GET(request: Request) {
  const billing = await getBillingContext(request, STRIPE_ACCOUNT_SELECT)
  if (!billing.ok) {
    return errorJson(billing.error, billing.status)
  }

  const { user } = billing.context
  const stripeAccount = getScopedBillingAccount(billing.context)
  const billingHost = appHost(request)
  const subscription: {
    name: string | null
    credits: number | null
    price: number | null
    credit_refresh: number | null
  } = {
    name: null,
    credits: null,
    price: null,
    credit_refresh: null,
  }
  const customer: { name: string | null; email: string | null } = {
    name: null,
    email: null,
  }
  let paymentMethods: unknown[] = []

  if (process.env.STRIPE_SECRET_KEY && stripeAccount?.customer_id) {
    const stripe = getStripeClient()

    if (stripeAccount.subscription_id) {
      const subscriptionResponse = await stripe.subscriptions.retrieve(
        stripeAccount.subscription_id
      )
      const item = subscriptionResponse.items.data.find(
        (subscriptionItem) => subscriptionItem.plan.product === stripeAccount.plan_id
      )
      if (item) {
        subscription.name = item.plan.metadata?.plan_name || item.plan.nickname
        subscription.credits = item.plan.metadata?.credits
          ? Number(item.plan.metadata.credits)
          : 0
        subscription.price = item.plan.amount
        subscription.credit_refresh = item.current_period_end
      }
    }

    const paymentMethodsResponse = await stripe.customers.listPaymentMethods(
      stripeAccount.customer_id
    )
    const now = new Date()
    const currentMonth = now.getMonth() + 1
    const currentYear = now.getFullYear()
    paymentMethods = paymentMethodsResponse.data.map((payment) => {
      const expYear = payment.card?.exp_year || 0
      const expMonth = payment.card?.exp_month || 0
      const isExpired =
        expYear < currentYear ||
        (expYear === currentYear && expMonth < currentMonth)

      return {
        id: payment.id,
        type: payment.type,
        brand: payment.card?.brand,
        last4: payment.card?.last4,
        exp_month: payment.card?.exp_month,
        exp_year: payment.card?.exp_year,
        active: !isExpired,
        set_default_url: `${billingHost}/api/billing/payment?payment_id=${payment.id}`,
      }
    })

    const stripeCustomer = await stripe.customers.retrieve(
      stripeAccount.customer_id
    )
    if (!stripeCustomer.deleted) {
      customer.name = stripeCustomer.name || null
      customer.email = stripeCustomer.email
    }
  }

  return json({
    id: user.id,
    email: user.email,
    created_at: user.created_at,
    user_metadata: user.user_metadata,
    payment_methods: paymentMethods,
    customer,
    subscription,
    portal: `${billingHost}/api/billing/portal`,
    credits_remaining: stripeAccount?.credits_remaining || 0,
    credits_used: stripeAccount?.credits_used || 0,
    credits_plan: stripeAccount?.credits_plan || 0,
    overage_remaining: stripeAccount?.overage_remaining || 0,
    overage_used: stripeAccount?.overage_used || 0,
    overage_plan: stripeAccount?.overage_plan || 0,
    trial_plan: stripeAccount?.trial_plan || 0,
    trial_remaining: stripeAccount?.trial_remaining || 0,
    trial_used: stripeAccount?.trial_used || 0,
  })
}
