import Stripe from "stripe"

export function getStripeClient() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is required for billing routes.")
  }

  return new Stripe(key)
}

export async function getOrCreateStripeCustomerByEmail(
  email: string,
  metadata: Record<string, string>
) {
  const stripe = getStripeClient()
  const existingCustomers = await stripe.customers.list({ email, limit: 1 })

  if (existingCustomers.data.length > 0) {
    const customer = existingCustomers.data[0]
    return await stripe.customers.update(customer.id, { metadata })
  }

  const currentMinute = new Date().toISOString().slice(0, 16)
  return await stripe.customers.create(
    { email, metadata },
    { idempotencyKey: `customer_create_${email}_${currentMinute}` }
  )
}

export async function createStripeCustomer(
  email: string,
  metadata: Record<string, string>,
  idempotencyKey?: string
) {
  const stripe = getStripeClient()
  return await stripe.customers.create(
    { email, metadata },
    idempotencyKey ? { idempotencyKey } : undefined
  )
}

export function appHost() {
  return (process.env.NEXT_PUBLIC_APP_HOST || "http://localhost:3000").replace(
    /\/+$/,
    ""
  )
}
