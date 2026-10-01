import { type NextRequest, NextResponse } from "next/server"
import type { EmailOtpType } from "@supabase/supabase-js"

import {
  AUTH_ANALYTICS_COOKIE,
  AUTH_ANALYTICS_COOKIE_MAX_AGE,
  encodeAuthAnalyticsCookie,
  SIGNUP_VERIFIED_EVENT,
} from "@/lib/auth-analytics"
import {
  isOnboardingPath,
  SIGNUP_ONBOARDING_COOKIE,
  SIGNUP_ONBOARDING_COOKIE_MAX_AGE,
} from "@/lib/onboarding"
import { issuePasswordGrant } from "@/lib/auth-security"
import { getSupabaseConfig } from "@/lib/supabase/env"
import { createClient } from "@/lib/supabase/server"
import { getOrigin, safeNextPath } from "@/lib/url-safety.cjs"

const emailOtpTypes = new Set([
  "signup",
  "invite",
  "recovery",
])

function isEmailOtpType(type: string | null): type is EmailOtpType {
  return Boolean(type && emailOtpTypes.has(type))
}

function getRequestOrigin(request: NextRequest) {
  const configuredHost = process.env.NEXT_PUBLIC_APP_HOST?.replace(/\/+$/, "")

  return getOrigin(configuredHost, request.headers.get("origin"), request.url, {
    cfVisitor: request.headers.get("cf-visitor"),
    forwardedHost: request.headers.get("x-forwarded-host"),
    forwardedProto: request.headers.get("x-forwarded-proto"),
    hostHeader: request.headers.get("host"),
  })
}

function redirectTo(request: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, getRequestOrigin(request)))
}

function redirectAfterAuth(
  request: NextRequest,
  path: string,
  type: string | null,
  options: { signupVerifiedEmail?: string | null } = {}
) {
  const response = redirectTo(request, path)

  if (type === "signup" && isOnboardingPath(path)) {
    response.cookies.set(SIGNUP_ONBOARDING_COOKIE, "1", {
      maxAge: SIGNUP_ONBOARDING_COOKIE_MAX_AGE,
      path: "/",
      sameSite: "lax",
    })
  }

  if (type === "signup" && options.signupVerifiedEmail) {
    response.cookies.set(
      AUTH_ANALYTICS_COOKIE,
      encodeAuthAnalyticsCookie({
        event: SIGNUP_VERIFIED_EVENT,
        email: options.signupVerifiedEmail,
      }),
      {
        maxAge: AUTH_ANALYTICS_COOKIE_MAX_AGE,
        path: "/",
        sameSite: "lax",
      }
    )
  }

  return response
}

async function verifiedSignupEmail(
  supabase: Awaited<ReturnType<typeof createClient>>,
  email?: string | null
) {
  if (email) {
    return email
  }

  const { data } = await supabase.auth.getUser()

  return data.user?.email || null
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get("code")
  const type = requestUrl.searchParams.get("type")
  const tokenHash = requestUrl.searchParams.get("token_hash")
  const nextPath = safeNextPath(requestUrl.searchParams.get("next"))
  let signupVerifiedEmail: string | null = null
  const invalid = () => redirectTo(request, `/login?${new URLSearchParams({ error: "invalid_confirmation", next: nextPath })}`)
  if (!getSupabaseConfig() || Boolean(code) === Boolean(tokenHash) || !isEmailOtpType(type)) return invalid()
  for (const name of ["code", "token_hash", "type", "next"]) {
    const values = requestUrl.searchParams.getAll(name)
    // The existing signup template appends the same type already in RedirectTo.
    if (values.length > 1 && (name !== "type" || values.some((value) => value !== type))) return invalid()
  }
  try {
    const supabase = await createClient({ writable: true })
    const { data, error } = tokenHash
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : await supabase.auth.exchangeCodeForSession(code!)
    if (error || !data.user?.email_confirmed_at || !data.session) return invalid()
    if (type === "signup") signupVerifiedEmail = await verifiedSignupEmail(supabase, data.user.email)
    if (type === "recovery" || type === "invite") {
      let destination = nextPath
      if (type === "invite") {
        const nested = new URL(nextPath, "https://listhygiene.local")
        destination = nested.pathname === "/reset-password" ? safeNextPath(nested.searchParams.get("next")) : nextPath
      }
      await issuePasswordGrant(type, destination)
      return redirectTo(request, `/reset-password?${new URLSearchParams({ next: destination })}`)
    }
  } catch {
    return invalid()
  }

  return redirectAfterAuth(request, nextPath, type, { signupVerifiedEmail })
}
