import type { Metadata } from "next"

import { InviteAcceptance } from "@/components/auth/invite-acceptance"
import { getCurrentUser } from "@/lib/api/tenant"
import { getSupabaseConfig } from "@/lib/supabase/env"

export const metadata: Metadata = {
  title: "Accept Invite | List Hygiene",
}

type InvitePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function InvitePage({ searchParams }: InvitePageProps) {
  const params = await searchParams
  const token = Array.isArray(params?.token) ? params?.token[0] : params?.token
  let userEmail: string | null = null

  if (getSupabaseConfig()) {
    const user = await getCurrentUser()
    userEmail = user?.email || null
  }

  return <InviteAcceptance token={token || ""} userEmail={userEmail} />
}
