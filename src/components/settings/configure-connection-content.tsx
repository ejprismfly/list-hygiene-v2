"use client"

import { useState } from "react"
import Link from "next/link"
import { CheckCircle2 } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { Switch } from "@/components/ui/switch"
import { buttonVariants } from "@/components/ui/button"

const retrySettings = [
  {
    title: "Full Mailbox Retries",
    description:
      "Retry full mailboxes once per month, up to the number of months you set.",
    value: "12 months (recommended)",
  },
  {
    title: "Greylisted",
    description: "Retry emails blocked due to greylisting.",
    value: "3 retries (recommended)",
  },
  {
    title: "Mail Server Temporary Error",
    description:
      "Set how many times to retry emails after temporary errors like server timeouts.",
    value: "3 retries (recommended)",
  },
  {
    title: "Unexpected Error",
    description: "Retry emails that failed due to unknown issues.",
    value: "3 retries (recommended)",
  },
]

export function ConfigureConnectionContent() {
  const [connectionName, setConnectionName] = useState("Prismfly Development1")
  const [fixTypos, setFixTypos] = useState(true)
  const [statusMessage, setStatusMessage] = useState("")
  const [removed, setRemoved] = useState(false)

  function saveConnection() {
    setRemoved(false)
    setStatusMessage(`${connectionName || "Klaviyo"} settings saved.`)
  }

  function removeConnection() {
    setRemoved(true)
    setStatusMessage("Klaviyo connection removed from this workspace.")
  }

  return (
    <main className="min-h-svh bg-background p-4 sm:p-6 md:p-20">
      <div className="mx-auto grid w-full max-w-3xl gap-4">
        <h1 className="mb-2 text-2xl font-semibold tracking-normal sm:mb-4 sm:text-3xl">
          Configure Your Connection
        </h1>

        <Card>
          <CardContent className="grid gap-3">
            <Label htmlFor="connection-name" className="text-lg">
              Name This Connection
            </Label>
            <Input
              id="connection-name"
              name="connection-name"
              value={connectionName}
              onChange={(event) => setConnectionName(event.target.value)}
              disabled={removed}
            />
          </CardContent>
        </Card>

        {statusMessage && (
          <Alert>
            <CheckCircle2 className="size-4" />
            <AlertTitle>Connection updated</AlertTitle>
            <AlertDescription>{statusMessage}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Manage Klaviyo Segments*</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <p className="text-sm text-muted-foreground">
              Select a Klaviyo segment to monitor for new email addresses to
              check.
            </p>
            <p className="text-sm text-muted-foreground">
              No segments found. Create a segment in Klaviyo, then refresh.
            </p>
            <Select defaultValue="all-emails">
              <SelectTrigger className="w-full sm:max-w-md">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all-emails">All Emails</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid gap-6">
            <div className="grid gap-3">
              <div className="flex items-center justify-between gap-4 sm:justify-start">
                <h2 className="text-xl font-medium">Fix Typos</h2>
                <Switch
                  checked={fixTypos}
                  disabled={removed}
                  aria-label="Fix typos"
                  onCheckedChange={setFixTypos}
                />
              </div>
              <p className="text-sm text-muted-foreground">
                Fix domain typos with verified corrections that update or merge
                existing records.
              </p>
            </div>

            {retrySettings.map((setting) => (
              <div key={setting.title} className="grid gap-3">
                <Separator />
                <h2 className="text-xl font-medium">{setting.title}</h2>
                <p className="text-sm text-muted-foreground">
                  {setting.description}
                </p>
                <Select defaultValue={setting.value}>
                  <SelectTrigger className="w-full sm:max-w-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={setting.value}>{setting.value}</SelectItem>
                    <SelectItem value="1 retry">1 retry</SelectItem>
                    <SelectItem value="Never retry">Never retry</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="mt-2 grid gap-3 sm:flex sm:items-center sm:justify-between">
          <Button type="button" disabled={removed} onClick={saveConnection}>
            Save
          </Button>
          <Button type="button" variant="destructive" onClick={removeConnection}>
            Remove Connection
          </Button>
        </div>

        <Link
          href="/settings"
          className={buttonVariants({ variant: "outline", className: "w-fit" })}
        >
          Back to integrations
        </Link>

        <p className="text-sm text-muted-foreground">
          Having any issues? Contact{" "}
          <a
            href="mailto:support@listhygiene.com"
            className="font-medium underline underline-offset-4"
          >
            support@listhygiene.com
          </a>
        </p>
      </div>
    </main>
  )
}
