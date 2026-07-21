import type { Metadata } from "next"

import { ResetPasswordForm } from "@/components/auth/reset-password-form"
import { safeNextPath } from "@/lib/url-safety.cjs"

export const metadata: Metadata = {
  title: "Set New Password | List Hygiene",
}

type ResetPasswordPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps) {
  const params = await searchParams
  const nextParam = Array.isArray(params?.next) ? params?.next[0] : params?.next
  const nextPath = safeNextPath(nextParam)

  return <ResetPasswordForm nextPath={nextPath} />
}
