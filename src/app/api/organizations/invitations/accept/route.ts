import { errorJson, json, readJsonBody } from "@/lib/api/tenant"
import { getVerifiedSession } from "@/lib/auth-session"
import { hashAuthToken } from "@/lib/auth-security"
import { createAdminClient } from "@/lib/supabase/admin"

export async function POST(request: Request) {
  const verified = await getVerifiedSession()
  if (!verified) return errorJson("Sign in with a verified account to accept this invitation", 401)
  const body = await readJsonBody(request)
  const token = typeof body.token === "string" ? body.token : ""
  if (!/^[a-f0-9]{64}$/.test(token)) return errorJson("Invalid invitation token", 400)
  const { data, error } = await createAdminClient().rpc("accept_organization_invitation", {
    p_hash: hashAuthToken(token), p_user_id: verified.user.id, p_session_id: verified.sessionId,
  })
  if (error) return errorJson("This invitation is unavailable or you no longer have permission to accept it.", error.code === "42501" ? 403 : error.code === "P0002" ? 404 : error.code === "22023" ? 409 : 503)
  return json(data)
}
