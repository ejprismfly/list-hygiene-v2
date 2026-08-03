import type Stripe from "stripe"

import { canManageBilling, errorJson, json } from "@/lib/api/tenant"
import { appHost, getStripeClient } from "@/lib/billing/stripe"
import {
  appendBillingScopeParams,
  getBillingContext,
  getScopedBillingAccount,
} from "@/lib/billing/scope"
import { boundedInteger } from "@/lib/api/validation"

type PlanCatalogItem = { product: Stripe.Product; prices: Stripe.Price[] }
let planCatalogCache: { expiresAt: number; items: PlanCatalogItem[] } | null = null

async function loadPlanCatalog() {
  if (planCatalogCache && planCatalogCache.expiresAt > Date.now()) {
    return planCatalogCache.items
  }

  const stripe = getStripeClient()
  const { data: prices } = await stripe.prices.list({
    active: true,
    type: "recurring",
    limit: 100,
    expand: ["data.product"],
  })
  const byProduct = new Map<string, PlanCatalogItem>()
  for (const price of prices) {
    const product = typeof price.product === "string" ? null : price.product
    if (!product || product.deleted || !product.active) continue
    const item = byProduct.get(product.id) || { product, prices: [] }
    item.prices.push(price)
    byProduct.set(product.id, item)
  }

  const items = Array.from(byProduct.values())
  planCatalogCache = { expiresAt: Date.now() + 5 * 60 * 1000, items }
  return items
}

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
  const limit = boundedInteger(url.searchParams.get("limit"), {
    fallback: 10,
    min: 1,
    max: 50,
  })
  const sort = url.searchParams.get("sort") || "created_desc"
  const priceRange = parsePriceRange(url.searchParams.get("price_range"))
  if (limit === null) {
    return errorJson("limit must be an integer from 1 to 50.", 400)
  }
  if (!["created_desc", "created_asc", "amount_asc", "amount_desc"].includes(sort)) {
    return errorJson("sort is invalid.", 400)
  }

  const billing = await getBillingContext(
    request,
    "id, user_id, customer_id, subscription_id, plan_id, credits_plan, organization_id, workspace_id"
  )
  if (!billing.ok) {
    return errorJson(billing.error, billing.status)
  }

  const billingHost = appHost(request)
  const stripeAccount = getScopedBillingAccount(billing.context)
  const canManage =
    billing.context.legacyFallback ||
    canManageBilling(billing.context.tenant?.role ?? null)
  const currentCreditsPlan = Number(stripeAccount?.credits_plan || 0)
  const catalog = await loadPlanCatalog()
  const products = catalog.map((item) => item.product)
  const pricesByProduct = new Map(
    catalog.map((item) => [item.product.id, item.prices])
  )

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

  const enriched = items.slice(0, limit).map((item) => {
      const prices = pricesByProduct.get(item.id) || []
      const selected = item.id === stripeAccount?.plan_id
      const planCredits = Number(item.metadata.credits || 0)

      return {
        ...item,
        prices,
        selected,
        checkout_url:
          !canManage || selected || !prices[0]?.id
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

  const filtered = priceRange
    ? enriched.filter((item) => {
        const price = item.prices.find(Boolean)
        const amount = (price?.unit_amount || 0) / 100
        return amount >= priceRange.min && amount <= priceRange.max
      })
    : enriched

  return json(filtered)
}
