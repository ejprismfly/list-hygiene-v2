import { redirect } from "next/navigation"

import { getSupabaseConfig } from "@/lib/supabase/env"
import { getVerifiedSession } from "@/lib/auth-session"

export type AppUser = {
  id: string
  email: string
  isPreview: boolean
}

export async function getAppUserOrRedirect(): Promise<AppUser> {
  if (!getSupabaseConfig()) {
    if (process.env.NODE_ENV === "production") redirect("/login")
    return {
      id: "preview-user",
      email: "efren@prismfly.com",
      isPreview: true,
    }
  }

  const user = (await getVerifiedSession())?.user

  if (!user) {
    redirect("/login")
  }

  return {
    id: user.id,
    email: user.email ?? "Signed in user",
    isPreview: false,
  }
}
