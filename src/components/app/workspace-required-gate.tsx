"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  readWorkspaceSelection,
  serializeClientCookie,
  writeWorkspaceSelection,
  WORKSPACE_ID_COOKIE,
  WORKSPACE_ORGANIZATION_COOKIE,
} from "@/lib/workspace-utils"

type OrganizationOption = {
  id: string
  name: string
  role?: "owner" | "admin" | "member" | null
}

type WorkspaceOption = {
  id: string
  name: string
  is_default?: boolean | null
}

function canManage(role?: string | null) {
  return role === "owner" || role === "admin"
}

function headersFor(organizationId: string | null) {
  const headers = new Headers({ "Content-Type": "application/json" })
  if (organizationId) {
    headers.set("x-organization-id", organizationId)
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

async function responseErrorMessage(response: Response) {
  try {
    const data = (await response.json()) as { error?: string }
    return data.error || response.statusText
  } catch {
    return response.statusText
  }
}

export function WorkspaceRequiredGate() {
  const [organization, setOrganization] = useState<OrganizationOption | null>(null)
  const [workspaceRequired, setWorkspaceRequired] = useState(false)
  const [workspaceName, setWorkspaceName] = useState("")
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    let cancelled = false

    async function loadWorkspaceState() {
      const organizationResponse = await fetch("/api/organizations", {
        cache: "no-store",
        credentials: "same-origin",
      })
      if (!organizationResponse.ok) {
        if (organizationResponse.status === 401) {
          window.location.assign("/login")
          return
        }
        setMessage(
          `Unable to load organizations: ${await responseErrorMessage(
            organizationResponse
          )}`
        )
        return
      }

      const organizations =
        (await organizationResponse.json()) as OrganizationOption[]
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
        return
      }

      const workspaceResponse = await fetch("/api/workspaces", {
        cache: "no-store",
        credentials: "same-origin",
        headers: headersFor(nextOrganization.id),
      })
      if (!workspaceResponse.ok) {
        if (workspaceResponse.status === 401) {
          window.location.assign("/login")
          return
        }
        setMessage(
          `Unable to load workspaces: ${await responseErrorMessage(
            workspaceResponse
          )}`
        )
        return
      }

      const workspaces = (await workspaceResponse.json()) as WorkspaceOption[]
      if (cancelled) {
        return
      }

      const nextWorkspace =
        workspaces.find((workspace) => workspace.id === stored.workspaceId) ||
        workspaces.find((workspace) => workspace.is_default) ||
        workspaces[0] ||
        null

      if (nextWorkspace) {
        persistSelection(nextOrganization.id, nextWorkspace.id)
        setWorkspaceRequired(false)
        return
      }

      persistSelection(nextOrganization.id, null)
      setWorkspaceRequired(true)
    }

    loadWorkspaceState()

    return () => {
      cancelled = true
    }
  }, [])

  async function createWorkspace() {
    const name = workspaceName.trim()
    if (!organization || !name) {
      setMessage("Workspace name is required.")
      return
    }

    setCreating(true)
    const response = await fetch("/api/workspaces", {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: headersFor(organization.id),
      body: JSON.stringify({ name }),
    })
    const data = await response.json()

    if (!response.ok) {
      setMessage(data.error || "Unable to create workspace.")
      setCreating(false)
      return
    }

    persistSelection(organization.id, data.id)
    setWorkspaceRequired(false)
    window.location.reload()
  }

  const managerEnabled = canManage(organization?.role)

  return (
    <Dialog open={workspaceRequired} onOpenChange={() => undefined}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Create workspace</DialogTitle>
          <DialogDescription>
            A workspace is required before continuing.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            void createWorkspace()
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="required-workspace-name">Workspace name</Label>
            <Input
              id="required-workspace-name"
              value={workspaceName}
              disabled={!managerEnabled || creating}
              onChange={(event) => setWorkspaceName(event.target.value)}
              placeholder="Workspace name"
              autoFocus
            />
          </div>
          {!managerEnabled && (
            <p className="text-sm text-muted-foreground">
              Only organization owners and admins can create workspaces.
            </p>
          )}
          {message && <p className="text-sm text-muted-foreground">{message}</p>}
          <Button
            type="submit"
            disabled={!managerEnabled || creating || !workspaceName.trim()}
          >
            {creating && <Loader2 className="size-4 animate-spin" />}
            Create workspace
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
