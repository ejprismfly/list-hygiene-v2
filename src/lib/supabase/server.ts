import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

import { requireSupabaseConfig } from "@/lib/supabase/env"

export async function createClient() {
  const cookieStore = await cookies()
  const { url, anonKey } = requireSupabaseConfig()

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        } catch {
          // Server Components cannot set cookies. Server Actions and Route
          // Handlers can, so this keeps read-only renders from failing.
        }
      },
    },
  })
}
