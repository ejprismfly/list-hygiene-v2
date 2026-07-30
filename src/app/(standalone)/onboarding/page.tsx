import type { Metadata } from "next"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { OnboardingContent } from "@/components/app/onboarding-content"
import { getAppUserOrRedirect } from "@/lib/app-session"
import { SIGNUP_ONBOARDING_COOKIE } from "@/lib/onboarding"
import { shouldShowOnboardingForUser } from "@/lib/onboarding-server"

export const metadata: Metadata = {
  title: "Onboarding | List Hygiene",
}

export const dynamic = "force-dynamic"

export default async function OnboardingPage() {
  const user = await getAppUserOrRedirect()
  const cookieStore = await cookies()
  const hasSignupOnboardingMarker =
    cookieStore.get(SIGNUP_ONBOARDING_COOKIE)?.value === "1"
  const hasNoIntegrationHistory = await shouldShowOnboardingForUser(user)

  if (!user.isPreview && !hasSignupOnboardingMarker && !hasNoIntegrationHistory) {
    redirect("/dashboard")
  }

  return <OnboardingContent />
}
