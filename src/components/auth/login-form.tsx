"use client"

import { useActionState } from "react"
import Link from "next/link"

import { loginAction } from "@/app/(auth)/actions"
import { AuthFormShell } from "@/components/auth/auth-form-shell"
import { AuthMessage } from "@/components/auth/auth-message"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/auth/password-input"
import { AUTH_FORM_INITIAL_STATE } from "@/lib/auth-form"

export function LoginForm() {
  const [state, formAction, pending] = useActionState(
    loginAction,
    AUTH_FORM_INITIAL_STATE
  )

  return (
    <AuthFormShell
      title="Login"
      message={<AuthMessage state={state} />}
      footer={
        <>
          <span className="text-muted-foreground">New here?</span>
          <Link
            href="/signup"
            className={buttonVariants({ variant: "link", size: "sm" })}
          >
            Sign up now!
          </Link>
        </>
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
        <div className="grid gap-2">
          <Label htmlFor="password">Password</Label>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="current-password"
            minLength={8}
            required
          />
        </div>
        <div className="flex justify-end">
          <Link
            href="/forgot-password"
            className="text-sm font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Reset Password
          </Link>
        </div>
        <Button type="submit" className="mx-auto min-w-24" disabled={pending}>
          {pending ? "Logging in" : "Login"}
        </Button>
      </form>
    </AuthFormShell>
  )
}
