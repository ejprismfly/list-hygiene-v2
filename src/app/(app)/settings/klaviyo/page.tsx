import type { Metadata } from "next"

import { AppShell } from "@/components/app/app-shell"
import { ConfigureConnectionContent } from "@/components/settings/configure-connection-content"
import { getAppUserOrRedirect } from "@/lib/app-session"

export const metadata: Metadata = {
  title: "Configure Connection | List Hygiene",
}

export const dynamic = "force-dynamic"

export default async function ConfigureKlaviyoPage() {
  const user = await getAppUserOrRedirect()

  return (
    <AppShell active="settings" userEmail={user.email}>
      <ConfigureConnectionContent />
    </AppShell>
  )
}
