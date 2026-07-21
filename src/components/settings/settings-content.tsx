"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  Archive,
  Info,
  Loader2,
  Mail,
  MoreHorizontal,
  ShoppingBag,
  Trash2,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLinkItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { startKlaviyoOAuth } from "@/lib/klaviyo-oauth"
import {
  ClientApiError,
  invalidateWorkspaceClientData,
  loadOrganizations,
  loadWorkspaces,
  type WorkspaceOption,
} from "@/lib/workspace-client-data"
import {
  readWorkspaceSelection,
  serializeClientCookie,
  writeWorkspaceSelection,
  WORKSPACE_ID_COOKIE,
  WORKSPACE_ORGANIZATION_COOKIE,
} from "@/lib/workspace-utils"

type SettingsContentProps = {
  connected?: boolean
}

type KlaviyoConnection = {
  id: string
  platform?: string
  connection_name?: string | null
  connection_date?: string
  status?: string
}

const providers = [
  {
    name: "Klaviyo",
    status: "Connect",
    available: true,
    icon: Mail,
  },
  {
    name: "Shopify",
    status: "Coming Soon",
    available: false,
    icon: ShoppingBag,
  },
  {
    name: "Hubspot",
    status: "Coming Soon",
    available: false,
    icon: Info,
  },
  {
    name: "Mailchimp",
    status: "Coming Soon",
    available: false,
    icon: Mail,
  },
]

function connectionDisplayName(connection: KlaviyoConnection) {
  return connection.connection_name?.trim() || "Klaviyo"
}

