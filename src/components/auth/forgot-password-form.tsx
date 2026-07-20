"use client"

import { useActionState } from "react"
import Link from "next/link"

import { forgotPasswordAction } from "@/app/(auth)/actions"
import { AuthFormShell, AuthSuccessState } from "@/components/auth/auth-form-shell"
import { AuthMessage } from "@/components/auth/auth-message"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AUTH_FORM_INITIAL_STATE } from "@/lib/auth-form"

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(
    forgotPasswordAction,
    AUTH_FORM_INITIAL_STATE
  )

  if (state.status === "success") {
    return (
      <AuthSuccessState
        title="Reset Password"
        description={
          <p>
            A password reset link has been sent to your email. Please check your
            inbox and spam folder to reset your password.
          </p>
        }
        footer={
          <>
            Remember Password?{" "}
            <Link
              href="/login"
              className="font-semibold underline-offset-4 hover:text-foreground hover:underline"
            >
              Login
            </Link>
          </>
        }
      />
    )
  }

  return (
    <AuthFormShell
      title="Reset Password"
      description="Enter your email and we will send you instructions to reset your password"
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
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </div>
        <Button type="submit" className="mx-auto min-w-40" disabled={pending}>
          {pending ? "Sending" : "Send Reset Instructions"}
        </Button>
      </form>
    </AuthFormShell>
  )
}
