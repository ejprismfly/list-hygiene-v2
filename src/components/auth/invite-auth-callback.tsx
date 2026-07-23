"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import type { EmailOtpType } from "@supabase/supabase-js"
import { AlertCircle, Loader2 } from "lucide-react"

import { AuthSuccessState } from "@/components/auth/auth-form-shell"
import { buttonVariants } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { safeNextPath } from "@/lib/url-safety.cjs"

type CallbackStatus = "loading" | "error"

const inviteOtpTypes = new Set(["invite"])

function isInviteOtpType(type: string | null): type is EmailOtpType {
  return Boolean(type && inviteOtpTypes.has(type))
}

function callbackParams() {
  const search = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""))

  return { hash, search }
}

export function InviteAuthCallback() {
  const [status, setStatus] = useState<CallbackStatus>("loading")
  const [message, setMessage] = useState("Preparing your invite.")
  const loginHref = useMemo(() => {
    if (typeof window === "undefined") {
      return "/login"
    }

    const { search } = callbackParams()
    const nextPath = safeNextPath(search.get("next"))

    return `/login?${new URLSearchParams({ next: nextPath }).toString()}`
  }, [])

  useEffect(() => {
    let cancelled = false

    async function prepareInviteSession() {
      const { hash, search } = callbackParams()
      const nextPath = safeNextPath(search.get("next") || hash.get("next"))
      const accessToken = hash.get("access_token")
      const refreshToken = hash.get("refresh_token")
      const tokenHash = search.get("token_hash") || hash.get("token_hash")
      const type = search.get("type") || hash.get("type")
      const code = search.get("code")
      const hashError = hash.get("error_description") || hash.get("error")

      if (hashError) {
        throw new Error(hashError)
      }

      setMessage("Verifying your invite.")
      const supabase = createClient()

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })

        if (error) {
          throw error
        }
      } else if (tokenHash && isInviteOtpType(type)) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type,
        })

        if (error) {
          throw error
        }
      } else if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)

        if (error) {
          throw error
        }
      } else {
        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (!session) {
          throw new Error("Invite session is missing or expired.")
        }
      }

      if (!cancelled) {
        setMessage("Opening workspace setup.")
        window.location.replace(nextPath)
      }
    }

    prepareInviteSession().catch((error: unknown) => {
      if (cancelled) {
        return
      }

      setStatus("error")
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to verify this invitation."
      )
    })

    return () => {
      cancelled = true
    }
  }, [])

  if (status === "error") {
    return (
      <AuthSuccessState
        icon={<AlertCircle className="size-12" strokeWidth={1.5} />}
        title="Unable To Verify Invite"
        description={
          <p>{message || "This invite link is invalid or expired."}</p>
        }
        footer={
          <Link href={loginHref} className={buttonVariants({ size: "sm" })}>
            Sign in
          </Link>
        }
      />
    )
  }

  return (
    <AuthSuccessState
      icon={<Loader2 className="size-12 animate-spin" strokeWidth={1.5} />}
      title="Verifying Invite"
      description={<p>{message}</p>}
    />
  )
}
