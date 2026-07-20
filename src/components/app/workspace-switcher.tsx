"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { createPortal } from "react-dom"
import {
  Archive,
  Loader2,
  Plus,
  Settings,
  Trash2,
  UserMinus,
  UserPlus,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  readWorkspaceSelection,
  serializeClientCookie,
  writeWorkspaceSelection,
  WORKSPACE_ID_COOKIE,
  WORKSPACE_ORGANIZATION_COOKIE,
} from "@/lib/workspace-utils"
import {
  ClientApiError,
  invalidateWorkspaceClientData,
  loadOrganizations,
  loadWorkspaces,
  type OrganizationOption,
  type WorkspaceOption,
} from "@/lib/workspace-client-data"

type WorkspaceSwitcherProps = {
  showOrganization?: boolean
}

type WorkspaceMember = {
  id: string
  user_id: string
  email: string | null
  name: string | null
  role: "owner" | "admin" | "member"
  status: "active" | "disabled" | "invited"
  workspace_ids: string[]
}

type WorkspaceInvitation = {
  id: string
  email: string
  role: "admin" | "member"
  status: "pending" | "accepted" | "revoked" | "expired"
  workspace_ids: string[]
}

function workspaceLabel(name: string) {
  return /\bworkspace\b/i.test(name) ? name : `${name} Workspace`
}

function canManage(role?: string | null) {
  return role === "owner" || role === "admin"
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
  if (typeof window === "undefined") {
    return
  }

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

function WorkspaceSwitchOverlay({
  active,
  workspaceName,
}: {
  active: boolean
  workspaceName: string
}) {
  if (!active || typeof document === "undefined") {
    return null
  }

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 isolate z-[2147483647] grid cursor-wait place-items-center bg-background/85 backdrop-blur-sm"
    >
      <div className="grid justify-items-center gap-3 rounded-lg border bg-card p-5 text-card-foreground shadow-sm">
        <Loader2 className="size-8 animate-spin" />
        <p className="text-sm font-medium">
          Switching to {workspaceName || "Workspace"}
        </p>
      </div>
    </div>,
    document.body
  )
}

