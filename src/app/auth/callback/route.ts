import { type NextRequest, NextResponse } from "next/server"

import { getSupabaseConfig } from "@/lib/supabase/env"
import { createClient } from "@/lib/supabase/server"
import { safeNextPath } from "@/lib/url-safety.cjs"

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get("code")
  const type = requestUrl.searchParams.get("type")
  const nextPath = safeNextPath(requestUrl.searchParams.get("next"))

  if (!getSupabaseConfig()) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  if (code) {
    const supabase = await createClient()
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
