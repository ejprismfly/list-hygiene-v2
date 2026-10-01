import type { Metadata } from "next"

import { safeNextPath } from "@/lib/url-safety.cjs"
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form"

export const metadata: Metadata = {
  title: "Forgot Password | List Hygiene",
}

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  return <ForgotPasswordForm nextPath={safeNextPath(typeof params.next === "string" ? params.next : null)} />
}
