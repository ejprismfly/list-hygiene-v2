"use client"

import { useActionState } from "react"
import Link from "next/link"

import { loginAction, magicLinkAction } from "@/app/(auth)/actions"
import { AuthMessage } from "@/components/auth/auth-message"
import { SocialAuthButtons } from "@/components/auth/social-auth-buttons"
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
import { Separator } from "@/components/ui/separator"
import { AUTH_FORM_INITIAL_STATE } from "@/lib/auth-form"

export function LoginForm() {
  const [state, formAction, pending] = useActionState(
    loginAction,
    AUTH_FORM_INITIAL_STATE
  )
  const [magicState, magicFormAction, magicPending] = useActionState(
    magicLinkAction,
    AUTH_FORM_INITIAL_STATE
  )

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Use your List Hygiene account.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <SocialAuthButtons />
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <Separator className="flex-1" />
          <span>Email</span>
          <Separator className="flex-1" />
        </div>
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
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="password">Password</Label>
              <Link
                href="/forgot-password"
                className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              minLength={8}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Signing in" : "Sign in"}
          </Button>
        </form>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <Separator className="flex-1" />
          <span>Magic link</span>
          <Separator className="flex-1" />
        </div>
        <form action={magicFormAction} className="grid gap-4">
          <AuthMessage state={magicState} />
          <div className="grid gap-2">
            <Label htmlFor="magic-email">Email</Label>
            <Input
              id="magic-email"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </div>
          <Button
            type="submit"
            variant="outline"
            className="w-full"
            disabled={magicPending}
          >
            {magicPending ? "Sending link" : "Send magic link"}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center text-sm">
        <span className="text-muted-foreground">No account?</span>
        <Link
          href="/signup"
          className={buttonVariants({ variant: "link", size: "sm" })}
        >
          Create one
        </Link>
      </CardFooter>
    </Card>
  )
}
