import { errorJson, json } from "@/lib/api/tenant"
import { appHost, getStripeClient } from "@/lib/billing/stripe"
import {
  appendBillingScopeParams,
  getBillingContext,
  getScopedBillingAccount,
} from "@/lib/billing/scope"

function parsePriceRange(input?: string | null) {
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
    return { min: min + 1, max }
  }

  const max = Number(input)
  if (Number.isNaN(max)) {
    return null
  }
  return { min: 0, max }
}

export async function GET(request: Request) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return json([])
  }

  const url = new URL(request.url)
  const limit = Number(url.searchParams.get("limit") || "10")
  const sort = url.searchParams.get("sort") || "created_desc"
  const priceRange = parsePriceRange(url.searchParams.get("price_range"))

  const billing = await getBillingContext(
    request,
    "id, user_id, customer_id, subscription_id, plan_id, credits_plan, organization_id, workspace_id"
  )
  if (!billing.ok) {
    return errorJson(billing.error, billing.status)
  }

  const billingHost = appHost(request)
  const stripeAccount = getScopedBillingAccount(billing.context)
  const currentCreditsPlan = Number(stripeAccount?.credits_plan || 0)
  const stripe = getStripeClient()
  const { data: products } = await stripe.products.list({ active: true })

  let items = products
  if (sort === "created_asc") {
    items = products.sort((a, b) => (a.created ?? 0) - (b.created ?? 0))
  } else if (sort === "amount_asc") {
    items = products.sort(
      (a, b) =>
        Number(a.metadata.credits || 0) - Number(b.metadata.credits || 0)
    )
  } else if (sort === "amount_desc") {
    items = products.sort(
      (a, b) =>
        Number(b.metadata.credits || 0) - Number(a.metadata.credits || 0)
    )
  } else {
    items = products.sort((a, b) => (b.created ?? 0) - (a.created ?? 0))
  }

  const enriched = await Promise.all(
    items.slice(0, limit).map(async (item) => {
      const { data: prices } = await stripe.prices.list({ product: item.id })
      const selected = item.id === stripeAccount?.plan_id
      const planCredits = Number(item.metadata.credits || 0)

      return {
        ...item,
        prices,
        selected,
        checkout_url:
          selected || !prices[0]?.id
            ? null
            : appendBillingScopeParams(
                `${billingHost}/api/billing/checkout?price_id=${prices[0].id}`,
                billing.context
              ),
        action_label:
          currentCreditsPlan === planCredits
            ? "Your Plan"
            : currentCreditsPlan > planCredits
              ? "Downgrade"
              : "Upgrade",
      }
    })
  )

  const filtered = priceRange
    ? enriched.filter((item) => {
        const price = item.prices.find(Boolean)
        const amount = (price?.unit_amount || 0) / 100
        return amount >= priceRange.min && amount <= priceRange.max
      })
    : enriched

  return json(filtered)
}
