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

  return <LoginForm nextPath={safeNextPath(next)} />
}
