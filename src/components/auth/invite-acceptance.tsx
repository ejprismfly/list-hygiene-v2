"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { AlertCircle, CheckCircle2, Loader2, UserPlus } from "lucide-react"

import { AuthSuccessState } from "@/components/auth/auth-form-shell"
import { Button, buttonVariants } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import {
  clearWorkspaceClientState,
  serializeClientCookie,
  writeWorkspaceSelection,
  WORKSPACE_ID_COOKIE,
  WORKSPACE_ORGANIZATION_COOKIE,
} from "@/lib/workspace-utils"

type InviteAcceptanceProps = {
  token: string
  userEmail: string | null
  loginAgainAfterAccept?: boolean
}

type AcceptInviteResponse = {
  organization_id?: string
  workspace_ids?: string[]
  error?: string
}

type AcceptStatus = "idle" | "loading" | "success" | "error"

function persistAcceptedWorkspace(data: AcceptInviteResponse) {
  const organizationId =
    typeof data.organization_id === "string" ? data.organization_id : null
  const workspaceId = Array.isArray(data.workspace_ids)
    ? data.workspace_ids.find((id) => typeof id === "string") || null
    : null

  writeWorkspaceSelection({ organizationId, workspaceId }, window.localStorage)
  document.cookie = serializeClientCookie(
    WORKSPACE_ORGANIZATION_COOKIE,
    organizationId
  )
  document.cookie = serializeClientCookie(WORKSPACE_ID_COOKIE, workspaceId)
}

async function clearInviteSession() {
  try {
    await createClient().auth.signOut()
  } catch {
    // The invite has already been accepted; still clear local workspace state.
  }

  clearWorkspaceClientState(window.localStorage)
}

export function InviteAcceptance({
  token,
  userEmail,
  loginAgainAfterAccept = false,
}: InviteAcceptanceProps) {
  const [status, setStatus] = useState<AcceptStatus>(
    token && userEmail ? "loading" : "idle"
  )
  const [message, setMessage] = useState("")
  const invitePath = useMemo(() => {
    return `/invite?token=${encodeURIComponent(token)}`
  }, [token])
  const authQuery = useMemo(() => {
    return new URLSearchParams({ next: invitePath }).toString()
  }, [invitePath])

  useEffect(() => {
    if (!token || !userEmail) {
      return
    }

    let cancelled = false

    async function acceptInvitation() {
      setStatus("loading")
      try {
        const response = await fetch("/api/organizations/invitations/accept", {
          method: "POST",
          cache: "no-store",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        })
        const data = (await response.json()) as AcceptInviteResponse

        if (cancelled) {
          return
        }

        if (!response.ok) {
          setStatus("error")
          setMessage(data.error || "Unable to accept this invitation.")
          return
        }

        if (loginAgainAfterAccept) {
          await clearInviteSession()
        } else {
          persistAcceptedWorkspace(data)
        }

        setStatus("success")
        setMessage(
          loginAgainAfterAccept
            ? "Your password is set and your invite has been accepted. Log in again to open the workspace."
            : "Your workspace access is ready."
        )
      } catch {
        if (!cancelled) {
          setStatus("error")
          setMessage("Unable to accept this invitation right now.")
        }
      }
    }

    acceptInvitation()

    return () => {
      cancelled = true
    }
  }, [loginAgainAfterAccept, token, userEmail])

  if (!token) {
    return (
      <AuthSuccessState
        icon={<AlertCircle className="size-12" strokeWidth={1.5} />}
        title="Invalid Invite"
        description={<p>This invitation link is missing its invite token.</p>}
        footer={
          <Link href="/dashboard" className={buttonVariants({ size: "sm" })}>
            Go to dashboard
          </Link>
        }
      />
    )
  }

  if (!userEmail) {
    return (
      <AuthSuccessState
        icon={<UserPlus className="size-12" strokeWidth={1.5} />}
        title="Accept Invite"
        description={
          <p>Sign in or create an account with the invited email address.</p>
        }
        footer={
          <div className="grid gap-2 sm:flex">
            <Link
              href={`/login?${authQuery}`}
              className={buttonVariants({ size: "sm" })}
            >
              Login
            </Link>
            <Link
              href={`/signup?${authQuery}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Sign up
            </Link>
          </div>
        }
      />
    )
  }

  if (status === "loading") {
    return (
      <AuthSuccessState
        icon={<Loader2 className="size-12 animate-spin" strokeWidth={1.5} />}
        title="Accepting Invite"
        description={<p>Adding {userEmail} to the workspace.</p>}
      />
    )
  }

  if (status === "success") {
    return (
      <AuthSuccessState
        icon={<CheckCircle2 className="size-12" strokeWidth={1.5} />}
        title="Invite Accepted"
        description={<p>{message}</p>}
        footer={
          <Link
            href={
              loginAgainAfterAccept
                ? `/login?${new URLSearchParams({
                    next: "/dashboard",
                  }).toString()}`
                : "/dashboard"
            }
            className={buttonVariants({ size: "sm" })}
          >
            {loginAgainAfterAccept ? "Log in again" : "Go to dashboard"}
          </Link>
        }
      />
    )
  }

  return (
    <AuthSuccessState
      icon={<AlertCircle className="size-12" strokeWidth={1.5} />}
      title="Unable To Accept Invite"
      description={<p>{message || "The invitation could not be accepted."}</p>}
      footer={
        <Button type="button" size="sm" onClick={() => window.location.reload()}>
          Try again
        </Button>
      }
    />
  )
}
