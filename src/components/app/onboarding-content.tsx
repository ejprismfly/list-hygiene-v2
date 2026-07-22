"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
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
import { Skeleton } from "@/components/ui/skeleton"
import {
  openKlaviyoOAuthPopup,
  startKlaviyoOAuth,
} from "@/lib/klaviyo-oauth"
import {
  ClientApiError,
  invalidateWorkspaceClientData,
  loadOrganizations,
  loadWorkspaces,
  type OrganizationOption,
  type WorkspaceOption,
} from "@/lib/workspace-client-data"
import {
  readWorkspaceSelection,
  serializeClientCookie,
  writeWorkspaceSelection,
  WORKSPACE_ID_COOKIE,
  WORKSPACE_ORGANIZATION_COOKIE,
} from "@/lib/workspace-utils"

function canUseOnboarding(role?: string | null) {
  return role === "owner"
}

function headersFor(organizationId: string | null, workspaceId?: string | null) {
  const headers = new Headers({ "Content-Type": "application/json" })
  if (organizationId) {
    headers.set("x-organization-id", organizationId)
  }
  if (workspaceId) {
    headers.set("x-workspace-id", workspaceId)
  }
  return headers
}

function persistSelection(organizationId: string | null, workspaceId: string | null) {
  writeWorkspaceSelection({ organizationId, workspaceId }, window.localStorage)
  document.cookie = serializeClientCookie(
    WORKSPACE_ORGANIZATION_COOKIE,
    organizationId
  )
  document.cookie = serializeClientCookie(WORKSPACE_ID_COOKIE, workspaceId)
}

function handleLoadError(error: unknown, fallback: string) {
  if (error instanceof ClientApiError) {
    if (error.status === 401) {
      window.location.assign("/login")
      return ""
    }

    return `${fallback}: ${error.message}`
  }

  return fallback
}

