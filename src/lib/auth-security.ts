import { createHash, createHmac, randomBytes } from "node:crypto"
import { isIP } from "node:net"
import { cookies, headers } from "next/headers"
import { createAdminClient } from "@/lib/supabase/admin"
import { getVerifiedSession } from "@/lib/auth-session"
import { safeNextPath } from "@/lib/url-safety.cjs"

export const PASSWORD_GRANT_COOKIE = "lh-password-grant"
export const hashAuthToken = (value: string) => createHash("sha256").update(value).digest("hex")

export async function limitAuthAttempt(kind: "login" | "email", email: string) {
  try {
    const secret = process.env.AUTH_SECURITY_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!secret) throw new Error("Missing authentication limiter secret")
    const headerList = await headers()
    // Only trust client IP headers when the ingress is configured to overwrite them.
    const forwarded = process.env.AUTH_TRUST_PROXY === "true" ? headerList.get("cf-connecting-ip") : null
    const ip = forwarded && isIP(forwarded) ? forwarded : "untrusted-ingress"
    const buckets = kind === "login"
      ? [[`login:${ip}:${email}`, 10, 900] as const]
      : [[`email:recipient:${email}`, 1, 60] as const, [`email:recipient-hour:${email}`, 5, 3600] as const, [`email:ip:${ip}:${email}`, 5, 3600] as const]
    const admin = createAdminClient()
    let retryAfter = 0
    for (const [key, limit, seconds] of buckets) {
      const hash = createHmac("sha256", secret).update(key).digest("hex")
      const { data, error } = await admin.rpc("consume_auth_rate_limit", { p_key: hash, p_limit: limit, p_seconds: seconds })
      if (error || typeof data?.allowed !== "boolean") throw new Error("Limiter unavailable")
      if (!data.allowed) retryAfter = Math.max(retryAfter, data.retry_after)
    }
    return retryAfter ? { status: "error" as const, errorCode: "rate_limited", retryAfterSeconds: retryAfter, message: `Please wait ${retryAfter} seconds before trying again.` } : null
  } catch {
    return { status: "error" as const, errorCode: "auth_unavailable", message: "Authentication is temporarily unavailable. Please try again later." }
  }
}

export async function issuePasswordGrant(purpose: "recovery" | "invite", nextPath: string) {
  const verified = await getVerifiedSession()
  if (!verified) throw new Error("Verified session required")
  const token = randomBytes(32).toString("hex")
  const { error } = await createAdminClient().from("auth_password_grants").insert({
    token_hash: hashAuthToken(token), user_id: verified.user.id, session_id: verified.sessionId,
    purpose, next_path: safeNextPath(nextPath), expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  })
  if (error) throw new Error("Password grant unavailable")
  const store = await cookies()
  store.set(PASSWORD_GRANT_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 900 })
}

export async function claimPasswordGrant() {
  const verified = await getVerifiedSession()
  const store = await cookies()
  const token = store.get(PASSWORD_GRANT_COOKIE)?.value
  if (!verified || !token || !/^[a-f0-9]{64}$/.test(token)) return null
  const { data, error } = await createAdminClient().rpc("claim_auth_password_grant", {
    p_hash: hashAuthToken(token), p_user_id: verified.user.id, p_session_id: verified.sessionId,
  })
  store.delete(PASSWORD_GRANT_COOKIE)
  if (error || !data) return null
  return { ...verified, nextPath: safeNextPath(data.next_path) }
}
