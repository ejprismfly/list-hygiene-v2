import type { Metadata } from "next"

import { ResetPasswordForm } from "@/components/auth/reset-password-form"

export const metadata: Metadata = {
  title: "Choose password | List Hygiene",
}

export default function ResetPasswordPage() {
  return <ResetPasswordForm />
}
