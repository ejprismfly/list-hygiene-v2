import type { Metadata } from "next"

import { AppShell } from "@/components/app/app-shell"
import { ProfileContent } from "@/components/profile/profile-content"
import { getAppUserOrRedirect } from "@/lib/app-session"

export const metadata: Metadata = {
  title: "Profile | List Hygiene",
}

export const dynamic = "force-dynamic"

export default async function ProfilePage() {
  const user = await getAppUserOrRedirect()

  return (
    <AppShell active="profile" userEmail={user.email}>
      <ProfileContent email={user.email} />
    </AppShell>
  )
}
