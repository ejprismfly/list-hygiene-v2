"use client"

import { useActionState } from "react"
import Link from "next/link"
import { Mail } from "lucide-react"

import { signupAction } from "@/app/(auth)/actions"
import { AuthFormShell, AuthSuccessState } from "@/components/auth/auth-form-shell"
import { AuthMessage } from "@/components/auth/auth-message"
import { Button, buttonVariants } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/auth/password-input"
import { AUTH_FORM_INITIAL_STATE } from "@/lib/auth-form"

export function SignupForm() {
  const [state, formAction, pending] = useActionState(
    signupAction,
    AUTH_FORM_INITIAL_STATE
  )

  if (state.status === "success") {
    return (
      <AuthSuccessState
        icon={<Mail className="size-12" strokeWidth={1.5} />}
        title="Check Your Inbox!"
        description={
          <>
            <p>
              A confirmation email has been sent to the address you provided.
              Please click the link in the email to complete your signup process.
            </p>
            <p>If you don&apos;t see it, be sure to check your spam or junk folder.</p>
          </>
        }
      />
    )
  }

  return (
    <AuthFormShell
      title="Sign Up"
      description="Create an account and get started"
      message={<AuthMessage state={state} />}
      footer={
        <>
          <span className="text-muted-foreground">Already have an account?</span>
          <Link
            href="/login"
            className={buttonVariants({ variant: "link", size: "sm" })}
          >
            Sign In
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
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>
        <div className="flex items-start gap-3">
          <Checkbox id="terms" name="terms" className="mt-1 size-5" />
          <Label
            htmlFor="terms"
            className="text-xs leading-5 font-normal text-foreground"
          >
            I have read and accept the{" "}
            <a
              href="https://listhygiene.com/policy/terms"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline-offset-4 hover:underline"
            >
              Terms of Use
            </a>{" "}
            and{" "}
            <a
              href="https://listhygiene.com/policy/privacy"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline-offset-4 hover:underline"
            >
              Privacy Policy
            </a>
          </Label>
        </div>
        <Button type="submit" className="mx-auto min-w-24" disabled={pending}>
          {pending ? "Signing up" : "Sign Up"}
        </Button>
      </form>
    </AuthFormShell>
  )
}
