"use client"

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
  return (
    <div className="grid gap-6">
      <h1 className="text-3xl font-semibold tracking-normal">Integrations</h1>

      {connected ? (
        <Table>
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
            <TableRow>
              <TableCell>Klaviyo</TableCell>
              <TableCell>Prismfly Development1</TableCell>
              <TableCell>March 9, 2026</TableCell>
              <TableCell>
                <Badge variant="secondary">Connected</Badge>
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
          </TableBody>
        </Table>
      ) : (
        <p className="text-lg text-muted-foreground">
          No Integration connected yet.
        </p>
      )}

      <div className="grid w-fit gap-4">
        <Dialog>
          <DialogTrigger render={<Button />}>Add Connection</DialogTrigger>
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
                    className="flex items-center justify-between gap-4 rounded-lg border p-3"
                  >
                    <div className="flex items-center gap-3 text-base font-medium">
                      <Icon className="size-5" />
                      {provider.name}
                    </div>
                    {provider.available ? (
                      <Link
                        href="/settings/klaviyo"
                        className={buttonVariants({ className: "w-36" })}
                      >
                        {provider.status}
                      </Link>
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

        <div className="flex items-center gap-2 text-sm">
          <Info className="size-4" />
          Multiple connections will be available soon.
        </div>
      </div>
    </div>
  )
}
