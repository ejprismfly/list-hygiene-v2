"use client"

import { useMemo, useState } from "react"
import {
  Archive,
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
import { demoUser, type WorkspaceOption } from "@/lib/demo-data"

type WorkspaceSwitcherProps = {
  organizationName: string
  workspaces: WorkspaceOption[]
  showOrganization?: boolean
}

type WorkspaceMember = {
  id: string
  workspaceId: string
  email: string
  role: "admin" | "member"
  status: "active" | "pending"
}

const storageKey = "list-hygiene-workspace-id"
const initialMembers: WorkspaceMember[] = [
  {
    id: "member-owner",
    workspaceId: "8a1b3b27-fd47-4f8e-b4eb-37d47b32d824",
    email: demoUser.email,
    role: "admin",
    status: "active",
  },
  {
    id: "member-ops",
    workspaceId: "8a1b3b27-fd47-4f8e-b4eb-37d47b32d824",
    email: "ops@prismfly.com",
    role: "member",
    status: "active",
  },
  {
    id: "member-invite",
    workspaceId: "8a1b3b27-fd47-4f8e-b4eb-37d47b32d824",
    email: "analyst@prismfly.com",
    role: "member",
    status: "pending",
  },
  {
    id: "member-test-owner",
    workspaceId: "e4ab13de-2dc1-463f-ad80-a77525887b96",
    email: demoUser.email,
    role: "admin",
    status: "active",
  },
]

function workspaceLabel(name: string) {
  return /\bworkspace\b/i.test(name) ? name : `${name} Workspace`
}

function getInitialWorkspaceId(workspaces: WorkspaceOption[]) {
  if (typeof window === "undefined") {
    return workspaces[0]?.id ?? ""
  }

  const storedId = localStorage.getItem(storageKey)

  if (storedId && workspaces.some((workspace) => workspace.id === storedId)) {
    return storedId
  }

  return workspaces[0]?.id ?? ""
}

export function WorkspaceSwitcher({
  organizationName,
  workspaces,
  showOrganization = true,
}: WorkspaceSwitcherProps) {
  const [items, setItems] = useState(workspaces)
  const [selectedId, setSelectedId] = useState(() =>
    getInitialWorkspaceId(workspaces)
  )
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [draftName, setDraftName] = useState("")
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<WorkspaceMember["role"]>("member")
  const [members, setMembers] = useState(initialMembers)
  const [message, setMessage] = useState("")
  const [switchingWorkspaceName, setSwitchingWorkspaceName] = useState("")

  const activeItems = useMemo(
    () => items.filter((item) => !item.id.startsWith("archived:")),
    [items]
  )
  const selectedWorkspace = activeItems.find((item) => item.id === selectedId)
  const selectedMembers = members.filter(
    (member) => member.workspaceId === selectedWorkspace?.id
  )

  function beginWorkspaceSwitch(workspaceId: string, name: string) {
    if (workspaceId === selectedId) {
      return
    }

    setMessage("")
    setSwitchingWorkspaceName(workspaceLabel(name))

    window.setTimeout(() => {
      setSelectedId(workspaceId)
      localStorage.setItem(storageKey, workspaceId)
      setSwitchingWorkspaceName("")
    }, 650)
  }

  function switchWorkspace(workspaceId: string) {
    const nextWorkspace = activeItems.find((item) => item.id === workspaceId)

    if (!nextWorkspace) {
      return
    }

    beginWorkspaceSwitch(workspaceId, nextWorkspace.name)
  }

  function createWorkspace() {
    const name = draftName.trim()

    if (!name) {
      setMessage("Workspace name is required.")
      return
    }

    const nextWorkspace = {
      id: `local:${Date.now()}`,
      name,
      organizationName,
      hasConnectedAccount: false,
    }

    setItems((current) => [...current, nextWorkspace])
    setMembers((current) => [
      ...current,
      {
        id: `member:${nextWorkspace.id}`,
        workspaceId: nextWorkspace.id,
        email: demoUser.email,
        role: "admin",
        status: "active",
      },
    ])
    setDraftName("")
    setCreateDialogOpen(false)
    beginWorkspaceSwitch(nextWorkspace.id, nextWorkspace.name)
  }

  function updateSelectedWorkspaceName(name: string) {
    if (!selectedWorkspace) {
      return
    }

    setItems((current) =>
      current.map((item) =>
        item.id === selectedWorkspace.id ? { ...item, name } : item
      )
    )
    setMessage(`${workspaceLabel(name || "Workspace")} updated.`)
  }

  function archiveSelectedWorkspace() {
    if (!selectedWorkspace) {
      return
    }

    if (activeItems.length <= 1) {
      setMessage("At least one workspace must remain active.")
      return
    }

    if (selectedWorkspace.hasConnectedAccount) {
      setMessage(
        `${workspaceLabel(selectedWorkspace.name)} cannot be archived while it has a connected account.`
      )
      return
    }

    const nextItems = items.map((item) =>
      item.id === selectedWorkspace.id
        ? { ...item, id: `archived:${item.id}` }
        : item
    )
    const nextActiveItem = nextItems.find((item) => !item.id.startsWith("archived:"))

    setItems(nextItems)

    if (nextActiveItem) {
      setMessage(`${workspaceLabel(selectedWorkspace.name)} archived.`)
      switchWorkspace(nextActiveItem.id)
    }
  }

  function deleteSelectedWorkspace() {
    if (!selectedWorkspace) {
      return
    }

    if (activeItems.length <= 1) {
      setMessage("At least one workspace must remain active.")
      return
    }

    if (selectedWorkspace.hasConnectedAccount) {
      setMessage(
        `${workspaceLabel(selectedWorkspace.name)} cannot be deleted while it has a connected account.`
      )
      return
    }

    const nextItems = items.filter((item) => item.id !== selectedWorkspace.id)
    const nextWorkspace = nextItems.find((item) => !item.id.startsWith("archived:"))

    setItems(nextItems)
    setMembers((current) =>
      current.filter((member) => member.workspaceId !== selectedWorkspace.id)
    )

    if (nextWorkspace) {
      setMessage(`${workspaceLabel(selectedWorkspace.name)} deleted.`)
      switchWorkspace(nextWorkspace.id)
    }
  }

  function inviteMember() {
    const email = inviteEmail.trim()

    if (!selectedWorkspace || !email) {
      setMessage("Member email is required.")
      return
    }

    setMembers((current) => [
      ...current,
      {
        id: `invite:${Date.now()}`,
        workspaceId: selectedWorkspace.id,
        email,
        role: inviteRole,
        status: "pending",
      },
    ])
    setInviteEmail("")
    setInviteRole("member")
    setMessage(`${email} invited to ${workspaceLabel(selectedWorkspace.name)}.`)
  }

  function updateMemberRole(
    memberId: string,
    role: WorkspaceMember["role"] | null
  ) {
    if (!role) {
      return
    }

    setMembers((current) =>
      current.map((member) =>
        member.id === memberId ? { ...member, role } : member
      )
    )
  }

  function removeMember(memberId: string) {
    setMembers((current) => current.filter((member) => member.id !== memberId))
  }

  return (
    <div className="grid gap-3">
      {switchingWorkspaceName && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-0 z-[9999] grid place-items-center bg-background/80 backdrop-blur-sm"
        >
          <div className="grid justify-items-center gap-3 rounded-lg border bg-card p-5 text-card-foreground shadow-sm">
            <div className="size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
            <p className="text-sm font-medium">
              Switching to {switchingWorkspaceName}
            </p>
          </div>
        </div>
      )}

      {showOrganization && (
        <div className="grid gap-1">
          <Label className="text-xs text-muted-foreground">Organization</Label>
          <Badge variant="outline" className="w-fit max-w-full">
            <span className="truncate">{organizationName}</span>
          </Badge>
        </div>
      )}

      <div className="grid gap-1">
        <Label className="text-xs text-muted-foreground">Workspace</Label>
        <div className="flex items-center gap-2">
          <Select
            value={selectedId}
            onValueChange={(value) => {
              if (value) {
                switchWorkspace(value)
              }
            }}
          >
            <SelectTrigger className="min-w-0 flex-1">
              <SelectValue>
                {selectedWorkspace?.name || "Select workspace"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {activeItems.map((workspace) => (
                <SelectItem key={workspace.id} value={workspace.id}>
                  {workspace.name || "Unnamed workspace"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Dialog>
            <DialogTrigger render={<Button type="button" variant="outline" size="icon" />}>
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
                  <div className="grid gap-1">
                    <h3 className="text-sm font-medium">Workspace details</h3>
                    <p className="text-xs text-muted-foreground">
                      Update the display name for the selected workspace.
                    </p>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="current-workspace-name">Workspace name</Label>
                    <Input
                      id="current-workspace-name"
                      value={selectedWorkspace?.name ?? ""}
                      onChange={(event) =>
                        updateSelectedWorkspaceName(event.target.value)
                      }
                      placeholder="Workspace name"
                    />
                  </div>
                </section>

                <section className="grid gap-3 rounded-lg border p-3">
                  <div className="grid gap-1">
                    <h3 className="text-sm font-medium">Members and team</h3>
                    <p className="text-xs text-muted-foreground">
                      Invite members and adjust their workspace roles.
                    </p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[1fr_9rem_auto] sm:items-end">
                    <div className="grid gap-2">
                      <Label htmlFor="member-email">Email</Label>
                      <Input
                        id="member-email"
                        type="email"
                        value={inviteEmail}
                        onChange={(event) => setInviteEmail(event.target.value)}
                        placeholder="member@example.com"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Role</Label>
                      <Select
                        value={inviteRole}
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
                    <Button type="button" onClick={inviteMember}>
                      <UserPlus className="size-4" />
                      Invite
                    </Button>
                  </div>

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
                      {selectedMembers.map((member) => (
                        <TableRow key={member.id}>
                          <TableCell>{member.email}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{member.status}</Badge>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={member.role}
                              onValueChange={(value) =>
                                updateMemberRole(
                                  member.id,
                                  value === "admin" ? "admin" : "member"
                                )
                              }
                            >
                              <SelectTrigger className="w-28">
                                <SelectValue>{member.role}</SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="member">member</SelectItem>
                                <SelectItem value="admin">admin</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={
                                member.status === "pending"
                                  ? "Cancel invite"
                                  : "Remove member"
                              }
                              title={
                                member.status === "pending"
                                  ? "Cancel invite"
                                  : "Remove member"
                              }
                              onClick={() => removeMember(member.id)}
                            >
                              <UserMinus className="size-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </section>

                <section className="grid gap-3 rounded-lg border p-3">
                  <div className="grid gap-1">
                    <h3 className="text-sm font-medium">Archive or delete</h3>
                    <p className="text-xs text-muted-foreground">
                      Workspaces with connected accounts cannot be archived or deleted.
                    </p>
                  </div>
                  <Separator />
                  <div className="grid gap-2 sm:flex">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={archiveSelectedWorkspace}
                    >
                      <Archive className="size-4" />
                      Archive
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={deleteSelectedWorkspace}
                    >
                      <Trash2 className="size-4" />
                      Delete
                    </Button>
                  </div>
                </section>

                <div className="grid gap-2 border-t pt-4 sm:flex sm:justify-end">
                  <Dialog
                    open={createDialogOpen}
                    onOpenChange={(open) => setCreateDialogOpen(open)}
                  >
                    <DialogTrigger render={<Button type="button" />}>
                      <Plus className="size-4" />
                      Create workspace
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Create workspace</DialogTitle>
                        <DialogDescription>
                          {showOrganization
                            ? `Add a new workspace under ${organizationName}.`
                            : "Add a new workspace."}
                        </DialogDescription>
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
                          onClick={() => setCreateDialogOpen(false)}
                        >
                          Cancel
                        </Button>
                        <Button type="button" onClick={createWorkspace}>
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

      {message && <p className="text-xs text-muted-foreground">{message}</p>}
    </div>
  )
}
