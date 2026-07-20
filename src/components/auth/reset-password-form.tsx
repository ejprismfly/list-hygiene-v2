"use client"

import { useActionState } from "react"
import Link from "next/link"

import { resetPasswordAction } from "@/app/(auth)/actions"
import { AuthFormShell } from "@/components/auth/auth-form-shell"
import { AuthMessage } from "@/components/auth/auth-message"
import { Button, buttonVariants } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/auth/password-input"
import { AUTH_FORM_INITIAL_STATE } from "@/lib/auth-form"

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(
    resetPasswordAction,
    AUTH_FORM_INITIAL_STATE
  )

  return (
    <AuthFormShell
      title="Change Password"
      message={<AuthMessage state={state} />}
      footer={
        <Link
          href="/login"
          className={buttonVariants({ variant: "link", size: "sm" })}
        >
          Back to Login
        </Link>
      }
    >
      <form action={formAction} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="password">New Password</Label>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="confirmPassword">Confirm Password</Label>
          <PasswordInput
            id="confirmPassword"
            name="confirmPassword"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>
        <Button type="submit" className="mx-auto min-w-36" disabled={pending}>
          {pending ? "Updating" : "Update Password"}
        </Button>
      </form>
    </AuthFormShell>
  )
}
