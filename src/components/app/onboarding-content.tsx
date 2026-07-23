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
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  openKlaviyoOAuthPopup,
  startKlaviyoOAuth,
} from "@/lib/klaviyo-oauth"
import {
  ClientApiError,
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
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([])
  const [workspace, setWorkspace] = useState<WorkspaceOption | null>(null)
  const [workspaceLoading, setWorkspaceLoading] = useState(true)

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

      setWorkspaces(workspaces)
      setWorkspace(nextWorkspace)
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

  function selectWorkspace(workspaceId: string | null) {
    if (!workspaceId) {
      return
    }

    const nextWorkspace =
      workspaces.find((item) => item.id === workspaceId) || null

    if (!organization || !nextWorkspace) {
      return
    }

    setWorkspace(nextWorkspace)
    persistSelection(organization.id, nextWorkspace.id)
  }

  async function connectKlaviyo() {
    setStatusMessage("")
    setConnecting(true)
    const popup = openKlaviyoOAuthPopup()
    try {
      if (!organization) {
        popup?.close()
        setStatusMessage("Unable to load organization.")
        return
      }

      if (!canUseOnboarding(organization.role)) {
        popup?.close()
        window.location.assign("/dashboard")
        return
      }

      if (!workspace) {
        popup?.close()
        setStatusMessage("Select a workspace to continue.")
        return
      }

      persistSelection(organization.id, workspace.id)
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
              Choose the workspace where this Klaviyo connection and reports will live.
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
                <Label htmlFor="onboarding-workspace-select">Workspace</Label>
                <Select
                  value={workspace?.id || ""}
                  onValueChange={selectWorkspace}
                  disabled={connecting || workspaces.length <= 1}
                >
                  <SelectTrigger
                    id="onboarding-workspace-select"
                    className="w-full"
                  >
                    <SelectValue>
                      {workspace?.name || "Select workspace"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {workspaces.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {workspace && workspaces.length <= 1 ? (
                  <p className="text-sm text-muted-foreground">
                    {workspace.name} is selected as your default workspace.
                  </p>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>
        <div className="pt-4">
          <Button
            type="button"
            disabled={connecting || workspaceLoading || !workspace}
            onClick={connectKlaviyo}
          >
            {connecting && <Loader2 className="size-4 animate-spin" />}
            Connect Klaviyo
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