export function WorkspaceSwitcher({
  showOrganization = false,
}: WorkspaceSwitcherProps) {
  const [organizations, setOrganizations] = useState<OrganizationOption[]>([])
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([])
  const [organizationsLoading, setOrganizationsLoading] = useState(true)
  const [workspacesLoading, setWorkspacesLoading] = useState(true)
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [invitations, setInvitations] = useState<WorkspaceInvitation[]>([])
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [draftName, setDraftName] = useState("")
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member")
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [managerOpen, setManagerOpen] = useState(false)
  const [creatingWorkspace, setCreatingWorkspace] = useState(false)
  const [message, setMessage] = useState("")
  const [switchingWorkspaceName, setSwitchingWorkspaceName] = useState("")
  const [isPending, startTransition] = useTransition()

  const selectedOrganization = organizations.find(
    (organization) => organization.id === organizationId
  )
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedId)
  const selectedMembers = members.filter((member) =>
    member.workspace_ids.includes(selectedId || "")
  )
  const selectedInvitations = invitations.filter((invitation) =>
    invitation.workspace_ids.includes(selectedId || "")
  )
  const managerEnabled = canManage(selectedOrganization?.role)

  useEffect(() => {
    let cancelled = false

    async function loadOrganizationOptions() {
      const data = await loadOrganizations()
      if (cancelled) {
        return
      }

      const stored = readWorkspaceSelection(window.localStorage)
      const nextOrganizationId =
        data.find((organization) => organization.id === stored.organizationId)
          ?.id ||
        data[0]?.id ||
        null

      setOrganizations(data)
      setOrganizationId(nextOrganizationId)
      setOrganizationsLoading(false)
    }

    loadOrganizationOptions().catch((error: unknown) => {
      const message = handleLoadError(error, "Unable to load organizations")
      if (message) {
        setMessage(message)
      }
      setOrganizationsLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!organizationId) {
      return
    }

    const activeOrganizationId = organizationId
    let cancelled = false

    async function loadWorkspaceOptions() {
      setWorkspacesLoading(true)
      const data = await loadWorkspaces(activeOrganizationId)
      if (cancelled) {
        return
      }

      const stored = readWorkspaceSelection(window.localStorage)
      const nextWorkspace =
        data.find((workspace) => workspace.id === stored.workspaceId) ||
        data.find((workspace) => workspace.is_default) ||
        data[0] ||
        null

      setWorkspaces(data)
      setSelectedId(nextWorkspace?.id || null)
      setEditName(nextWorkspace?.name || "")
      persistSelection(activeOrganizationId, nextWorkspace?.id || null)
      setWorkspacesLoading(false)
    }

    loadWorkspaceOptions().catch((error: unknown) => {
      const message = handleLoadError(error, "Unable to load workspaces")
      if (message) {
        setMessage(message)
      }
      setWorkspacesLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [organizationId, organizationsLoading])

  useEffect(() => {
    if (!organizationId || !managerOpen) {
      return
    }

    async function loadTeam() {
      const headers = headersFor(organizationId, selectedId)
      const [membersResponse, invitationsResponse] = await Promise.all([
        fetch("/api/organizations/members", { headers }),
        fetch("/api/organizations/invitations", { headers }),
      ])

      if (membersResponse.ok) {
        setMembers((await membersResponse.json()) as WorkspaceMember[])
      }
      if (invitationsResponse.ok) {
        setInvitations((await invitationsResponse.json()) as WorkspaceInvitation[])
      }
    }

    loadTeam()
  }, [organizationId, selectedId, managerOpen])

  function switchWorkspace(workspaceId: string) {
    const nextWorkspace = workspaces.find((workspace) => workspace.id === workspaceId)
    if (!nextWorkspace || nextWorkspace.id === selectedId) {
      return
    }

    setMessage("")
    setSwitchingWorkspaceName(workspaceLabel(nextWorkspace.name))
    persistSelection(organizationId, nextWorkspace.id)
    window.setTimeout(() => {
      window.location.reload()
    }, 450)
  }

  async function createWorkspace() {
    const name = draftName.trim()
    if (!organizationId || !name) {
      setMessage("Workspace name is required.")
      return
    }

    setCreatingWorkspace(true)
    const response = await fetch("/api/workspaces", {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: headersFor(organizationId, selectedId),
      body: JSON.stringify({ name }),
    })
    const data = await response.json()
    if (!response.ok) {
      setMessage(data.error || "Unable to create workspace.")
      setCreatingWorkspace(false)
      return
    }

    setDraftName("")
    setCreateDialogOpen(false)
    setCreatingWorkspace(false)
    invalidateWorkspaceClientData(organizationId)
    setWorkspaces((current) => [...current, data])
    setSwitchingWorkspaceName(workspaceLabel(data.name))
    persistSelection(organizationId, data.id)
    window.setTimeout(() => {
      window.location.reload()
    }, 450)
  }

  async function saveWorkspaceName() {
    if (!organizationId || !selectedWorkspace) {
      return
    }

    const response = await fetch("/api/workspaces", {
      method: "PATCH",
      headers: headersFor(organizationId, selectedId),
      body: JSON.stringify({ id: selectedWorkspace.id, name: editName }),
    })
    const data = await response.json()
    if (!response.ok) {
      setMessage(data.error || "Unable to update workspace.")
      return
    }

    invalidateWorkspaceClientData(organizationId)
    setWorkspaces((current) =>
      current.map((workspace) =>
        workspace.id === data.id ? { ...workspace, name: data.name } : workspace
      )
    )
    setMessage(`${workspaceLabel(data.name)} updated.`)
  }

  async function archiveSelectedWorkspace() {
    if (!organizationId || !selectedWorkspace) {
      return
    }

    const response = await fetch("/api/workspaces", {
      method: "DELETE",
      headers: headersFor(organizationId, selectedId),
      body: JSON.stringify({ id: selectedWorkspace.id }),
    })
    const data = await response.json()
    if (!response.ok) {
      setMessage(data.error || "Unable to archive workspace.")
      return
    }

    const nextWorkspace = workspaces.find(
      (workspace) => workspace.id !== selectedWorkspace.id
    )
    setDeleteDialogOpen(false)
    invalidateWorkspaceClientData(organizationId)
    setWorkspaces((current) =>
      current.filter((workspace) => workspace.id !== selectedWorkspace.id)
    )
    setMessage(`${workspaceLabel(selectedWorkspace.name)} archived.`)
    if (nextWorkspace) {
      setSwitchingWorkspaceName(workspaceLabel(nextWorkspace.name))
      persistSelection(organizationId, nextWorkspace.id)
      window.setTimeout(() => {
        window.location.reload()
      }, 450)
      return
    }

    setSelectedId(null)
    setEditName("")
    setManagerOpen(false)
    persistSelection(organizationId, null)
    window.setTimeout(() => {
      window.location.reload()
    }, 450)
  }

  async function inviteMember() {
    const email = inviteEmail.trim()
    if (!organizationId || !selectedWorkspace || !email) {
      setMessage("Member email is required.")
      return
    }

    const response = await fetch("/api/organizations/invitations", {
      method: "POST",
      headers: headersFor(organizationId, selectedId),
      body: JSON.stringify({
        email,
        role: inviteRole,
        workspace_ids: [selectedWorkspace.id],
      }),
    })
    const data = await response.json()
    if (!response.ok) {
      setMessage(data.error || "Unable to invite member.")
      return
    }

    setInviteEmail("")
    setInviteRole("member")
    setInvitations((current) => [data, ...current])
    setMessage(`${email} invited to ${workspaceLabel(selectedWorkspace.name)}.`)
  }

  async function updateMemberRole(member: WorkspaceMember, role: "admin" | "member") {
    if (!organizationId) {
      return
    }

    const response = await fetch("/api/organizations/members", {
      method: "PATCH",
      headers: headersFor(organizationId, selectedId),
      body: JSON.stringify({
        user_id: member.user_id,
        role,
        workspace_ids: member.workspace_ids,
      }),
    })

    if (!response.ok) {
      const data = await response.json()
      setMessage(data.error || "Unable to update member.")
      return
    }

    setMembers((current) =>
      current.map((item) =>
        item.user_id === member.user_id ? { ...item, role } : item
      )
    )
  }

  async function removeMember(member: WorkspaceMember) {
    if (!organizationId) {
      return
    }

    const response = await fetch("/api/organizations/members", {
      method: "DELETE",
      headers: headersFor(organizationId, selectedId),
      body: JSON.stringify({ user_id: member.user_id }),
    })

    if (!response.ok) {
      const data = await response.json()
      setMessage(data.error || "Unable to remove member.")
      return
    }

    setMembers((current) =>
      current.filter((item) => item.user_id !== member.user_id)
    )
  }

  async function cancelInvitation(invitation: WorkspaceInvitation) {
    if (!organizationId) {
      return
    }

    const response = await fetch("/api/organizations/invitations", {
      method: "PATCH",
      headers: headersFor(organizationId, selectedId),
      body: JSON.stringify({ id: invitation.id, status: "revoked" }),
    })

    if (!response.ok) {
      const data = await response.json()
      setMessage(data.error || "Unable to cancel invitation.")
      return
    }

    setInvitations((current) =>
      current.map((item) =>
        item.id === invitation.id ? { ...item, status: "revoked" } : item
      )
    )
  }

  const activeRows = useMemo(() => [...selectedMembers, ...selectedInvitations], [
    selectedMembers,
    selectedInvitations,
  ])
  const workspaceOptionsLoading =
    organizationsLoading || Boolean(organizationId && workspacesLoading)
  const workspaceSelectLabel =
    workspaceOptionsLoading
      ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" />
            Loading
          </span>
        )
      : selectedWorkspace?.name || "No workspace"

  return (
    <div className="grid gap-3">
      <WorkspaceSwitchOverlay
        active={Boolean(switchingWorkspaceName || isPending)}
        workspaceName={switchingWorkspaceName || "Workspace"}
      />

      {showOrganization && (
        <div className="grid gap-1">
          <Label className="text-xs text-muted-foreground">Organization</Label>
          <Badge variant="outline" className="w-fit max-w-full">
            <span className="truncate">
              {selectedOrganization?.name || "No organization"}
            </span>
          </Badge>
        </div>
      )}

      <div className="grid gap-1">
        <div className="flex items-center gap-2">
          <Select
            value={selectedId || ""}
            disabled={workspaceOptionsLoading || !workspaces.length}
            onValueChange={(value) => {
              if (value) {
                startTransition(() => switchWorkspace(value))
              }
            }}
          >
            <SelectTrigger className="min-w-0 flex-1">
              <SelectValue>{workspaceSelectLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {workspaces.map((workspace) => (
                <SelectItem key={workspace.id} value={workspace.id}>
                  {workspace.name || "Unnamed workspace"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Dialog open={managerOpen} onOpenChange={setManagerOpen}>
            <DialogTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={workspaceOptionsLoading || !selectedWorkspace}
                />
              }
            >
              <Settings className="size-4" />
              <span className="sr-only">Manage workspace</span>
            </DialogTrigger>
            <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-3xl">
              <DialogHeader>
                <DialogTitle>Manage workspace</DialogTitle>
                <DialogDescription>
                  Edit the current workspace, manage team access, or create another workspace.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-6">
                <section className="grid gap-3 rounded-lg border p-3">
                  <div className="grid gap-2">
                    <Label htmlFor="current-workspace-name">Workspace name</Label>
                    <div className="grid gap-2 sm:flex">
                      <Input
                        id="current-workspace-name"
                        value={editName}
                        disabled={!managerEnabled}
                        onChange={(event) => setEditName(event.target.value)}
                        placeholder="Workspace name"
                      />
                      <Button
                        type="button"
                        disabled={!managerEnabled}
                        onClick={saveWorkspaceName}
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                </section>

                <section className="grid gap-3 rounded-lg border p-3">
                  <div className="grid gap-2 sm:grid-cols-[1fr_9rem_auto] sm:items-end">
                    <div className="grid gap-2">
                      <Label htmlFor="member-email">Email</Label>
                      <Input
                        id="member-email"
                        type="email"
                        value={inviteEmail}
                        disabled={!managerEnabled}
                        onChange={(event) => setInviteEmail(event.target.value)}
                        placeholder="member@example.com"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Role</Label>
                      <Select
                        value={inviteRole}
                        disabled={!managerEnabled}
                        onValueChange={(value) =>
                          setInviteRole(value === "admin" ? "admin" : "member")
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue>{inviteRole}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="member">member</SelectItem>
                          <SelectItem value="admin">admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      type="button"
                      disabled={!managerEnabled}
                      onClick={inviteMember}
                    >
                      <UserPlus className="size-4" />
                      Invite
                    </Button>
                  </div>

                  <div className="overflow-x-auto">
                    <Table className="min-w-[38rem]">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Email</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead className="w-24" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {activeRows.map((row) => {
                          const isInvitation = "email" in row && !("user_id" in row)
                          const key = isInvitation
                            ? `invite:${row.id}`
                            : `member:${row.user_id}`
                          const email = row.email || "No email"
                          const status = row.status
                          const role = row.role === "owner" ? "admin" : row.role

                          return (
                            <TableRow key={key}>
                              <TableCell>{email}</TableCell>
                              <TableCell>
                                <Badge variant="secondary">{status}</Badge>
                              </TableCell>
                              <TableCell>
                                {isInvitation ? (
                                  role
                                ) : (
                                  <Select
                                    value={role}
                                    disabled={!managerEnabled || row.role === "owner"}
                                    onValueChange={(value) =>
                                      updateMemberRole(
                                        row,
                                        value === "admin" ? "admin" : "member"
                                      )
                                    }
                                  >
                                    <SelectTrigger className="w-28">
                                      <SelectValue>{role}</SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="member">member</SelectItem>
                                      <SelectItem value="admin">admin</SelectItem>
                                    </SelectContent>
                                  </Select>
                                )}
                              </TableCell>
                              <TableCell>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  disabled={!managerEnabled || (!isInvitation && row.role === "owner")}
                                  aria-label={
                                    isInvitation ? "Cancel invite" : "Remove member"
                                  }
                                  title={
                                    isInvitation ? "Cancel invite" : "Remove member"
                                  }
                                  onClick={() =>
                                    isInvitation
                                      ? cancelInvitation(row)
                                      : removeMember(row)
                                  }
                                >
                                  <UserMinus className="size-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </section>

                <section className="grid gap-3 rounded-lg border p-3">
                  <Separator />
                  <div className="grid gap-2 sm:flex">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={
                        !managerEnabled ||
                        !selectedWorkspace ||
                        selectedWorkspace.has_connected_account
                      }
                      onClick={archiveSelectedWorkspace}
                    >
                      <Archive className="size-4" />
                      Archive
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={
                        !managerEnabled ||
                        !selectedWorkspace ||
                        selectedWorkspace.has_connected_account
                      }
                      onClick={() => setDeleteDialogOpen(true)}
                    >
                      <Trash2 className="size-4" />
                      Delete
                    </Button>
                  </div>
                </section>

                <div className="grid gap-2 border-t pt-4 sm:flex sm:justify-end">
                  <Dialog
                    open={createDialogOpen}
                    onOpenChange={setCreateDialogOpen}
                  >
                    <DialogTrigger render={<Button type="button" disabled={!managerEnabled} />}>
                      <Plus className="size-4" />
                      Create workspace
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Create workspace</DialogTitle>
                        <DialogDescription>Add a new workspace.</DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-2">
                        <Label htmlFor="new-workspace-name">Workspace name</Label>
                        <Input
                          id="new-workspace-name"
                          value={draftName}
                          onChange={(event) => setDraftName(event.target.value)}
                          placeholder="Workspace name"
                        />
                      </div>
                      <div className="grid gap-2 sm:flex sm:justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          disabled={creatingWorkspace}
                          onClick={() => setCreateDialogOpen(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          disabled={creatingWorkspace || !draftName.trim()}
                          onClick={createWorkspace}
                        >
                          {creatingWorkspace && (
                            <Loader2 className="size-4 animate-spin" />
                          )}
                          Create and switch
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete workspace</DialogTitle>
            <DialogDescription>
              This will archive{" "}
              {selectedWorkspace
                ? workspaceLabel(selectedWorkspace.name)
                : "this workspace"}{" "}
              and hide it from the workspace list.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 sm:flex sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={
                !managerEnabled ||
                !selectedWorkspace ||
                selectedWorkspace.has_connected_account
              }
              onClick={archiveSelectedWorkspace}
            >
              <Trash2 className="size-4" />
              Delete workspace
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {message && <p className="text-xs text-muted-foreground">{message}</p>}
    </div>
  )
}
