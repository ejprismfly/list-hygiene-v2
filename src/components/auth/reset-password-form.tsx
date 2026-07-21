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

type ResetPasswordFormProps = {
  nextPath?: string
}

export function ResetPasswordForm({
  nextPath = "/dashboard",
}: ResetPasswordFormProps) {
  const [state, formAction, pending] = useActionState(
    resetPasswordAction,
    AUTH_FORM_INITIAL_STATE
  )
  const inviteSetup = nextPath.startsWith("/invite")

  return (
    <AuthFormShell
      title={inviteSetup ? "Set Password" : "Change Password"}
      description={
        inviteSetup
          ? "Create a password before joining the workspace."
          : undefined
      }
      loading={pending}
      loadingLabel="Updating password"
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
        <input type="hidden" name="next" value={nextPath} />
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
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Updating" : inviteSetup ? "Set Password" : "Update Password"}
        </Button>
      </form>
    </AuthFormShell>
  )
}
