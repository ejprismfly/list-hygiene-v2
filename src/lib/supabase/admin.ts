import { createClient as createSupabaseClient } from "@supabase/supabase-js"

import { requireSupabaseConfig } from "@/lib/supabase/env"

export function createAdminClient() {
  const { url } = requireSupabaseConfig()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for admin access.")
  }

  if (!serviceRoleKey.startsWith("sb_secret_")) {
    let role
    try { role = JSON.parse(Buffer.from(serviceRoleKey.split(".")[1] || "", "base64url").toString()).role } catch {}
    if (role !== "service_role") throw new Error("A service-role Supabase credential is required")
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
