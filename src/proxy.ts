import { NextResponse, type NextRequest } from "next/server"

import { updateSession } from "@/lib/supabase/proxy"

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(request.method) && request.cookies.getAll().some((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("auth-token"))) {
    const configured = process.env.NEXT_PUBLIC_APP_HOST
    const origin = request.headers.get("origin")
    let allowed = false
    try { allowed = Boolean(origin && new URL(origin).origin === new URL(configured || request.url).origin) } catch {}
    if (!allowed || request.headers.get("sec-fetch-site") === "cross-site") return NextResponse.json({ error: "Invalid request origin" }, { status: 403 })
  }
  try { return await updateSession(request) } catch {
    return NextResponse.json({ error: "Authentication is temporarily unavailable" }, { status: 503 })
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
}
