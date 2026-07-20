import type { Metadata } from "next"

import { ResetPasswordForm } from "@/components/auth/reset-password-form"

export const metadata: Metadata = {
  title: "Set New Password | List Hygiene",
}

export default function ResetPasswordPage() {
  return <ResetPasswordForm />
}
