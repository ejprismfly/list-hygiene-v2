import type { Metadata } from "next"

import { SignupForm } from "@/components/auth/signup-form"
import { safeNextPath } from "@/lib/url-safety.cjs"

export const metadata: Metadata = {
  title: "Sign Up | List Hygiene",
}

type SignupPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const params = await searchParams
  const next = Array.isArray(params?.next) ? params?.next[0] : params?.next

  return <SignupForm nextPath={safeNextPath(next)} />
}
