import type { SupabaseClient } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"

/** Verify identity with Auth, then check that the JWT's session still exists. */
export async function getVerifiedSession(client?: SupabaseClient) {
  try {
    const supabase = client || await createClient()
    const { data, error } = await supabase.auth.getUser()
    if (error || !data.user?.email_confirmed_at || data.user.is_anonymous) return null
    const { data: claims, error: claimsError } = await supabase.auth.getClaims()
    const sessionId = claims?.claims?.session_id
    if (claimsError || typeof sessionId !== "string" || claims?.claims?.sub !== data.user.id) return null
    const { data: active, error: activeError } = await supabase.rpc("current_session_is_active")
    if (activeError || active !== true) return null
    return { user: data.user, sessionId, supabase }
  } catch {
    return null
  }
}
