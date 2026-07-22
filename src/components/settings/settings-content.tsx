"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  Info,
  Loader2,
  Mail,
  MoreHorizontal,
  ShoppingBag,
  Trash2,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
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
import { startKlaviyoOAuth } from "@/lib/klaviyo-oauth"
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
  const [connectionToDelete, setConnectionToDelete] =
    useState<KlaviyoConnection | null>(null)
  const [deleteConnectionDialogOpen, setDeleteConnectionDialogOpen] =
    useState(false)
  const [deleteConnectionConfirmation, setDeleteConnectionConfirmation] =
    useState("")
  const [connectingKlaviyo, setConnectingKlaviyo] = useState(false)
  const [deletingConnection, setDeletingConnection] = useState(false)
  const hasConnections = connections.length > 0
  const deleteConnectionName = connectionToDelete
    ? connectionDisplayName(connectionToDelete)
    : ""
  const deleteConnectionConfirmationMatches =
    Boolean(deleteConnectionName) &&
    deleteConnectionConfirmation.trim() === deleteConnectionName

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
    setConnectingKlaviyo(true)
    setStatusMessage("")
    try {
      const started = await startKlaviyoOAuth({
        onMissingClientId: () =>
          setStatusMessage("Klaviyo client ID is not configured."),
      })
      if (started) {
        setStatusMessage("Opening Klaviyo authorization.")
      }
    } catch {
      setStatusMessage("Unable to connect Klaviyo. Please try again.")
    } finally {
      setConnectingKlaviyo(false)
    }
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
      setStatusMessage(`${connectionDisplayName(connectionToDelete)} deleted.`)
      setDeleteConnectionDialogOpen(false)
      setConnectionToDelete(null)
      setDeleteConnectionConfirmation("")
      invalidateWorkspaceClientData()
    } finally {
      setDeletingConnection(false)
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
      ) : (
        <p className="text-lg text-muted-foreground">No connections</p>
      )}

      <div className="grid w-full gap-4 sm:w-fit">
        <Dialog>
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
                            disabled={connectingKlaviyo}
                            onClick={addKlaviyoConnection}
                          />
                        }
                      >
                        {connectingKlaviyo && (
                          <Loader2 className="size-4 animate-spin" />
                        )}
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
