import type { Metadata } from "next"

import { LoginForm } from "@/components/auth/login-form"
import { safeNextPath } from "@/lib/url-safety.cjs"

export const metadata: Metadata = {
  title: "Login | List Hygiene",
}

type LoginPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams
  const next = Array.isArray(params?.next) ? params?.next[0] : params?.next

  const notice = params?.error === "invalid_confirmation"
    ? "This email link is invalid, expired, or already used. Request a new confirmation or reset link."
    : params?.error === "session_revocation_failed"
      ? "You are signed out here, but session cleanup failed. Try logging in and signing out again to revoke your other sessions."
      : undefined
  return <LoginForm nextPath={safeNextPath(next)} notice={notice} />
}
