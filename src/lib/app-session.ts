import { redirect } from "next/navigation"

import { getSupabaseConfig } from "@/lib/supabase/env"
import { createClient } from "@/lib/supabase/server"

export type AppUser = {
  id: string
  email: string
  isPreview: boolean
}

export async function getAppUserOrRedirect(): Promise<AppUser> {
  if (!getSupabaseConfig()) {
    return {
      id: "preview-user",
      email: "efren@prismfly.com",
      isPreview: true,
    }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  return {
    id: user.id,
    email: user.email ?? "Signed in user",
    isPreview: false,
  }
}
