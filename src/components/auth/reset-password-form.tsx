"use client"

import { useActionState } from "react"

import { resetPasswordAction } from "@/app/(auth)/actions"
import { AuthMessage } from "@/components/auth/auth-message"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AUTH_FORM_INITIAL_STATE } from "@/lib/auth-form"

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(
    resetPasswordAction,
    AUTH_FORM_INITIAL_STATE
  )

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Choose password</CardTitle>
        <CardDescription>Enter a new password for your account.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4">
          <AuthMessage state={state} />
          <div className="grid gap-2">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Saving password" : "Save password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
