import type { Metadata } from "next"

import { AppShell } from "@/components/app/app-shell"
import { SettingsContent } from "@/components/settings/settings-content"
import { getAppUserOrRedirect } from "@/lib/app-session"

export const metadata: Metadata = {
  title: "Settings | List Hygiene",
}

export const dynamic = "force-dynamic"

type SettingsPageProps = {
  searchParams?: Promise<{
    connected?: string
  }>
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const user = await getAppUserOrRedirect()
  const params = await searchParams
  const connected = params?.connected ? params.connected === "1" : true

  return (
    <AppShell active="settings" userEmail={user.email}>
      <SettingsContent connected={connected} />
    </AppShell>
  )
}
