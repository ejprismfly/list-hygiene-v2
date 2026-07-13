import type { Metadata } from "next"

import { AppShell } from "@/components/app/app-shell"
import { DashboardContent } from "@/components/dashboard/dashboard-content"
import { getAppUserOrRedirect } from "@/lib/app-session"

export const metadata: Metadata = {
  title: "Dashboard | List Hygiene",
}

export const dynamic = "force-dynamic"

export default async function DashboardPage() {
  const user = await getAppUserOrRedirect()

  return (
    <AppShell active="dashboard" userEmail={user.email}>
      <DashboardContent />
    </AppShell>
  )
}
