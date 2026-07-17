"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
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

type SegmentOption = {
  id: string
  name: string
}

type KlaviyoAccount = {
  id: string
  connection_name?: string | null
  selected_segment?: {
    id: string | null
    name: string | null
  }
  segments?: SegmentOption[]
  fix_typos?: boolean
  full_mailbox_retries?: number
  greylisted_retries?: number
  mail_server_temporary_error_retries?: number
  unexpected_error_retries?: number
}

const retryOptions = ["0", "1", "2", "3", "6", "12"]

export function ConfigureConnectionContent() {
  const searchParams = useSearchParams()
  const accountId = searchParams.get("id")
  const [account, setAccount] = useState<KlaviyoAccount | null>(null)
  const [connectionName, setConnectionName] = useState("")
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null)
  const [fixTypos, setFixTypos] = useState(true)
  const [fullMailboxRetries, setFullMailboxRetries] = useState("12")
  const [greylistedRetries, setGreylistedRetries] = useState("3")
  const [temporaryErrorRetries, setTemporaryErrorRetries] = useState("3")
  const [unexpectedErrorRetries, setUnexpectedErrorRetries] = useState("3")
  const [statusMessage, setStatusMessage] = useState("")
  const [removed, setRemoved] = useState(false)

  useEffect(() => {
    if (!accountId) {
      return
    }

    let cancelled = false

    async function loadAccount() {
      const response = await fetch(`/api/oauth/klaviyo/accounts?id=${accountId}`)
      if (!response.ok) {
        setStatusMessage("Unable to load Klaviyo connection.")
        return
      }

      const accounts = (await response.json()) as KlaviyoAccount[]
      const nextAccount = accounts[0]
      if (!nextAccount || cancelled) {
        return
      }

      setAccount(nextAccount)
      setConnectionName(nextAccount.connection_name || "")
      setSelectedSegmentId(nextAccount.selected_segment?.id || null)
      setFixTypos(Boolean(nextAccount.fix_typos))
      setFullMailboxRetries(String(nextAccount.full_mailbox_retries ?? 12))
      setGreylistedRetries(String(nextAccount.greylisted_retries ?? 3))
      setTemporaryErrorRetries(
        String(nextAccount.mail_server_temporary_error_retries ?? 3)
      )
      setUnexpectedErrorRetries(
        String(nextAccount.unexpected_error_retries ?? 3)
      )
    }

    loadAccount()
    return () => {
      cancelled = true
    }
  }, [accountId])

  async function saveConnection() {
    if (removed) {
      return
    }

    if (!accountId) {
      setStatusMessage("Select a Klaviyo connection to configure.")
      return
    }

    setRemoved(false)
    const response = await fetch("/api/oauth/klaviyo/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: accountId,
        segment_id: selectedSegmentId,
        connection_name: connectionName,
        fix_typos: fixTypos,
        full_mailbox_retries: Number(fullMailboxRetries),
        greylisted_retries: Number(greylistedRetries),
        mail_server_temporary_error_retries: Number(temporaryErrorRetries),
        unexpected_error_retries: Number(unexpectedErrorRetries),
      }),
    })

    if (!response.ok) {
      const data = await response.json()
      setStatusMessage(data.error || "Unable to save Klaviyo settings.")
      return
    }

    setStatusMessage(`${connectionName || "Klaviyo"} settings saved.`)
  }

  async function refreshSegments() {
    if (!accountId || removed) {
      return
    }

    const response = await fetch("/api/oauth/klaviyo/segments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: accountId }),
    })
    const data = await response.json()
    if (!response.ok) {
      setStatusMessage(data.error || "Unable to refresh segments.")
      return
    }

    setAccount((current) =>
      current ? { ...current, segments: data.segments } : current
    )
    setStatusMessage("Segments refreshed.")
  }

  async function removeConnection() {
    if (!accountId || removed) {
      return
    }

    const response = await fetch("/api/oauth/klaviyo/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: accountId }),
    })

    if (!response.ok) {
      const data = await response.json()
      setStatusMessage(data.error || "Unable to remove Klaviyo connection.")
      return
    }

    setRemoved(true)
    setStatusMessage("Klaviyo connection removed from this workspace.")
  }

  const retrySettings = [
    {
      title: "Full Mailbox Retries",
      description:
        "Retry full mailboxes once per month, up to the number of months you set.",
      value: fullMailboxRetries,
      onChange: setFullMailboxRetries,
    },
    {
      title: "Greylisted",
      description: "Retry emails blocked due to greylisting.",
      value: greylistedRetries,
      onChange: setGreylistedRetries,
    },
    {
      title: "Mail Server Temporary Error",
      description:
        "Set how many times to retry emails after temporary errors like server timeouts.",
      value: temporaryErrorRetries,
      onChange: setTemporaryErrorRetries,
    },
    {
      title: "Unexpected Error",
      description: "Retry emails that failed due to unknown issues.",
      value: unexpectedErrorRetries,
      onChange: setUnexpectedErrorRetries,
    },
  ]

  return (
    <div className="grid w-full max-w-3xl gap-4">
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

        {(statusMessage || !accountId) && (
          <Alert>
            <CheckCircle2 className="size-4" />
            <AlertTitle>Connection updated</AlertTitle>
            <AlertDescription>
              {statusMessage || "Select a Klaviyo connection to configure."}
            </AlertDescription>
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
            {!account?.segments?.length && (
              <p className="text-sm text-muted-foreground">
                No segments found. Create a segment in Klaviyo, then refresh.
              </p>
            )}
            <Select
              disabled={removed}
              value={selectedSegmentId || "all-emails"}
              onValueChange={(value) =>
                setSelectedSegmentId(value === "all-emails" ? null : value)
              }
            >
              <SelectTrigger className="w-full sm:max-w-md">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all-emails">All Emails</SelectItem>
                {(account?.segments || []).map((segment) => (
                  <SelectItem key={segment.id} value={segment.id}>
                    {segment.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              className="w-fit"
              disabled={!accountId || removed}
              onClick={refreshSegments}
            >
              Refresh
            </Button>
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
                <Select
                  disabled={removed}
                  value={setting.value}
                  onValueChange={(value) => {
                    if (value) {
                      setting.onChange(value)
                    }
                  }}
                >
                  <SelectTrigger className="w-full sm:max-w-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {retryOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option === "0" ? "Never retry" : `${option} retries`}
                      </SelectItem>
                    ))}
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
          <Button
            type="button"
            variant="destructive"
            disabled={removed}
            onClick={removeConnection}
          >
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
  )
}
