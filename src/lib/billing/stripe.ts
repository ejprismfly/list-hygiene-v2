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

function normalizeOrigin(value?: string | null) {
  if (!value) {
    return null
  }

  const raw = value.split(",")[0]?.trim()
  if (!raw) {
    return null
  }

  try {
    return new URL(raw).origin
  } catch {
    return null
  }
}

function originFromHost(host?: string | null, proto?: string | null) {
  const rawHost = host?.split(",")[0]?.trim()
  if (!rawHost) {
    return null
  }

  const protocol = proto?.split(",")[0]?.trim() || "https"
  return normalizeOrigin(`${protocol}://${rawHost}`)
}

function configuredAppHost() {
  return (process.env.NEXT_PUBLIC_APP_HOST || "http://localhost:3000").replace(
    /\/+$/,
    ""
  )
}

function allowedAppHosts() {
  const hosts = new Set(["app.listhygiene.com", "beta.listhygiene.com"])

  for (const origin of [
    configuredAppHost(),
    process.env.NEXT_PUBLIC_BETA_APP_HOST,
  ]) {
    const normalized = normalizeOrigin(origin)
    if (normalized) {
      hosts.add(new URL(normalized).hostname)
    }
  }

  return hosts
}

function isLocalHostname(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "0.0.0.0" ||
    hostname === "127.0.0.1" ||
    hostname.startsWith("127.") ||
    hostname.endsWith(".localhost")
  )
}

function isAllowedAppOrigin(origin: string) {
  try {
    const { hostname } = new URL(origin)
    return (
      allowedAppHosts().has(hostname) ||
      isLocalHostname(hostname) ||
      process.env.NODE_ENV !== "production"
    )
  } catch {
    return false
  }
}

export function appHost(request?: Request) {
  if (!request) {
    return configuredAppHost()
  }

  const headers = request.headers
  const forwardedProto = headers.get("x-forwarded-proto")
  const candidates = [
    originFromHost(headers.get("x-forwarded-host"), forwardedProto),
    originFromHost(headers.get("host"), forwardedProto),
    normalizeOrigin(headers.get("referer")),
    normalizeOrigin(headers.get("origin")),
    normalizeOrigin(request.url),
  ]

  return (
    candidates.find((origin) => origin && isAllowedAppOrigin(origin)) ||
    configuredAppHost()
  )
}
