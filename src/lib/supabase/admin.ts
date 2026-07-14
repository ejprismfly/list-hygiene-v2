import { createClient as createSupabaseClient } from "@supabase/supabase-js"

import { requireSupabaseConfig } from "@/lib/supabase/env"

export function createAdminClient() {
  const { url } = requireSupabaseConfig()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for admin access.")
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
