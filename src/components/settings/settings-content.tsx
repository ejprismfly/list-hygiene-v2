"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import {
  Info,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Mail,
  MoreHorizontal,
  ShoppingBag,
  Trash2,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
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
import {
  openKlaviyoOAuthPopup,
  startKlaviyoOAuth,
} from "@/lib/klaviyo-oauth"
import { trackIntegrationEvent, TRACKING_EVENTS } from "@/lib/tracking-events"
import { useWorkspacePermissions } from "@/lib/use-workspace-permissions"
import { invalidateWorkspaceClientData } from "@/lib/workspace-client-data"

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

function ConnectionsTableSkeleton() {
  return (
    <Table className="min-w-0 md:min-w-[38rem]">
      <TableHeader className="hidden md:table-header-group">
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
          <TableRow
            key={index}
            className="grid gap-3 p-4 md:table-row md:p-0"
          >
            <TableCell className="flex items-center justify-between gap-4 p-0 md:table-cell md:p-2">
              <span className="text-sm text-muted-foreground md:hidden">
                Platform
              </span>
              <Skeleton className="h-4 w-20" />
            </TableCell>
            <TableCell className="flex items-center justify-between gap-4 p-0 md:table-cell md:p-2">
              <span className="text-sm text-muted-foreground md:hidden">
                Connection
              </span>
              <Skeleton className="h-4 w-32" />
            </TableCell>
            <TableCell className="flex items-center justify-between gap-4 p-0 md:table-cell md:p-2">
              <span className="text-sm text-muted-foreground md:hidden">
                Connected
              </span>
              <Skeleton className="h-4 w-24" />
            </TableCell>
            <TableCell className="flex items-center justify-between gap-4 p-0 md:table-cell md:p-2">
              <span className="text-sm text-muted-foreground md:hidden">
                Status
              </span>
              <Skeleton className="h-5 w-20 rounded-full" />
            </TableCell>
            <TableCell className="flex justify-end p-0 md:table-cell md:p-2">
              <Skeleton className="h-8 w-8" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function SettingsContent({ connected = false }: SettingsContentProps) {
  const [connections, setConnections] = useState<KlaviyoConnection[]>([])
  const [loadingConnections, setLoadingConnections] = useState(true)
  const [statusMessage, setStatusMessage] = useState("")
  const [statusTone, setStatusTone] = useState<"error" | "info" | "success">("info")
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [connectionToDelete, setConnectionToDelete] =
    useState<KlaviyoConnection | null>(null)
  const [deleteConnectionDialogOpen, setDeleteConnectionDialogOpen] =
    useState(false)
  const [deleteConnectionConfirmation, setDeleteConnectionConfirmation] =
    useState("")
  const [connectingKlaviyo, setConnectingKlaviyo] = useState(false)
  const oauthPopupRef = useRef<Window | null>(null)
  const [deletingConnection, setDeletingConnection] = useState(false)
  const workspacePermissions = useWorkspacePermissions()
  const hasConnections = connections.length > 0
  const deleteConnectionName = connectionToDelete
    ? connectionDisplayName(connectionToDelete)
    : ""
  const deleteConnectionConfirmationMatches =
    Boolean(deleteConnectionName) &&
    deleteConnectionConfirmation.trim() === deleteConnectionName

  function showStatus(
    message: string,
    tone: "error" | "info" | "success" = "info"
  ) {
    setStatusMessage(message)
    setStatusTone(tone)
  }

  useEffect(() => {
    let cancelled = false

    async function loadConnections() {
      setLoadingConnections(true)

      try {
        const response = await fetch("/api/oauth/klaviyo/accounts")
        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as
            | { error?: string }
            | null
          if (!cancelled) {
            showStatus(
              data?.error || "Unable to load Klaviyo connections.",
              "error"
            )
          }
          return
        }

        const data = (await response.json()) as KlaviyoConnection[]
        if (!cancelled) {
          setConnections(data)
        }
      } catch {
        if (!cancelled) {
          showStatus("Unable to load Klaviyo connections.", "error")
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
    if (!workspacePermissions.canCreateIntegrations) {
      showStatus("Only owners and admins can add integrations.", "error")
      return
    }

    setConnectingKlaviyo(true)
    setStatusMessage("")
    const popup = openKlaviyoOAuthPopup()
    if (!popup) {
      showStatus(
        "Your browser blocked the Klaviyo authorization window. Allow popups and try again.",
        "error"
      )
      setConnectingKlaviyo(false)
      return
    }
    oauthPopupRef.current = popup
    try {
      const started = await startKlaviyoOAuth({
        popup,
        onMissingClientId: () =>
          showStatus("Klaviyo client ID is not configured.", "error"),
      })
      if (started) {
        trackIntegrationEvent(
          TRACKING_EVENTS.integration.klaviyoOauthStarted,
          null,
          { source: "settings" }
        )
        showStatus("Complete authorization in the Klaviyo window.")
        const openedPopup = popup
        const popupCheck = window.setInterval(() => {
          if (!openedPopup.closed) return
          window.clearInterval(popupCheck)
          if (oauthPopupRef.current === openedPopup) {
            oauthPopupRef.current = null
            setConnectingKlaviyo(false)
            showStatus("Klaviyo authorization was closed before it completed.", "error")
          }
        }, 500)
        return
      }
    } catch (error) {
      popup.close()
      oauthPopupRef.current = null
      showStatus(
        error instanceof Error ? error.message : "Unable to connect Klaviyo. Please try again.",
        "error"
      )
    } finally {
      if (!oauthPopupRef.current) setConnectingKlaviyo(false)
    }
  }

  function openDeleteConnectionDialog(connection: KlaviyoConnection) {
    if (!workspacePermissions.canDeleteIntegrations) {
      showStatus("Only owners and admins can delete integrations.", "error")
      return
    }

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
        showStatus(data.error || "Unable to delete Klaviyo connection.", "error")
        return
      }

      const remainingConnections = connections.filter(
        (connection) => connection.id !== connectionToDelete.id
      )
      setConnections(remainingConnections)
      showStatus(`${connectionDisplayName(connectionToDelete)} deleted.`, "success")
      trackIntegrationEvent(
        TRACKING_EVENTS.integration.klaviyoDisconnected,
        null,
        {
          connection_id: connectionToDelete.id,
          source: "settings",
        }
      )
      setDeleteConnectionDialogOpen(false)
      setConnectionToDelete(null)
      setDeleteConnectionConfirmation("")
      invalidateWorkspaceClientData()
    } catch (error) {
      showStatus(
        error instanceof Error
          ? error.message
          : "Unable to delete Klaviyo connection.",
        "error"
      )
    } finally {
      setDeletingConnection(false)
    }
  }

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return
      if (oauthPopupRef.current && event.source !== oauthPopupRef.current) return

      const finishOAuth = () => {
        oauthPopupRef.current = null
        setConnectingKlaviyo(false)
      }
      if (event.data?.status === "connected") {
        finishOAuth()
        trackIntegrationEvent(
          TRACKING_EVENTS.integration.klaviyoConnected,
          null,
          { source: "settings" }
        )
        showStatus("Klaviyo connection added.", "success")
        setAddDialogOpen(false)
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
          })
          .catch(() => showStatus("Unable to load Klaviyo connections.", "error"))
          .finally(() => setLoadingConnections(false))
      }
      if (event.data?.status === "blocked") {
        finishOAuth()
        trackIntegrationEvent(
          TRACKING_EVENTS.integration.klaviyoDuplicateBlocked,
          null,
          { source: "settings" }
        )
        showStatus("That Klaviyo account is already connected.", "error")
      }
      if (event.data?.status === "failed") {
        finishOAuth()
        trackIntegrationEvent(
          TRACKING_EVENTS.integration.klaviyoOauthFailed,
          null,
          { source: "settings" }
        )
        const failureMessages: Record<string, string> = {
          access_denied: "Klaviyo authorization was cancelled or denied.",
          configuration: "Klaviyo OAuth is not configured correctly.",
          database: "Klaviyo authorized successfully, but the connection could not be saved.",
          invalid_state: "The authorization session expired or could not be verified. Try again.",
          not_authenticated: "Your login session expired. Sign in again, then reconnect Klaviyo.",
          permissions: "Your workspace role cannot add integrations.",
          provider: "Klaviyo could not complete the connection. Try again in a moment.",
          workspace: "Select an available workspace before connecting Klaviyo.",
        }
        showStatus(
          failureMessages[String(event.data?.reason || "")] ||
            "Unable to connect Klaviyo. Please try again.",
          "error"
        )
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
        <Alert variant={statusTone === "error" ? "destructive" : "default"}>
          {statusTone === "error" ? (
            <AlertCircle className="size-4" />
          ) : statusTone === "success" ? (
            <CheckCircle2 className="size-4" />
          ) : (
            <Info className="size-4" />
          )}
          <AlertTitle>
            {statusTone === "error" ? "Connection problem" : statusTone === "success" ? "Success" : "Klaviyo"}
          </AlertTitle>
          <AlertDescription>{statusMessage}</AlertDescription>
        </Alert>
      )}

      {loadingConnections ? (
        <ConnectionsTableSkeleton />
      ) : hasConnections ? (
        <Table className="min-w-0 md:min-w-[38rem]">
          <TableHeader className="hidden md:table-header-group">
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
              <TableRow
                key={connection.id}
                className="grid gap-3 p-4 md:table-row md:p-0"
              >
                <TableCell className="flex items-center justify-between gap-4 p-0 md:table-cell md:p-2">
                  <span className="text-sm text-muted-foreground md:hidden">
                    Platform
                  </span>
                  <span>{connection.platform || "Klaviyo"}</span>
                </TableCell>
                <TableCell className="flex min-w-0 items-center justify-between gap-4 whitespace-normal p-0 md:table-cell md:p-2">
                  <span className="text-sm text-muted-foreground md:hidden">
                    Connection
                  </span>
                  <span className="min-w-0 truncate text-right font-medium md:text-left md:font-normal">
                    {connectionDisplayName(connection)}
                  </span>
                </TableCell>
                <TableCell className="flex items-center justify-between gap-4 p-0 md:table-cell md:p-2">
                  <span className="text-sm text-muted-foreground md:hidden">
                    Connected
                  </span>
                  <span>{connection.connection_date || "-"}</span>
                </TableCell>
                <TableCell className="flex items-center justify-between gap-4 p-0 md:table-cell md:p-2">
                  <span className="text-sm text-muted-foreground md:hidden">
                    Status
                  </span>
                  <Badge variant="secondary">
                    {connection.status || "Connected"}
                  </Badge>
                </TableCell>
                <TableCell className="p-0 text-right md:table-cell md:p-2">
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
                          <Link href={`/settings/klaviyo?id=${connection.id}`} />
                        }
                      >
                        Edit
                      </DropdownMenuLinkItem>
                      {workspacePermissions.canDeleteIntegrations && (
                        <DropdownMenuItem
                          className="text-destructive data-highlighted:bg-destructive/10 data-highlighted:text-destructive"
                          onClick={() => openDeleteConnectionDialog(connection)}
                        >
                          Delete
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="text-lg text-muted-foreground">No connections</p>
      )}

      {workspacePermissions.canCreateIntegrations && (
      <div className="grid w-full gap-4 sm:w-fit">
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger render={<Button className="w-full sm:w-fit" />}>
            Add Connection
          </DialogTrigger>
          <DialogContent
            className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-4xl"
            showCloseButton={false}
          >
            <DialogHeader>
              <DialogTitle>Add Connections</DialogTitle>
            </DialogHeader>

            {statusMessage && statusTone === "error" && (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertTitle>Connection problem</AlertTitle>
                <AlertDescription>{statusMessage}</AlertDescription>
              </Alert>
            )}

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
                      <Button
                        type="button"
                        className="w-full sm:w-36"
                        disabled={connectingKlaviyo}
                        onClick={addKlaviyoConnection}
                      >
                        {connectingKlaviyo && (
                          <Loader2 className="size-4 animate-spin" />
                        )}
                        {provider.status}
                      </Button>
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
      )}

      {workspacePermissions.canDeleteIntegrations && (
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
      )}
    </div>
  )
}
