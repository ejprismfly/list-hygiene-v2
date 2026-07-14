"use client"

import { useState } from "react"
import Link from "next/link"
import { Info, Mail, ShoppingBag } from "lucide-react"

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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { integrationDemoData } from "@/lib/demo-data"

type SettingsContentProps = {
  connected?: boolean
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

export function SettingsContent({ connected = false }: SettingsContentProps) {
  const [connections, setConnections] = useState(
    connected ? integrationDemoData : []
  )
  const hasConnections = connections.length > 0

  function addKlaviyoConnection() {
    setConnections((current) =>
      current.length ? current : integrationDemoData
    )
  }

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold tracking-normal sm:text-3xl">
        Integrations
      </h1>

      {hasConnections ? (
        <Table className="min-w-[44rem]">
          <TableHeader>
            <TableRow>
              <TableHead>Platform</TableHead>
              <TableHead>Connection Name</TableHead>
              <TableHead>Workspace</TableHead>
              <TableHead>Connected</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-40" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {connections.map((connection) => (
              <TableRow key={connection.connectionName}>
                <TableCell>{connection.platform}</TableCell>
                <TableCell>{connection.connectionName}</TableCell>
                <TableCell>{connection.workspaceName}</TableCell>
                <TableCell>{connection.connectedAt}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{connection.status}</Badge>
                </TableCell>
                <TableCell>
                  <Link
                    href="/settings/klaviyo"
                    className={buttonVariants({ className: "w-32" })}
                  >
                    Configure
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
              <DialogDescription>
                Multiple connections coming soon.
              </DialogDescription>
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

        <div className="flex items-start gap-2 text-sm">
          <Info className="mt-0.5 size-4" />
          <span>Multiple connections will be available soon.</span>
        </div>
      </div>
    </div>
  )
}
