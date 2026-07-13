import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export function OnboardingContent() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-6">
      <div className="grid max-w-3xl gap-5 text-center">
        <h1 className="text-5xl font-semibold tracking-normal">
          Let&apos;s Get You Connected!
        </h1>
        <p className="text-lg text-muted-foreground">
          We noticed you haven&apos;t connected your Klaviyo account yet. Let&apos;s
          walk through it together.
        </p>
        <div>
          <Badge variant="secondary" className="h-auto px-4 py-2 text-base">
            Unlock 300 trial credits when you connect your email platform. *
          </Badge>
        </div>
        <div className="pt-4">
          <Link href="/settings/klaviyo" className={buttonVariants()}>
            Connect Klaviyo
          </Link>
        </div>
        <p className="text-sm text-muted-foreground">
          Having any issues? Contact{" "}
          <a
            href="mailto:support@prismfly.com"
            className="font-medium underline underline-offset-4"
          >
            support@prismfly.com
          </a>
        </p>
        <p className="mx-auto max-w-xl text-xs">
          * A user can only redeem trial credits one time. Email platform
          accounts which have previously been connected to List Hygiene or used
          to redeem a trial are not eligible.
        </p>
      </div>
    </main>
  )
}
