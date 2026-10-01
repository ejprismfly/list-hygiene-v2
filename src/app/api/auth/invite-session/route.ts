import { getVerifiedSession } from "@/lib/auth-session"
import { hashAuthToken, issuePasswordGrant } from "@/lib/auth-security"
import { createAdminClient } from "@/lib/supabase/admin"
import { safeNextPath } from "@/lib/url-safety.cjs"

/** Compatibility for Supabase's signed implicit invitation-email sessions. */
export async function POST(request: Request) {
  try {
    const verified = await getVerifiedSession()
    if (!verified?.user.invited_at) return Response.json({ error: "Invalid invitation" }, { status: 403 })
    const { data, error } = await verified.supabase.auth.getClaims()
    const amr = data?.claims.amr as { method: string; timestamp: number }[] | undefined
    if (error || !amr?.some((entry) => entry.method === "otp" && entry.timestamp <= Date.now()/1000 && entry.timestamp > Date.now()/1000 - 900)) return Response.json({ error: "Fresh email verification required" }, { status: 403 })
    const body = await request.json()
    const outer = new URL(safeNextPath(body.next), "https://listhygiene.local")
    const next = outer.pathname === "/reset-password" ? safeNextPath(outer.searchParams.get("next")) : safeNextPath(body.next)
    const invite = new URL(next, "https://listhygiene.local")
    const token = invite.searchParams.get("token")
    if (invite.pathname !== "/invite" || !token) return Response.json({ error: "Invalid invitation" }, { status: 403 })
    const { data: invitation, error: lookupError } = await createAdminClient().from("organization_invitations")
      .select("email, status, expires_at").eq("token_hash", hashAuthToken(token)).maybeSingle()
    if (lookupError || invitation?.status !== "pending" || invitation.email.toLowerCase() !== verified.user.email?.toLowerCase() || new Date(invitation.expires_at).getTime() <= Date.now()) return Response.json({ error: "Invalid invitation" }, { status: 403 })
    await issuePasswordGrant("invite", next)
    return Response.json({ ok: true, next })
  } catch { return Response.json({ error: "Unable to verify invitation" }, { status: 503 }) }
}
