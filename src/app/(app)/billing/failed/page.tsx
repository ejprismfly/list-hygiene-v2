import Link from "next/link"
import type { Metadata } from "next"

import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { getAppUserOrRedirect } from "@/lib/app-session"

export const metadata: Metadata = {
  title: "Payment Failed | List Hygiene",
}

export const dynamic = "force-dynamic"

export default async function BillingFailedPage() {
  await getAppUserOrRedirect()

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

        <Card>
          <CardContent className="grid gap-4 text-base sm:text-xl">
            <div className="flex items-center justify-between">
              <span>Plan:</span>
              <span>1K</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Price:</span>
              <span>$30</span>
            </div>
          </CardContent>
        </Card>

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
