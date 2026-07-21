import { type NextRequest, NextResponse } from "next/server"
import type { EmailOtpType } from "@supabase/supabase-js"

import { getSupabaseConfig } from "@/lib/supabase/env"
import { createClient } from "@/lib/supabase/server"
import { safeNextPath } from "@/lib/url-safety.cjs"

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

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get("code")
  const type = requestUrl.searchParams.get("type")
  const tokenHash = requestUrl.searchParams.get("token_hash")
  const nextPath = safeNextPath(requestUrl.searchParams.get("next"))

  if (!getSupabaseConfig()) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  const supabase = await createClient()

  if (tokenHash && isEmailOtpType(type)) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    })

    if (error) {
      return NextResponse.redirect(new URL("/login", request.url))
    }
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      return NextResponse.redirect(new URL("/login", request.url))
    }
  }

  if (type === "recovery") {
    return NextResponse.redirect(new URL("/reset-password", request.url))
  }

  return NextResponse.redirect(new URL(nextPath, request.url))
}
