import type { Metadata } from "next"

import { InviteAuthCallback } from "@/components/auth/invite-auth-callback"

export const metadata: Metadata = {
  title: "Verify Invite | List Hygiene",
}

export default function InviteAuthCallbackPage() {
  return <InviteAuthCallback />
}
