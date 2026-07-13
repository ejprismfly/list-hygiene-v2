import type { Metadata } from "next"

import { ConfigureConnectionContent } from "@/components/settings/configure-connection-content"
import { getAppUserOrRedirect } from "@/lib/app-session"

export const metadata: Metadata = {
  title: "Configure Connection | List Hygiene",
}

export const dynamic = "force-dynamic"

export default async function ConfigureKlaviyoPage() {
  await getAppUserOrRedirect()

  return <ConfigureConnectionContent />
}