function workspaceLabel(name: string) {
  return /\bworkspace\b/i.test(name) ? name : `${name} Workspace`
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

function ConnectionsTableSkeleton() {
  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[38rem]">
        <TableHeader>
          <TableRow>
            <TableHead>Platform</TableHead>
            <TableHead>Connection Name</TableHead>
            <TableHead>Connected</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 2 }).map((_, index) => (
            <TableRow key={index}>
              <TableCell>
                <Skeleton className="h-4 w-20" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-32" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-24" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-20 rounded-full" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-8 w-8" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export function SettingsContent({ connected = false }: SettingsContentProps) {
  const [connections, setConnections] = useState<KlaviyoConnection[]>([])
  const [loadingConnections, setLoadingConnections] = useState(true)
  const [statusMessage, setStatusMessage] = useState("")
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([])
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [currentWorkspace, setCurrentWorkspace] =
    useState<WorkspaceOption | null>(null)
  const [workspaceLoading, setWorkspaceLoading] = useState(true)
  const [workspaceStatusMessage, setWorkspaceStatusMessage] = useState("")
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false)
  const [archiveConfirmation, setArchiveConfirmation] = useState("")
  const [archiving, setArchiving] = useState(false)
  const [connectionToDelete, setConnectionToDelete] =
    useState<KlaviyoConnection | null>(null)
  const [deleteConnectionDialogOpen, setDeleteConnectionDialogOpen] =
    useState(false)
  const [deleteConnectionConfirmation, setDeleteConnectionConfirmation] =
    useState("")
  const [deletingConnection, setDeletingConnection] = useState(false)
  const hasConnections = connections.length > 0
  const workspaceArchiveBlocked =
    Boolean(currentWorkspace?.has_connected_account) ||
    Boolean(currentWorkspace?.has_active_billing)
  const archiveConfirmationMatches =
    Boolean(currentWorkspace?.name) &&
    archiveConfirmation.trim() === currentWorkspace?.name
  const deleteConnectionName = connectionToDelete
    ? connectionDisplayName(connectionToDelete)
    : ""
  const deleteConnectionConfirmationMatches =
    Boolean(deleteConnectionName) &&
    deleteConnectionConfirmation.trim() === deleteConnectionName

  useEffect(() => {
    let cancelled = false

    async function loadWorkspaceContext() {
      setWorkspaceLoading(true)
      setWorkspaceStatusMessage("")

      try {
        const organizations = await loadOrganizations()
        const selection =
          typeof window === "undefined"
            ? { organizationId: null, workspaceId: null }
            : readWorkspaceSelection(window.localStorage)
        const organization =
          organizations.find((item) => item.id === selection.organizationId) ||
          organizations[0]

        if (!organization) {
          if (!cancelled) {
            setOrganizationId(null)
            setCurrentWorkspace(null)
            setWorkspaces([])
          }
          return
        }

        const loadedWorkspaces = await loadWorkspaces(organization.id)
        const selectedWorkspace =
          loadedWorkspaces.find((workspace) => workspace.id === selection.workspaceId) ||
          loadedWorkspaces.find((workspace) => workspace.is_default) ||
          loadedWorkspaces[0] ||
          null

        if (!cancelled) {
          setOrganizationId(organization.id)
          setWorkspaces(loadedWorkspaces)
          setCurrentWorkspace(selectedWorkspace)
        }
      } catch (error) {
        if (!cancelled) {
          setWorkspaceStatusMessage(
            handleLoadError(error, "Unable to load workspace settings.")
          )
        }
      } finally {
        if (!cancelled) {
          setWorkspaceLoading(false)
        }
      }
    }

    loadWorkspaceContext()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadConnections() {
      setLoadingConnections(true)

      try {
        const response = await fetch("/api/oauth/klaviyo/accounts")
        if (!response.ok) {
          if (!cancelled && connected) {
            setStatusMessage("Unable to load Klaviyo connections.")
          }
          return
        }

        const data = (await response.json()) as KlaviyoConnection[]
        if (!cancelled) {
          setConnections(data)
          setCurrentWorkspace((workspace) =>
            workspace
              ? { ...workspace, has_connected_account: data.length > 0 }
              : workspace
          )
        }
      } catch {
        if (!cancelled && connected) {
          setStatusMessage("Unable to load Klaviyo connections.")
        }
      } finally {
        if (!cancelled) {
          setLoadingConnections(false)
        }
      }
    }

    loadConnections()
    return () => {
      cancelled = true
    }
  }, [connected])

  async function addKlaviyoConnection() {
    await startKlaviyoOAuth({
      onMissingClientId: () =>
        setStatusMessage("Klaviyo client ID is not configured."),
    })
  }

  function openDeleteConnectionDialog(connection: KlaviyoConnection) {
    setConnectionToDelete(connection)
    setDeleteConnectionConfirmation("")
    setDeleteConnectionDialogOpen(true)
  }

  async function deleteConnection() {
    if (!connectionToDelete || !deleteConnectionConfirmationMatches) {
      return
    }

    setDeletingConnection(true)
    try {
      const response = await fetch("/api/oauth/klaviyo/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: connectionToDelete.id }),
      })
      const data = await response.json()
      if (!response.ok) {
        setStatusMessage(data.error || "Unable to delete Klaviyo connection.")
        return
      }

      const remainingConnections = connections.filter(
        (connection) => connection.id !== connectionToDelete.id
      )
      setConnections(remainingConnections)
      setCurrentWorkspace((workspace) =>
        workspace
          ? {
              ...workspace,
              has_connected_account: remainingConnections.length > 0,
            }
          : workspace
      )
      setStatusMessage(`${connectionDisplayName(connectionToDelete)} deleted.`)
      setDeleteConnectionDialogOpen(false)
      setConnectionToDelete(null)
      setDeleteConnectionConfirmation("")
      if (organizationId) {
        invalidateWorkspaceClientData(organizationId)
      }
    } finally {
      setDeletingConnection(false)
    }
  }

  async function archiveWorkspace() {
    if (
      !organizationId ||
      !currentWorkspace ||
      !archiveConfirmationMatches ||
      workspaceArchiveBlocked
    ) {
      return
    }

    setArchiving(true)
    try {
      const response = await fetch("/api/workspaces", {
        method: "DELETE",
        headers: headersFor(organizationId, currentWorkspace.id),
        body: JSON.stringify({ id: currentWorkspace.id }),
      })
      const data = await response.json()
      if (!response.ok) {
        setWorkspaceStatusMessage(data.error || "Unable to archive workspace.")
        return
      }

      const nextWorkspace =
        workspaces.find((workspace) => workspace.id !== currentWorkspace.id) ||
        null
      persistSelection(organizationId, nextWorkspace?.id || null)
      invalidateWorkspaceClientData(organizationId)
      setWorkspaceStatusMessage(
        `${workspaceLabel(currentWorkspace.name)} archived.`
      )
      setArchiveDialogOpen(false)
      setArchiveConfirmation("")
      window.setTimeout(() => {
        window.location.reload()
      }, 450)
    } finally {
      setArchiving(false)
    }
  }

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.data?.status === "connected") {
        setStatusMessage("Klaviyo connection added.")
        setLoadingConnections(true)
        fetch("/api/oauth/klaviyo/accounts")
          .then((response) => {
            if (!response.ok) {
              throw new Error("Unable to load Klaviyo connections.")
            }

            return response.json()
          })
          .then((data) => {
            setConnections(data)
            setCurrentWorkspace((workspace) =>
              workspace
                ? { ...workspace, has_connected_account: data.length > 0 }
                : workspace
            )
          })
          .catch(() => setStatusMessage("Unable to load Klaviyo connections."))
          .finally(() => setLoadingConnections(false))
      }
      if (event.data?.status === "blocked") {
        setStatusMessage("That Klaviyo account is already connected.")
      }
    }

    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [])

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold tracking-normal sm:text-3xl">
        Integrations
      </h1>

      {statusMessage && (
        <p className="text-sm text-muted-foreground">{statusMessage}</p>
      )}

      {loadingConnections ? (
        <ConnectionsTableSkeleton />
      ) : hasConnections ? (
        <div className="overflow-x-auto">
          <Table className="min-w-[38rem]">
            <TableHeader>
              <TableRow>
                <TableHead>Platform</TableHead>
                <TableHead>Connection Name</TableHead>
                <TableHead>Connected</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12 text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {connections.map((connection) => (
                <TableRow key={connection.id}>
                  <TableCell>{connection.platform || "Klaviyo"}</TableCell>
                  <TableCell>{connectionDisplayName(connection)}</TableCell>
                  <TableCell>{connection.connection_date || "-"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {connection.status || "Connected"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Actions for ${connectionDisplayName(
                              connection
                            )}`}
                          />
                        }
                      >
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLinkItem
                          render={
                            <Link
                              href={`/settings/klaviyo?id=${connection.id}`}
                            />
                          }
                        >
                          Edit
                        </DropdownMenuLinkItem>
                        <DropdownMenuItem
                          className="text-destructive data-highlighted:bg-destructive/10 data-highlighted:text-destructive"
                          onClick={() => openDeleteConnectionDialog(connection)}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="text-lg text-muted-foreground">No connections</p>
      )}

      <div className="grid w-full gap-4 sm:w-fit">
        <Dialog>
          <DialogTrigger render={<Button className="w-full sm:w-fit" />}>
            Add Connection
          </DialogTrigger>
          <DialogContent className="sm:max-w-4xl" showCloseButton={false}>
            <DialogHeader>
              <DialogTitle>Add Connections</DialogTitle>
            </DialogHeader>

            <div className="grid gap-3">
              {providers.map((provider) => {
                const Icon = provider.icon

                return (
                  <div
                    key={provider.name}
                    className="grid gap-3 rounded-lg border p-3 sm:flex sm:items-center sm:justify-between"
                  >
                    <div className="flex items-center gap-3 text-base font-medium">
                      <Icon className="size-5" />
                      {provider.name}
                    </div>
                    {provider.available ? (
                      <DialogClose
                        render={
                          <Button
                            type="button"
                            className="w-full sm:w-36"
                            onClick={addKlaviyoConnection}
                          />
                        }
                      >
                        {provider.status}
                      </DialogClose>
                    ) : (
                      <Badge variant="secondary">{provider.status}</Badge>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="flex items-start gap-2 text-sm text-muted-foreground">
              <Info className="mt-0.5 size-4" />
              <p>
                <span className="font-medium">Need a Specific ESP?</span>
                <br />
                Please contact{" "}
                <a
                  href="mailto:support@listhygiene.com"
                  className="font-medium underline underline-offset-4"
                >
                  support@listhygiene.com
                </a>{" "}
                for assistance.
              </p>
            </div>

            <DialogFooter>
              <DialogClose render={<Button />}>Close</DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <section className="grid gap-4 rounded-lg border border-destructive/40 p-4">
        <div className="grid gap-1">
          <h2 className="text-lg font-semibold">Danger Zone</h2>
          <p className="text-sm text-muted-foreground">
            Archive the selected workspace after integrations and billing are
            cleared.
          </p>
        </div>

        {workspaceStatusMessage && (
          <p className="text-sm text-muted-foreground">
            {workspaceStatusMessage}
          </p>
        )}

        {workspaceLoading ? (
          <div className="grid gap-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-8 w-full max-w-md" />
          </div>
        ) : currentWorkspace ? (
          <div className="grid gap-3 sm:flex sm:items-center sm:justify-between">
            <div className="grid gap-1">
              <p className="font-medium">{currentWorkspace.name}</p>
              <p className="text-sm text-muted-foreground">
                {currentWorkspace.has_active_billing
                  ? "Cancel active billing before archiving this workspace."
                  : currentWorkspace.has_connected_account
                    ? "Disconnect or move connected Klaviyo accounts before archiving this workspace."
                    : "Archiving hides this workspace and leaves historical data intact."}
              </p>
            </div>
            <div className="grid gap-2 sm:flex sm:justify-end">
              {currentWorkspace.has_active_billing && (
                <Link
                  href="/api/billing/portal"
                  className={buttonVariants({
                    variant: "outline",
                    className: "w-full sm:w-fit",
                  })}
                >
                  Manage Billing
                </Link>
              )}
              <Dialog
                open={archiveDialogOpen}
                onOpenChange={(open) => {
                  setArchiveDialogOpen(open)
                  if (!open) {
                    setArchiveConfirmation("")
                  }
                }}
              >
                <DialogTrigger
                  render={
                    <Button
                      type="button"
                      variant="destructive"
                      className="w-full sm:w-fit"
                      disabled={workspaceArchiveBlocked || archiving}
                    />
                  }
                >
                  <Archive className="size-4" />
                  Archive workspace
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Archive workspace</DialogTitle>
                    <DialogDescription>
                      Type {currentWorkspace.name} to confirm archiving this
                      workspace.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-2">
                    <Label htmlFor="archive-workspace-confirmation">
                      Workspace name
                    </Label>
                    <Input
                      id="archive-workspace-confirmation"
                      value={archiveConfirmation}
                      onChange={(event) =>
                        setArchiveConfirmation(event.target.value)
                      }
                      placeholder={currentWorkspace.name}
                    />
                  </div>
                  <div className="grid gap-2 sm:flex sm:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={archiving}
                      onClick={() => setArchiveDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={!archiveConfirmationMatches || archiving}
                      onClick={archiveWorkspace}
                    >
                      {archiving && <Loader2 className="size-4 animate-spin" />}
                      Archive workspace
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No workspace is selected.
          </p>
        )}
      </section>

      <Dialog
        open={deleteConnectionDialogOpen}
        onOpenChange={(open) => {
          setDeleteConnectionDialogOpen(open)
          if (!open) {
            setDeleteConnectionConfirmation("")
            setConnectionToDelete(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete connection</DialogTitle>
            <DialogDescription>
              Type {deleteConnectionName || "the connection name"} to confirm
              deleting this Klaviyo connection.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="delete-connection-confirmation">
              Connection name
            </Label>
            <Input
              id="delete-connection-confirmation"
              value={deleteConnectionConfirmation}
              onChange={(event) =>
                setDeleteConnectionConfirmation(event.target.value)
              }
              placeholder={deleteConnectionName}
            />
          </div>
          <div className="grid gap-2 sm:flex sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={deletingConnection}
              onClick={() => setDeleteConnectionDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={
                !deleteConnectionConfirmationMatches || deletingConnection
              }
              onClick={deleteConnection}
            >
              {deletingConnection && (
                <Loader2 className="size-4 animate-spin" />
              )}
              <Trash2 className="size-4" />
              Delete connection
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
