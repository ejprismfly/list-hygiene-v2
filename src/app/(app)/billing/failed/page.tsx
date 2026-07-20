import Link from "next/link"
import type { Metadata } from "next"

import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { getAppUserOrRedirect } from "@/lib/app-session"
import { getStripeClient } from "@/lib/billing/stripe"

export const metadata: Metadata = {
  title: "Payment Failed | List Hygiene",
}

export const dynamic = "force-dynamic"

type BillingFailedPageProps = {
  searchParams?: Promise<{
    session_id?: string
  }>
}

function formatCheckoutAmount(amount: number | null | undefined, currency?: string | null) {
  if (amount === null || amount === undefined) {
    return null
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: 0,
  }).format(amount / 100)
}

async function getCheckoutSummary(sessionId?: string) {
  if (!sessionId || !process.env.STRIPE_SECRET_KEY) {
    return null
  }

  try {
    const stripe = getStripeClient()
    const [session, lineItems] = await Promise.all([
      stripe.checkout.sessions.retrieve(sessionId),
      stripe.checkout.sessions.listLineItems(sessionId, { limit: 1 }),
    ])
    const [item] = lineItems.data
    const credits = session.metadata?.credits
    const plan =
      item?.description ||
      (credits ? `${Number(credits).toLocaleString()} credits` : null)
    const price = formatCheckoutAmount(
      item?.amount_total ?? session.amount_total,
      item?.currency || session.currency
    )

    if (!plan && !price) {
      return null
    }

    return { plan, price }
  } catch (error) {
    console.error("Unable to load failed checkout summary:", error)
    return null
  }
}

export default async function BillingFailedPage({
  searchParams,
}: BillingFailedPageProps) {
  await getAppUserOrRedirect()
  const params = await searchParams
  const checkoutSummary = await getCheckoutSummary(params?.session_id)

  return (
    <main className="min-h-svh bg-background p-4 sm:p-6 md:p-20">
      <div className="mx-auto grid max-w-lg gap-6">
        <div className="grid gap-4">
          <h1 className="text-2xl font-semibold tracking-normal sm:text-3xl">
            Payment Failed!
          </h1>
          <p className="text-muted-foreground">
            We couldn&apos;t process your payment.
          </p>
        </div>

        {checkoutSummary && (
          <Card>
            <CardContent className="grid gap-4 text-base sm:text-xl">
              {checkoutSummary.plan && (
                <div className="flex items-center justify-between">
                  <span>Plan:</span>
                  <span>{checkoutSummary.plan}</span>
                </div>
              )}
              {checkoutSummary.price && (
                <div className="flex items-center justify-between">
                  <span>Price:</span>
                  <span>{checkoutSummary.price}</span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <p>
          <span className="font-medium">Reason:</span>{" "}
          <span>Please check your payment details and try again.</span>
        </p>

        <div className="grid gap-2 sm:flex sm:flex-wrap">
          <Link href="/billing" className={buttonVariants()}>
            Retry Payment
          </Link>
          <Link
            href="/billing"
            className={buttonVariants({ variant: "outline" })}
          >
            Back to Billing
          </Link>
        </div>

        <p className="text-sm text-muted-foreground">
          Need Help? Contact{" "}
          <a
            href="mailto:support@listhygiene.com"
            className="font-medium underline underline-offset-4"
          >
            support@listhygiene.com
          </a>
        </p>
      </div>
    </main>
  )
}
