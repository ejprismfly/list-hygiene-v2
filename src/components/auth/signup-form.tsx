"use client"

import { useActionState } from "react"
import Link from "next/link"

import { signupAction } from "@/app/(auth)/actions"
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
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AUTH_FORM_INITIAL_STATE } from "@/lib/auth-form"

export function SignupForm() {
  const [state, formAction, pending] = useActionState(
    signupAction,
    AUTH_FORM_INITIAL_STATE
  )

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Create account</CardTitle>
        <CardDescription>Start with a new List Hygiene account.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
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
          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          <div className="flex items-start gap-2">
            <Checkbox id="terms" name="terms" />
            <Label htmlFor="terms" className="pt-0.5 text-muted-foreground">
              I agree to the terms and privacy policy.
            </Label>
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Creating account" : "Create account"}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center text-sm">
        <span className="text-muted-foreground">Already registered?</span>
        <Link
          href="/login"
          className={buttonVariants({ variant: "link", size: "sm" })}
        >
          Sign in
        </Link>
      </CardFooter>
    </Card>
  )
}
