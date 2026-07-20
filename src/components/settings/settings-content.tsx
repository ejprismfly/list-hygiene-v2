"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Info, Mail, ShoppingBag } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
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
            <TableHead className="w-40" />
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
                <Skeleton className="h-8 w-32" />
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
  const hasConnections = connections.length > 0

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
    await startKlaviyoOAuth({
      onMissingClientId: () =>
        setStatusMessage("Klaviyo client ID is not configured."),
    })
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
          .then((data) => setConnections(data))
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
                <TableHead className="w-40" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {connections.map((connection) => (
                <TableRow key={connection.id}>
                  <TableCell>{connection.platform || "Klaviyo"}</TableCell>
                  <TableCell>
                    {connection.connection_name || "Klaviyo"}
                  </TableCell>
                  <TableCell>{connection.connection_date || "-"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {connection.status || "Connected"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/settings/klaviyo?id=${connection.id}`}
                      className={buttonVariants({ className: "w-32" })}
                    >
                      Configure
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="text-lg text-muted-foreground">
          No Integration connected yet.
        </p>
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

            <Badge
              variant="secondary"
              className="h-auto w-full justify-start rounded-lg px-4 py-3 text-sm"
            >
              Multiple connections coming soon.
            </Badge>

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

        <div className="flex items-start gap-2 text-sm">
          <Info className="mt-0.5 size-4" />
          <span>Multiple connections will be available soon.</span>
        </div>
      </div>
    </div>
  )
}
