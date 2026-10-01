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
        throw new Error("This invite link is invalid or expired.")
      }

      setMessage("Verifying your invite.")
      if (tokenHash && isInviteOtpType(type) && !code && !accessToken && !refreshToken) {
        const params = new URLSearchParams({ token_hash: tokenHash, type: "invite", next: nextPath })
        window.location.replace(`/auth/callback?${params}`)
        return
      }
      if (code && !tokenHash && !accessToken && !refreshToken) {
        window.location.replace(`/auth/callback?${new URLSearchParams({ code, type: "invite", next: nextPath })}`)
        return
      }
      if (!accessToken || !refreshToken || type !== "invite") throw new Error("This invite link is invalid or expired. Request a new invitation.")
      const supabase = createClient()
      const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      if (error) throw new Error("This invite link is invalid or expired.")
      window.history.replaceState(null, "", window.location.pathname + window.location.search)
      const response = await fetch("/api/auth/invite-session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ next: nextPath }) })
      const result = await response.json()
      if (!response.ok) throw new Error("This invite link is invalid or expired. Request a new invitation.")

      if (!cancelled) {
        setMessage("Opening workspace setup.")
        window.location.replace(`/reset-password?${new URLSearchParams({ next: safeNextPath(result.next) })}`)
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
