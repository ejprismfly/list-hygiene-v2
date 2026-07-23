import { type NextRequest, NextResponse } from "next/server"
import type { EmailOtpType } from "@supabase/supabase-js"

import { getSupabaseConfig } from "@/lib/supabase/env"
import { createClient } from "@/lib/supabase/server"
import { getOrigin, safeNextPath } from "@/lib/url-safety.cjs"

const emailOtpTypes = new Set([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
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

function inviteFallbackCallbackPath(nextPath: string) {
  try {
    const url = new URL(nextPath, "https://listhygiene.local")
    const nestedNext = safeNextPath(url.searchParams.get("next"), "")

    if (url.pathname === "/reset-password" && nestedNext.startsWith("/invite")) {
      return `/auth/invite-callback?${new URLSearchParams({
        next: nextPath,
      }).toString()}`
    }
  } catch {
    return null
  }

  return null
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get("code")
  const type = requestUrl.searchParams.get("type")
  const tokenHash = requestUrl.searchParams.get("token_hash")
  const nextPath = safeNextPath(requestUrl.searchParams.get("next"))

  if (!getSupabaseConfig()) {
    return redirectTo(request, "/login")
  }

  const supabase = await createClient()

  if (tokenHash && isEmailOtpType(type)) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    })

    if (error) {
      return redirectTo(request, "/login")
    }
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      return redirectTo(request, "/login")
    }
  }

  if (!tokenHash && !code) {
    const fallbackPath = inviteFallbackCallbackPath(nextPath)
    if (fallbackPath) {
      return redirectTo(request, fallbackPath)
    }
  }

  if (type === "recovery") {
    return redirectTo(request, "/reset-password")
  }

  return redirectTo(request, nextPath)
}
