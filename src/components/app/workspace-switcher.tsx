"use client"

import { useEffect, useState, useTransition } from "react"
import { createPortal } from "react-dom"
import {
  Copy,
  Crown,
  KeyRound,
  Loader2,
  Plus,
  Send,
  Settings,
  Trash2,
  UserMinus,
  UserPlus,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
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
import { Skeleton } from "@/components/ui/skeleton"
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
  invite_url?: string
  token?: string
}

type InvitationResponse = WorkspaceInvitation & {
  accepted?: boolean
  email_delivery?: "existing_user" | "manual_link" | "supabase_auth"
  email_delivery_error?: string | null
  member?: WorkspaceMember
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
  const [teamLoading, setTeamLoading] = useState(false)
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [invitations, setInvitations] = useState<WorkspaceInvitation[]>([])
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [draftName, setDraftName] = useState("")
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member")
  const [lastInviteLink, setLastInviteLink] = useState("")
  const [inviteStatusMessage, setInviteStatusMessage] = useState("")
  const [inviteStatusIsError, setInviteStatusIsError] = useState(false)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [managerOpen, setManagerOpen] = useState(false)
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false)
  const [archiveBlockedDialogOpen, setArchiveBlockedDialogOpen] = useState(false)
  const [archiveConfirmation, setArchiveConfirmation] = useState("")
  const [memberRemovalDialogOpen, setMemberRemovalDialogOpen] = useState(false)
  const [memberToRemove, setMemberToRemove] =
    useState<WorkspaceMember | null>(null)
  const [invitationCancelDialogOpen, setInvitationCancelDialogOpen] =
    useState(false)
  const [invitationToCancel, setInvitationToCancel] =
    useState<WorkspaceInvitation | null>(null)
  const [transferDialogOpen, setTransferDialogOpen] = useState(false)
  const [transferOwnerUserId, setTransferOwnerUserId] = useState("")
  const [transferPassword, setTransferPassword] = useState("")
  const [transferringOwnership, setTransferringOwnership] = useState(false)
  const [creatingWorkspace, setCreatingWorkspace] = useState(false)
  const [savingWorkspaceName, setSavingWorkspaceName] = useState(false)
  const [invitingMember, setInvitingMember] = useState(false)
  const [resendingInvitationId, setResendingInvitationId] = useState<
    string | null
  >(null)
  const [updatingMemberUserId, setUpdatingMemberUserId] = useState<string | null>(
    null
  )
  const [archivingWorkspace, setArchivingWorkspace] = useState(false)
  const [teamActionSubmitting, setTeamActionSubmitting] = useState(false)
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
    (invitation.status === "pending" || invitation.status === "expired") &&
    invitation.workspace_ids.includes(selectedId || "")
  )
  const managerEnabled = canManage(selectedWorkspace?.role)
  const ownerEnabled = selectedWorkspace?.role === "owner"
  const selectedOwner = selectedMembers.find((member) => member.role === "owner")
  const ownershipTransferCandidates = selectedMembers.filter(
    (member) => member.role === "admin" && member.status === "active"
  )
  const workspaceArchiveBlocked =
    Boolean(selectedWorkspace?.has_connected_account) ||
    Boolean(selectedWorkspace?.has_active_billing)
  const workspaceArchiveBlockedReason = !ownerEnabled
    ? "Only workspace owners can delete workspaces."
    : selectedWorkspace?.has_active_billing
      ? "Cancel active billing before deleting this workspace."
      : selectedWorkspace?.has_connected_account
        ? "Disconnect or move connected Klaviyo accounts before deleting this workspace."
        : ""
  const archiveConfirmationMatches =
    Boolean(selectedWorkspace?.name) &&
    archiveConfirmation.trim() === selectedWorkspace?.name
  const memberRemovalName =
    memberToRemove?.email || memberToRemove?.name || "this member"
  const memberRemovalBlockedReason =
    memberToRemove?.role === "owner"
      ? "Transfer ownership before removing the workspace owner."
      : ""
  const invitationCancelName = invitationToCancel?.email || "this invitation"

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

    let cancelled = false

    async function loadTeam() {
      setTeamLoading(true)
      const headers = headersFor(organizationId, selectedId)
      const [membersResponse, invitationsResponse] = await Promise.all([
        fetch("/api/organizations/members", { headers }),
        fetch("/api/organizations/invitations", { headers }),
      ])

      if (cancelled) {
        return
      }

      if (membersResponse.ok) {
        setMembers((await membersResponse.json()) as WorkspaceMember[])
      }
      if (invitationsResponse.ok) {
        setInvitations((await invitationsResponse.json()) as WorkspaceInvitation[])
      }
    }

    loadTeam()
      .catch(() => {
        if (!cancelled) {
          setMessage("Unable to load team members.")
        }
      })
      .finally(() => {
        if (!cancelled) {
          setTeamLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
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
    if (!managerEnabled) {
      setMessage("Only owners and admins can create workspaces.")
      return
    }

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

    if (!managerEnabled) {
      setMessage("Only owners and admins can update workspace settings.")
      return
    }

    setSavingWorkspaceName(true)
    try {
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
    } catch {
      setMessage("Unable to update workspace.")
    } finally {
      setSavingWorkspaceName(false)
    }
  }

  function openArchiveWorkspaceDialog() {
    if (workspaceArchiveBlockedReason) {
      setArchiveBlockedDialogOpen(true)
      return
    }

    setArchiveDialogOpen(true)
  }

  async function archiveWorkspace() {
    if (
      !organizationId ||
      !selectedWorkspace ||
      !archiveConfirmationMatches ||
      !ownerEnabled ||
      workspaceArchiveBlocked
    ) {
      return
    }

    setArchivingWorkspace(true)
    try {
      const response = await fetch("/api/workspaces", {
        method: "DELETE",
        cache: "no-store",
        credentials: "same-origin",
        headers: headersFor(organizationId, selectedWorkspace.id),
        body: JSON.stringify({ id: selectedWorkspace.id }),
      })
      const data = await response.json()
      if (!response.ok) {
        setMessage(data.error || "Unable to archive workspace.")
        return
      }

      const nextWorkspace =
        workspaces.find((workspace) => workspace.id !== selectedWorkspace.id) ||
        null

      setArchiveDialogOpen(false)
      setArchiveConfirmation("")
      setManagerOpen(false)
      setWorkspaces((current) =>
        current.filter((workspace) => workspace.id !== selectedWorkspace.id)
      )
      setSelectedId(nextWorkspace?.id || null)
      invalidateWorkspaceClientData(organizationId)
      persistSelection(organizationId, nextWorkspace?.id || null)
      setSwitchingWorkspaceName(
        nextWorkspace ? workspaceLabel(nextWorkspace.name) : "Workspace"
      )
      window.setTimeout(() => {
        window.location.reload()
      }, 450)
    } finally {
      setArchivingWorkspace(false)
    }
  }

  async function inviteMember() {
    const email = inviteEmail.trim()
    setInviteStatusMessage("")
    setInviteStatusIsError(false)

    if (!managerEnabled) {
      setInviteStatusMessage("Only owners and admins can invite members.")
      setInviteStatusIsError(true)
      return
    }

    if (!organizationId || !selectedWorkspace || !email) {
      setInviteStatusMessage("Member email is required.")
      setInviteStatusIsError(true)
      return
    }

    setInvitingMember(true)
    const payload = {
      email,
      role: inviteRole,
      workspace_ids: [selectedWorkspace.id],
    }
    try {
      const memberResponse = await fetch("/api/organizations/members", {
        method: "POST",
        headers: headersFor(organizationId, selectedId),
        body: JSON.stringify(payload),
      })
      const memberData = await memberResponse.json()

      if (memberResponse.ok) {
        setInviteEmail("")
        setInviteRole("member")
        setLastInviteLink("")
        setMembers((current) => {
          const nextMember = memberData as WorkspaceMember
          const existingIndex = current.findIndex(
            (member) => member.user_id === nextMember.user_id
          )
          if (existingIndex === -1) {
            return [nextMember, ...current]
          }

          return current.map((member, index) =>
            index === existingIndex ? nextMember : member
          )
        })
        setInviteStatusMessage(
          `${email} added to ${workspaceLabel(selectedWorkspace.name)}.`
        )
        return
      }

      if (memberResponse.status !== 404) {
        setInviteStatusMessage(memberData.error || "Unable to add member.")
        setInviteStatusIsError(true)
        return
      }

      const response = await fetch("/api/organizations/invitations", {
        method: "POST",
        headers: headersFor(organizationId, selectedId),
        body: JSON.stringify(payload),
      })
      const data = (await response.json()) as InvitationResponse & {
        error?: string
        resent?: boolean
      }
      if (!response.ok) {
        setInviteStatusMessage(data.error || "Unable to invite member.")
        setInviteStatusIsError(true)
        return
      }

      setInviteEmail("")
      setInviteRole("member")
      if (data.member) {
        const nextMember = data.member
        setLastInviteLink("")
        setMembers((current) => {
          const existingIndex = current.findIndex(
            (member) => member.user_id === nextMember.user_id
          )
          if (existingIndex === -1) {
            return [nextMember, ...current]
          }

          return current.map((member, index) =>
            index === existingIndex ? nextMember : member
          )
        })
        setInvitations((current) =>
          current.filter(
            (invitation) => invitation.email.toLowerCase() !== email.toLowerCase()
          )
        )
        setInviteStatusMessage(
          `${email} added to ${workspaceLabel(selectedWorkspace.name)}.`
        )
        return
      }

      setLastInviteLink(data.invite_url || "")
      setInvitations((current) => {
        const invitation = data as WorkspaceInvitation
        const existingIndex = current.findIndex((item) => item.id === invitation.id)
        if (existingIndex === -1) {
          return [invitation, ...current]
        }

        return current.map((item, index) =>
          index === existingIndex ? invitation : item
        )
      })
      if (data.email_delivery === "manual_link") {
        setInviteStatusMessage(
          `${email} invite link refreshed. Copy the link to send it manually.`
        )
        return
      }

      const inviteVerb = data.resent ? "resent" : "invited"
      setInviteStatusMessage(
        `${email} ${inviteVerb} to ${workspaceLabel(selectedWorkspace.name)}.`
      )
    } catch {
      setInviteStatusMessage("Unable to invite member.")
      setInviteStatusIsError(true)
    } finally {
      setInvitingMember(false)
    }
  }

  async function copyInviteLink() {
    if (!lastInviteLink) {
      return
    }

    try {
      await navigator.clipboard.writeText(lastInviteLink)
      setMessage("Invite link copied.")
    } catch {
      setMessage("Unable to copy invite link.")
    }
  }

  async function resendInvitation(invitation: WorkspaceInvitation) {
    if (!managerEnabled) {
      setInviteStatusMessage("Only owners and admins can resend invites.")
      setInviteStatusIsError(true)
      return
    }

    if (!organizationId || resendingInvitationId) {
      return
    }

    setResendingInvitationId(invitation.id)
    setInviteStatusMessage("")
    setInviteStatusIsError(false)
    try {
      const response = await fetch("/api/organizations/invitations", {
        method: "PATCH",
        headers: headersFor(organizationId, selectedId),
        body: JSON.stringify({ id: invitation.id, action: "resend" }),
      })
      const data = (await response.json()) as InvitationResponse & {
        error?: string
      }
      if (!response.ok) {
        setInviteStatusMessage(data.error || "Unable to resend invite.")
        setInviteStatusIsError(true)
        return
      }

      setLastInviteLink(data.invite_url || "")
      setInvitations((current) =>
        current.map((item) =>
          item.id === invitation.id
            ? { ...item, ...(data as WorkspaceInvitation), status: "pending" }
            : item
        )
      )
      setInviteStatusMessage(
        data.email_delivery === "manual_link"
          ? `${invitation.email} invite link refreshed. Copy the link to send it manually.`
          : `${invitation.email} invite resent.`
      )
    } catch {
      setInviteStatusMessage("Unable to resend invite.")
      setInviteStatusIsError(true)
    } finally {
      setResendingInvitationId(null)
    }
  }

  async function updateMemberRole(member: WorkspaceMember, role: "admin" | "member") {
    if (
      !managerEnabled ||
      !organizationId ||
      member.role === role ||
      updatingMemberUserId
    ) {
      return
    }

    setUpdatingMemberUserId(member.user_id)
    try {
      const response = await fetch("/api/organizations/members", {
        method: "PATCH",
        headers: headersFor(organizationId, selectedId),
        body: JSON.stringify({
          user_id: member.user_id,
          role,
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
    } catch {
      setMessage("Unable to update member.")
    } finally {
      setUpdatingMemberUserId(null)
    }
  }

  function openRemoveMemberDialog(member: WorkspaceMember) {
    if (!managerEnabled) {
      return
    }

    setMemberToRemove(member)
    setMemberRemovalDialogOpen(true)
  }

  async function removeMember() {
    if (!managerEnabled || !organizationId || !memberToRemove) {
      return
    }

    setTeamActionSubmitting(true)
    try {
      const response = await fetch("/api/organizations/members", {
        method: "DELETE",
        headers: headersFor(organizationId, selectedId),
        body: JSON.stringify({
          user_id: memberToRemove.user_id,
          workspace_id: selectedId,
          scope: "workspace",
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        setMessage(data.error || "Unable to remove member.")
        return
      }

      setMembers((current) =>
        current
          .map((item) =>
            item.user_id === memberToRemove.user_id
              ? {
                  ...item,
                  workspace_ids: item.workspace_ids.filter(
                    (workspaceId) => workspaceId !== selectedId
                  ),
                }
              : item
          )
          .filter(
            (item) =>
              item.user_id !== memberToRemove.user_id ||
              !data.organization_removed
          )
      )
      setMessage(
        data.organization_removed
          ? `${memberRemovalName} removed from the organization.`
          : `${memberRemovalName} removed from this workspace.`
      )
      setMemberRemovalDialogOpen(false)
      setMemberToRemove(null)
    } catch {
      setMessage("Unable to remove member.")
    } finally {
      setTeamActionSubmitting(false)
    }
  }

  function openCancelInvitationDialog(invitation: WorkspaceInvitation) {
    if (!managerEnabled) {
      return
    }

    setInvitationToCancel(invitation)
    setInvitationCancelDialogOpen(true)
  }

  async function cancelInvitation() {
    if (!managerEnabled || !organizationId || !invitationToCancel) {
      return
    }

    setTeamActionSubmitting(true)
    try {
      const response = await fetch("/api/organizations/invitations", {
        method: "PATCH",
        headers: headersFor(organizationId, selectedId),
        body: JSON.stringify({ id: invitationToCancel.id, status: "revoked" }),
      })

      if (!response.ok) {
        const data = await response.json()
        setMessage(data.error || "Unable to cancel invitation.")
        return
      }

      setInvitations((current) =>
        current.map((item) =>
          item.id === invitationToCancel.id
            ? { ...item, status: "revoked" }
            : item
        )
      )
      setInvitationCancelDialogOpen(false)
      setInvitationToCancel(null)
    } catch {
      setMessage("Unable to cancel invitation.")
    } finally {
      setTeamActionSubmitting(false)
    }
  }

  async function transferOwnership() {
    if (
      !ownerEnabled ||
      !organizationId ||
      !selectedId ||
      !transferOwnerUserId ||
      !transferPassword
    ) {
      return
    }

    setTransferringOwnership(true)
    setMessage("")
    try {
      const response = await fetch("/api/workspaces/ownership", {
        method: "POST",
        headers: headersFor(organizationId, selectedId),
        body: JSON.stringify({
          new_owner_user_id: transferOwnerUserId,
          password: transferPassword,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        setMessage(data.error || "Unable to transfer ownership.")
        return
      }

      setMembers((current) =>
        current.map((member) => {
          if (member.user_id === data.owner_user_id) {
            return { ...member, role: "owner" }
          }
          if (member.user_id === data.previous_owner_user_id) {
            return { ...member, role: "admin" }
          }
          return member
        })
      )
      setWorkspaces((current) =>
        current.map((workspace) =>
          workspace.id === data.workspace_id
            ? { ...workspace, role: "admin" }
            : workspace
        )
      )
      invalidateWorkspaceClientData(organizationId)
      setTransferDialogOpen(false)
      setTransferOwnerUserId("")
      setTransferPassword("")
      setMessage("Workspace ownership transferred.")
    } catch {
      setMessage("Unable to transfer ownership.")
    } finally {
      setTransferringOwnership(false)
    }
  }

  const activeRows = [...selectedMembers, ...selectedInvitations]
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
                  {managerEnabled
                    ? "Edit the current workspace, manage team access, or create another workspace."
                    : "View workspace settings and team access."}
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
                        disabled={!managerEnabled || savingWorkspaceName}
                        onChange={(event) => setEditName(event.target.value)}
                        placeholder="Workspace name"
                      />
                      {managerEnabled && (
                        <Button
                          type="button"
                          disabled={savingWorkspaceName}
                          onClick={saveWorkspaceName}
                        >
                          {savingWorkspaceName && (
                            <Loader2 className="size-4 animate-spin" />
                          )}
                          Save
                        </Button>
                      )}
                    </div>
                  </div>
                </section>

                {ownerEnabled && (
                  <section className="grid gap-3 rounded-lg border p-3">
                    <div className="grid gap-3 sm:flex sm:items-center sm:justify-between">
                      <div className="grid gap-1">
                        <div className="flex items-center gap-2">
                          <Crown className="size-4" />
                          <h2 className="font-medium">Workspace owner</h2>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {selectedOwner?.email ||
                            selectedOwner?.name ||
                            "Current owner"}
                        </p>
                      </div>
                      <Dialog
                        open={transferDialogOpen}
                        onOpenChange={(open) => {
                          setTransferDialogOpen(open)
                          if (!open) {
                            setTransferOwnerUserId("")
                            setTransferPassword("")
                          }
                        }}
                      >
                        <DialogTrigger
                          render={
                            <Button
                              type="button"
                              variant="outline"
                              disabled={!ownershipTransferCandidates.length}
                              onClick={() =>
                                setTransferOwnerUserId(
                                  ownershipTransferCandidates[0]?.user_id || ""
                                )
                              }
                            />
                          }
                        >
                          <KeyRound className="size-4" />
                          Transfer ownership
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-md">
                          <DialogHeader>
                            <DialogTitle>Transfer ownership</DialogTitle>
                            <DialogDescription>
                              Choose an existing workspace admin and confirm
                              your password. You will become an admin.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="grid gap-4">
                            <div className="grid gap-2">
                              <Label>New owner</Label>
                              <Select
                                value={transferOwnerUserId}
                                disabled={transferringOwnership}
                                onValueChange={(value) =>
                                  setTransferOwnerUserId(value || "")
                                }
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="Select admin" />
                                </SelectTrigger>
                                <SelectContent>
                                  {ownershipTransferCandidates.map((member) => (
                                    <SelectItem
                                      key={member.user_id}
                                      value={member.user_id}
                                    >
                                      {member.email ||
                                        member.name ||
                                        member.user_id}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="grid gap-2">
                              <Label htmlFor="transfer-owner-password">
                                Confirm password
                              </Label>
                              <Input
                                id="transfer-owner-password"
                                type="password"
                                value={transferPassword}
                                disabled={transferringOwnership}
                                onChange={(event) =>
                                  setTransferPassword(event.target.value)
                                }
                              />
                            </div>
                          </div>
                          <div className="grid gap-2 sm:flex sm:justify-end">
                            <Button
                              type="button"
                              variant="outline"
                              disabled={transferringOwnership}
                              onClick={() => setTransferDialogOpen(false)}
                            >
                              Cancel
                            </Button>
                            <Button
                              type="button"
                              disabled={
                                !transferOwnerUserId ||
                                !transferPassword ||
                                transferringOwnership
                              }
                              onClick={transferOwnership}
                            >
                              {transferringOwnership && (
                                <Loader2 className="size-4 animate-spin" />
                              )}
                              Transfer
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                    {!ownershipTransferCandidates.length && (
                      <p className="text-sm text-muted-foreground">
                        Add an admin before transferring ownership.
                      </p>
                    )}
                  </section>
                )}

                <section className="grid gap-3 rounded-lg border p-3">
                  {managerEnabled && (
                    <div className="grid gap-2 sm:grid-cols-[1fr_9rem_auto] sm:items-end">
                      <div className="grid gap-2">
                        <Label htmlFor="member-email">Email</Label>
                        <Input
                          id="member-email"
                          type="email"
                          value={inviteEmail}
                          disabled={invitingMember}
                          aria-describedby={
                            inviteStatusMessage
                              ? "member-email-feedback"
                              : undefined
                          }
                          onChange={(event) => {
                            setInviteEmail(event.target.value)
                            setInviteStatusMessage("")
                            setInviteStatusIsError(false)
                          }}
                          placeholder="member@example.com"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Role</Label>
                        <Select
                          value={inviteRole}
                          disabled={invitingMember}
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
                        disabled={invitingMember}
                        onClick={inviteMember}
                      >
                        {invitingMember ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <UserPlus className="size-4" />
                        )}
                        Invite
                      </Button>
                    </div>
                  )}
                  {inviteStatusMessage && (
                    <p
                      id="member-email-feedback"
                      className={
                        inviteStatusIsError
                          ? "text-sm text-destructive"
                          : "text-sm text-muted-foreground"
                      }
                    >
                      {inviteStatusMessage}
                    </p>
                  )}

                  {lastInviteLink ? (
                    <div className="grid gap-2">
                      <Label htmlFor="latest-invite-link">Invite link</Label>
                      <div className="grid gap-2 sm:flex">
                        <Input
                          id="latest-invite-link"
                          value={lastInviteLink}
                          readOnly
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={copyInviteLink}
                        >
                          <Copy className="size-4" />
                          Copy
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  <Table className="min-w-0 md:min-w-[38rem]">
                    <TableHeader className="hidden md:table-header-group">
                      <TableRow>
                        <TableHead>Email</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead className="w-28 text-right" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {teamLoading ? (
                        Array.from({ length: 3 }).map((_, index) => (
                          <TableRow
                            key={index}
                            className="grid gap-3 p-4 md:table-row md:p-0"
                          >
                            <TableCell className="flex items-center justify-between gap-4 p-0 md:table-cell md:p-2">
                              <span className="text-sm text-muted-foreground md:hidden">
                                Email
                              </span>
                              <Skeleton className="h-4 w-44" />
                            </TableCell>
                            <TableCell className="flex items-center justify-between gap-4 p-0 md:table-cell md:p-2">
                              <span className="text-sm text-muted-foreground md:hidden">
                                Status
                              </span>
                              <Skeleton className="h-5 w-20 rounded-full" />
                            </TableCell>
                            <TableCell className="flex items-center justify-between gap-4 p-0 md:table-cell md:p-2">
                              <span className="text-sm text-muted-foreground md:hidden">
                                Role
                              </span>
                              <Skeleton className="h-8 w-28" />
                            </TableCell>
                            <TableCell className="flex justify-end p-0 md:table-cell md:p-2">
                              <Skeleton className="h-8 w-8" />
                            </TableCell>
                          </TableRow>
                        ))
                      ) : activeRows.length ? (
                        activeRows.map((row) => {
                          const isInvitation =
                            "email" in row && !("user_id" in row)
                          const key = isInvitation
                            ? `invite:${row.id}`
                            : `member:${row.user_id}`
                          const email = row.email || "No email"
                          const status = row.status
                          const role = row.role

                          return (
                            <TableRow
                              key={key}
                              className="grid gap-3 p-4 md:table-row md:p-0"
                            >
                              <TableCell className="flex min-w-0 items-center justify-between gap-4 whitespace-normal p-0 md:table-cell md:p-2">
                                <span className="text-sm text-muted-foreground md:hidden">
                                  Email
                                </span>
                                <span className="min-w-0 break-all text-right font-medium md:text-left md:font-normal">
                                  {email}
                                </span>
                              </TableCell>
                              <TableCell className="flex items-center justify-between gap-4 p-0 md:table-cell md:p-2">
                                <span className="text-sm text-muted-foreground md:hidden">
                                  Status
                                </span>
                                <Badge variant="secondary">{status}</Badge>
                              </TableCell>
                              <TableCell className="flex items-center justify-between gap-4 p-0 md:table-cell md:p-2">
                                <span className="text-sm text-muted-foreground md:hidden">
                                  Role
                                </span>
                                {isInvitation || !managerEnabled ? (
                                  <Badge variant="secondary">{role}</Badge>
                                ) : row.role === "owner" ? (
                                  <Badge variant="secondary">owner</Badge>
                                ) : (
                                  <Select
                                    value={role}
                                    disabled={
                                      !managerEnabled ||
                                      Boolean(updatingMemberUserId)
                                    }
                                    onValueChange={(value) =>
                                      updateMemberRole(
                                        row,
                                        value === "admin" ? "admin" : "member"
                                      )
                                    }
                                  >
                                    <SelectTrigger className="w-28">
                                      <SelectValue>
                                        {updatingMemberUserId === row.user_id ? (
                                          <span className="inline-flex items-center gap-2">
                                            <Loader2 className="size-4 animate-spin" />
                                            {role}
                                          </span>
                                        ) : (
                                          role
                                        )}
                                      </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="member">member</SelectItem>
                                      <SelectItem value="admin">admin</SelectItem>
                                    </SelectContent>
                                  </Select>
                                )}
                              </TableCell>
                              <TableCell className="p-0 text-right md:table-cell md:p-2">
                                {managerEnabled && (
                                  <div className="inline-flex items-center justify-end gap-1">
                                    {isInvitation ? (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        disabled={
                                          Boolean(resendingInvitationId) ||
                                          teamActionSubmitting
                                        }
                                        aria-label="Resend invite"
                                        title="Resend invite"
                                        onClick={() => resendInvitation(row)}
                                      >
                                        {resendingInvitationId === row.id ? (
                                          <Loader2 className="size-4 animate-spin" />
                                        ) : (
                                          <Send className="size-4" />
                                        )}
                                      </Button>
                                    ) : null}
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      disabled={
                                        teamActionSubmitting ||
                                        (isInvitation &&
                                          resendingInvitationId === row.id) ||
                                        (!isInvitation && row.role === "owner")
                                      }
                                      aria-label={
                                        isInvitation
                                          ? "Cancel invite"
                                          : "Remove member"
                                      }
                                      title={
                                        isInvitation
                                          ? "Cancel invite"
                                          : "Remove member"
                                      }
                                      onClick={() =>
                                        isInvitation
                                          ? openCancelInvitationDialog(row)
                                          : openRemoveMemberDialog(row)
                                      }
                                    >
                                      <UserMinus className="size-4" />
                                    </Button>
                                  </div>
                                )}
                              </TableCell>
                            </TableRow>
                          )
                        })
                      ) : (
                        <TableRow>
                          <TableCell
                            colSpan={4}
                            className="h-24 text-center text-muted-foreground"
                          >
                            No team access for this workspace.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>

                  <Dialog
                    open={memberRemovalDialogOpen}
                    onOpenChange={(open) => {
                      setMemberRemovalDialogOpen(open)
                      if (!open) {
                        setMemberToRemove(null)
                      }
                    }}
                  >
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Remove member</DialogTitle>
                        <DialogDescription>
                          {memberRemovalBlockedReason ||
                            `Remove ${memberRemovalName} from ${
                              selectedWorkspace?.name || "this workspace"
                            }? They will lose access to this workspace.`}
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-2 sm:flex sm:justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          disabled={teamActionSubmitting}
                          onClick={() => setMemberRemovalDialogOpen(false)}
                        >
                          Keep member
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          disabled={
                            teamActionSubmitting || Boolean(memberRemovalBlockedReason)
                          }
                          onClick={removeMember}
                        >
                          {teamActionSubmitting && (
                            <Loader2 className="size-4 animate-spin" />
                          )}
                          Remove member
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>

                  <Dialog
                    open={invitationCancelDialogOpen}
                    onOpenChange={(open) => {
                      setInvitationCancelDialogOpen(open)
                      if (!open) {
                        setInvitationToCancel(null)
                      }
                    }}
                  >
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Cancel invite</DialogTitle>
                        <DialogDescription>
                          Cancel the pending invitation for {invitationCancelName}?
                          The invite link will no longer work.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-2 sm:flex sm:justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          disabled={teamActionSubmitting}
                          onClick={() => setInvitationCancelDialogOpen(false)}
                        >
                          Keep invite
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          disabled={teamActionSubmitting}
                          onClick={cancelInvitation}
                        >
                          {teamActionSubmitting && (
                            <Loader2 className="size-4 animate-spin" />
                          )}
                          Cancel invite
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </section>

                {managerEnabled && (
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
                )}

                <section className="grid gap-4 rounded-lg border border-destructive/40 p-4">
                  <div className="grid gap-1">
                    <h2 className="text-lg font-semibold">Danger Zone</h2>
                    <p className="text-sm text-muted-foreground">
                      Delete the selected workspace after integrations and
                      billing are cleared. Historical data is retained.
                    </p>
                  </div>

                  {selectedWorkspace ? (
                    <div className="grid gap-3 sm:flex sm:items-center sm:justify-between">
                      <div className="grid gap-1">
                        <p className="font-medium">{selectedWorkspace.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {selectedWorkspace.has_active_billing
                            ? "Cancel active billing before deleting this workspace."
                            : selectedWorkspace.has_connected_account
                              ? "Disconnect or move connected Klaviyo accounts before deleting this workspace."
                              : workspaces.length <= 1
                                ? "Deleting your last workspace will require creating a new one before continuing."
                                : "Deleting hides this workspace from the switcher and keeps historical data intact."}
                        </p>
                      </div>
                      <div className="grid gap-2 sm:flex sm:justify-end">
                        {managerEnabled && selectedWorkspace.has_active_billing && (
                          <a
                            href="/api/billing/portal"
                            className={buttonVariants({
                              variant: "outline",
                              className: "w-full sm:w-fit",
                            })}
                          >
                            Manage Billing
                          </a>
                        )}
                        <Button
                          type="button"
                          variant="destructive"
                          className="w-full sm:w-fit"
                          disabled={archivingWorkspace}
                          onClick={openArchiveWorkspaceDialog}
                        >
                          <Trash2 className="size-4" />
                          Delete workspace
                        </Button>
                        <Dialog
                          open={archiveBlockedDialogOpen}
                          onOpenChange={setArchiveBlockedDialogOpen}
                        >
                          <DialogContent className="sm:max-w-md">
                            <DialogHeader>
                              <DialogTitle>Workspace cannot be deleted</DialogTitle>
                              <DialogDescription>
                                {workspaceArchiveBlockedReason ||
                                  "This workspace cannot be deleted right now."}
                              </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-2 sm:flex sm:justify-end">
                              {managerEnabled &&
                                selectedWorkspace.has_active_billing && (
                                <a
                                  href="/api/billing/portal"
                                  className={buttonVariants({
                                    variant: "outline",
                                    className: "w-full sm:w-fit",
                                  })}
                                >
                                  Manage Billing
                                </a>
                              )}
                              <Button
                                type="button"
                                onClick={() => setArchiveBlockedDialogOpen(false)}
                              >
                                Close
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                        <Dialog
                          open={archiveDialogOpen}
                          onOpenChange={(open) => {
                            setArchiveDialogOpen(open)
                            if (!open) {
                              setArchiveConfirmation("")
                            }
                          }}
                        >
                          <DialogContent className="sm:max-w-md">
                            <DialogHeader>
                              <DialogTitle>Delete workspace</DialogTitle>
                              <DialogDescription>
                                Type {selectedWorkspace.name} to confirm deleting
                                this workspace.
                              </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-2">
                              <Label htmlFor="delete-workspace-confirmation">
                                Workspace name
                              </Label>
                              <Input
                                id="delete-workspace-confirmation"
                                value={archiveConfirmation}
                                onChange={(event) =>
                                  setArchiveConfirmation(event.target.value)
                                }
                                placeholder={selectedWorkspace.name}
                              />
                            </div>
                            <div className="grid gap-2 sm:flex sm:justify-end">
                              <Button
                                type="button"
                                variant="outline"
                                disabled={archivingWorkspace}
                                onClick={() => setArchiveDialogOpen(false)}
                              >
                                Cancel
                              </Button>
                              <Button
                                type="button"
                                variant="destructive"
                                disabled={
                                  !archiveConfirmationMatches ||
                                  archivingWorkspace
                                }
                                onClick={archiveWorkspace}
                              >
                                {archivingWorkspace && (
                                  <Loader2 className="size-4 animate-spin" />
                                )}
                                Delete workspace
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Create a workspace before using destructive actions.
                    </p>
                  )}
                </section>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {message && <p className="text-xs text-muted-foreground">{message}</p>}
    </div>
  )
}
