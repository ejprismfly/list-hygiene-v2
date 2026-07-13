import type { Metadata } from "next"

import { OnboardingContent } from "@/components/app/onboarding-content"
import { getAppUserOrRedirect } from "@/lib/app-session"

export const metadata: Metadata = {
  title: "Onboarding | List Hygiene",
}

export const dynamic = "force-dynamic"

export default async function OnboardingPage() {
  await getAppUserOrRedirect()

  return <OnboardingContent />
}
