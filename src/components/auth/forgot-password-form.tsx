"use client"

import { useActionState } from "react"
import Link from "next/link"

import { forgotPasswordAction } from "@/app/(auth)/actions"
import { AuthMessage } from "@/components/auth/auth-message"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AUTH_FORM_INITIAL_STATE } from "@/lib/auth-form"

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(
    forgotPasswordAction,
    AUTH_FORM_INITIAL_STATE
  )

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Reset password</CardTitle>
        <CardDescription>Send a password reset link.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4">
          <AuthMessage state={state} />
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
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Sending link" : "Send reset link"}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center text-sm">
        <Link
          href="/login"
          className={buttonVariants({ variant: "link", size: "sm" })}
        >
          Back to sign in
        </Link>
      </CardFooter>
    </Card>
  )
}