export function OnboardingContent() {
  const [statusMessage, setStatusMessage] = useState("")
  const [connecting, setConnecting] = useState(false)
  const [organization, setOrganization] = useState<OrganizationOption | null>(
    null
  )
  const [workspace, setWorkspace] = useState<WorkspaceOption | null>(null)
  const [workspaceName, setWorkspaceName] = useState("")
  const [workspaceLoading, setWorkspaceLoading] = useState(true)
  const [savingWorkspace, setSavingWorkspace] = useState(false)

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.data?.status === "connected") {
        setStatusMessage("Klaviyo connected. Opening integration settings.")
        window.setTimeout(() => {
          window.location.assign("/settings?connected=1")
        }, 600)
      }

      if (event.data?.status === "blocked") {
        setStatusMessage("That Klaviyo account is already connected.")
        window.setTimeout(() => {
          window.location.assign("/settings")
        }, 900)
      }

      if (event.data?.status === "failed") {
        setStatusMessage("Unable to connect Klaviyo. Please try again.")
      }
    }

    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadWorkspaceForOnboarding() {
      setWorkspaceLoading(true)
      const organizations = await loadOrganizations()
      if (cancelled) {
        return
      }

      const stored = readWorkspaceSelection(window.localStorage)
      const nextOrganization =
        organizations.find((item) => item.id === stored.organizationId) ||
        organizations[0] ||
        null

      setOrganization(nextOrganization)
      if (!nextOrganization) {
        setStatusMessage("Unable to load organization.")
        setWorkspaceLoading(false)
        return
      }

      const workspaces = await loadWorkspaces(nextOrganization.id)
      if (cancelled) {
        return
      }

      const nextWorkspace =
        workspaces.find((item) => item.id === stored.workspaceId) ||
        workspaces.find((item) => item.is_default) ||
        workspaces[0] ||
        null

      const nextWorkspaceName =
        nextWorkspace?.is_default && nextWorkspace.name === "Default Workspace"
          ? ""
          : nextWorkspace?.name || ""

      setWorkspace(nextWorkspace)
      setWorkspaceName(nextWorkspaceName)
      persistSelection(nextOrganization.id, nextWorkspace?.id || null)

      if (!canUseOnboarding(nextOrganization.role)) {
        window.location.assign("/dashboard")
        return
      }

      setWorkspaceLoading(false)
    }

    loadWorkspaceForOnboarding().catch((error: unknown) => {
      const message = handleLoadError(
        error,
        "Unable to load onboarding workspace"
      )
      if (message) {
        setStatusMessage(message)
      }
      setWorkspaceLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [])

  async function saveWorkspaceForOnboarding() {
    const name = workspaceName.trim()

    if (!organization) {
      setStatusMessage("Unable to load organization.")
      return null
    }

    if (!canUseOnboarding(organization.role)) {
      window.location.assign("/dashboard")
      return null
    }

    if (!name) {
      setStatusMessage("Workspace name is required.")
      return null
    }

    setSavingWorkspace(true)
    try {
      const response = await fetch("/api/workspaces", {
        method: workspace ? "PATCH" : "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: headersFor(organization.id, workspace?.id || null),
        body: JSON.stringify(
          workspace ? { id: workspace.id, name } : { name }
        ),
      })
      const data = (await response.json()) as WorkspaceOption & {
        error?: string
      }

      if (!response.ok) {
        setStatusMessage(data.error || "Unable to save workspace name.")
        return null
      }

      invalidateWorkspaceClientData(organization.id)
      setWorkspace(data)
      setWorkspaceName(data.name)
      persistSelection(organization.id, data.id)
      return data
    } catch {
      setStatusMessage("Unable to save workspace name.")
      return null
    } finally {
      setSavingWorkspace(false)
    }
  }

  async function connectKlaviyo() {
    setStatusMessage("")
    setConnecting(true)
    const popup = openKlaviyoOAuthPopup()
    try {
      const savedWorkspace = await saveWorkspaceForOnboarding()
      if (!savedWorkspace) {
        popup?.close()
        return
      }

      const started = await startKlaviyoOAuth({
        popup,
        onMissingClientId: () =>
          setStatusMessage("Klaviyo client ID is not configured."),
      })
      if (started) {
        setStatusMessage("Opening Klaviyo authorization.")
      }
    } catch {
      popup?.close()
      setStatusMessage("Unable to connect Klaviyo. Please try again.")
    } finally {
      setConnecting(false)
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-4 sm:p-6">
      <div className="grid max-w-3xl gap-5 text-center">
        <h1 className="text-3xl font-semibold tracking-normal sm:text-5xl">
          Let&apos;s Get You Connected!
        </h1>
        <p className="text-base text-muted-foreground sm:text-lg">
          We noticed you haven&apos;t connected your Klaviyo account yet. Let&apos;s
          walk through it together.
        </p>
        <div>
          <Badge variant="secondary" className="h-auto whitespace-normal px-4 py-2 text-center text-sm sm:text-base">
            Eligible users unlock 300 trial credits when connecting an email platform. *
          </Badge>
        </div>
        <Card className="mx-auto w-full max-w-md text-left">
          <CardHeader>
            <CardTitle>Workspace</CardTitle>
            <CardDescription>
              Name the workspace where this Klaviyo connection and reports will live.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {workspaceLoading ? (
              <div className="grid gap-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <div className="grid gap-2">
                <Label htmlFor="onboarding-workspace-name">Workspace name</Label>
                <Input
                  id="onboarding-workspace-name"
                  value={workspaceName}
                  onChange={(event) => setWorkspaceName(event.target.value)}
                  placeholder="Workspace name"
                  maxLength={80}
                  disabled={connecting || savingWorkspace}
                />
              </div>
            )}
          </CardContent>
        </Card>
        <div className="pt-4">
          <Button
            type="button"
            disabled={
              connecting ||
              savingWorkspace ||
              workspaceLoading ||
              !workspaceName.trim()
            }
            onClick={connectKlaviyo}
          >
            {connecting && <Loader2 className="size-4 animate-spin" />}
            Save workspace and connect Klaviyo
          </Button>
        </div>
        {statusMessage && (
          <p className="text-sm text-muted-foreground">{statusMessage}</p>
        )}
        <p className="text-sm text-muted-foreground">
          Having any issues? Contact{" "}
          <a
            href="mailto:support@listhygiene.com"
            className="font-medium underline underline-offset-4"
          >
            support@listhygiene.com
          </a>
        </p>
        <p className="mx-auto max-w-xl text-xs">
          * A user can only redeem trial credits one time. Email platform
          accounts which have previously been connected to List Hygiene or used
          to redeem a trial are not eligible.
        </p>
      </div>
    </main>
  )
}
