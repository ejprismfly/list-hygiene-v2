import type { Metadata } from "next"

import { AppShell } from "@/components/app/app-shell"
import { BillingContent } from "@/components/billing/billing-content"
import { getAppUserOrRedirect } from "@/lib/app-session"

export const metadata: Metadata = {
  title: "Billing | List Hygiene",
}

export const dynamic = "force-dynamic"

export default async function BillingPage() {
  const user = await getAppUserOrRedirect()

  return (
    <AppShell active="billing" userEmail={user.email}>
      <BillingContent email={user.email} />
    </AppShell>
  )
}
