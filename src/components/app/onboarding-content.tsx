"use client"

import { useEffect, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { startKlaviyoOAuth } from "@/lib/klaviyo-oauth"

export function OnboardingContent() {
  const [statusMessage, setStatusMessage] = useState("")

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.data?.status === "connected") {
        setStatusMessage("Klaviyo connected. Opening integration settings.")
        window.setTimeout(() => {
          window.location.assign("/settings?connected=1")
        }, 600)
      }

      if (event.data?.status === "blocked") {
        setStatusMessage("That Klaviyo account is already connected.")
        window.setTimeout(() => {
          window.location.assign("/settings")
        }, 900)
      }

      if (event.data?.status === "failed") {
        setStatusMessage("Unable to connect Klaviyo. Please try again.")
      }
    }

    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [])

  async function connectKlaviyo() {
    setStatusMessage("")
    await startKlaviyoOAuth({
      onMissingClientId: () =>
        setStatusMessage("Klaviyo client ID is not configured."),
    })
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-4 sm:p-6">
      <div className="grid max-w-3xl gap-5 text-center">
        <h1 className="text-3xl font-semibold tracking-normal sm:text-5xl">
          Let&apos;s Get You Connected!
        </h1>
        <p className="text-base text-muted-foreground sm:text-lg">
          We noticed you haven&apos;t connected your Klaviyo account yet. Let&apos;s
          walk through it together.
        </p>
        <div>
          <Badge variant="secondary" className="h-auto whitespace-normal px-4 py-2 text-center text-sm sm:text-base">
            Eligible users unlock 300 trial credits when connecting an email platform. *
          </Badge>
        </div>
        <div className="pt-4">
          <Button type="button" onClick={connectKlaviyo}>
            Connect Klaviyo
          </Button>
        </div>
        {statusMessage && (
          <p className="text-sm text-muted-foreground">{statusMessage}</p>
        )}
        <p className="text-sm text-muted-foreground">
          Having any issues? Contact{" "}
          <a
            href="mailto:support@listhygiene.com"
            className="font-medium underline underline-offset-4"
          >
            support@listhygiene.com
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
