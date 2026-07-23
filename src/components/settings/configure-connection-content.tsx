"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { CheckCircle2, Info, Loader2, Trash2 } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from "@/components/ui/combobox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { useWorkspacePermissions } from "@/lib/use-workspace-permissions"

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

const fullMailboxRetryOptions = ["0", "6", "12", "24", "36"]
const standardRetryOptions = ["0", "3", "6"]
const allEmailsSegment = { id: "all-emails", name: "All Emails" }

function retryOptionLabel(option: string, unit: "month" | "retry") {
  if (option === "0") {
    return "Off"
  }

  const amount = Number(option)
  const label =
    unit === "month"
      ? `${amount} ${amount === 1 ? "month" : "months"}`
      : `${amount} ${amount === 1 ? "retry" : "retries"}`

  if (
    (unit === "month" && option === "12") ||
    (unit === "retry" && option === "3")
  ) {
    return `${label} (recommended)`
  }

  return label
}

function normalizeSegmentOption(segment?: SegmentOption | null) {
  if (!segment?.id) {
    return null
  }

  return {
    id: segment.id,
    name: segment.name?.trim() || "Unnamed segment",
  }
}

function mergeSegmentOptions(...groups: (SegmentOption | null | undefined)[][]) {
  const segments = new Map<string, SegmentOption>()

  for (const group of groups) {
    for (const option of group) {
      const segment = normalizeSegmentOption(option)
      if (!segment || segments.has(segment.id)) {
        continue
      }
      segments.set(segment.id, segment)
    }
  }

  return Array.from(segments.values())
}

export function ConfigureConnectionContent() {
  const searchParams = useSearchParams()
  const accountId = searchParams.get("id")
  const [connectionName, setConnectionName] = useState("")
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null)
  const [selectedSegmentName, setSelectedSegmentName] = useState<string | null>(
    null
  )
  const [segmentOptions, setSegmentOptions] = useState<SegmentOption[]>([])
  const [segmentSearch, setSegmentSearch] = useState("")
  const [segmentDropdownOpen, setSegmentDropdownOpen] = useState(false)
  const [segmentsLoading, setSegmentsLoading] = useState(false)
  const [fixTypos, setFixTypos] = useState(true)
  const [fullMailboxRetries, setFullMailboxRetries] = useState("12")
  const [greylistedRetries, setGreylistedRetries] = useState("3")
  const [temporaryErrorRetries, setTemporaryErrorRetries] = useState("3")
  const [unexpectedErrorRetries, setUnexpectedErrorRetries] = useState("3")
  const [statusMessage, setStatusMessage] = useState("")
  const [accountLoading, setAccountLoading] = useState(Boolean(accountId))
  const [saving, setSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false)
  const [removeConfirmation, setRemoveConfirmation] = useState("")
  const [removed, setRemoved] = useState(false)
  const workspacePermissions = useWorkspacePermissions()

  useEffect(() => {
    if (!accountId) {
      return
    }

    let cancelled = false

    async function loadAccount() {
      setAccountLoading(true)
      try {
        const response = await fetch(`/api/oauth/klaviyo/accounts?id=${accountId}`)
        if (!response.ok) {
          if (!cancelled) {
            setStatusMessage("Unable to load Klaviyo connection.")
          }
          return
        }

        const accounts = (await response.json()) as KlaviyoAccount[]
        const nextAccount = accounts[0]
        if (!nextAccount || cancelled) {
          return
        }

        setConnectionName(nextAccount.connection_name || "")
        setSelectedSegmentId(nextAccount.selected_segment?.id || null)
        setSelectedSegmentName(nextAccount.selected_segment?.name || null)
        setSegmentOptions(
          mergeSegmentOptions(
            nextAccount.selected_segment?.id
              ? [
                  {
                    id: nextAccount.selected_segment.id,
                    name:
                      nextAccount.selected_segment.name || "Selected segment",
                  },
                ]
              : [],
            nextAccount.segments || []
          )
        )
        setFixTypos(Boolean(nextAccount.fix_typos))
        setFullMailboxRetries(String(nextAccount.full_mailbox_retries ?? 12))
        setGreylistedRetries(String(nextAccount.greylisted_retries ?? 3))
        setTemporaryErrorRetries(
          String(nextAccount.mail_server_temporary_error_retries ?? 3)
        )
        setUnexpectedErrorRetries(
          String(nextAccount.unexpected_error_retries ?? 3)
        )
      } finally {
        if (!cancelled) {
          setAccountLoading(false)
        }
      }
    }

    loadAccount()
    return () => {
      cancelled = true
    }
  }, [accountId])

  useEffect(() => {
    if (!accountId || removed || !segmentDropdownOpen) {
      return
    }

    const controller = new AbortController()
    let cancelled = false
    const timeout = window.setTimeout(async () => {
      setSegmentsLoading(true)
      try {
        const params = new URLSearchParams({
          id: accountId,
          segment_search: segmentSearch,
          segment_limit: "30",
        })
        const response = await fetch(`/api/oauth/klaviyo/segments?${params}`, {
          signal: controller.signal,
        })
        if (!response.ok) {
          return
        }
        const data = (await response.json()) as SegmentOption[]
        if (!cancelled) {
          setSegmentOptions((current) =>
            mergeSegmentOptions(
              selectedSegmentId
                ? [
                    {
                      id: selectedSegmentId,
                      name: selectedSegmentName || "Selected segment",
                    },
                  ]
                : [],
              data,
              current.filter((segment) => segment.id === selectedSegmentId)
            )
          )
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("Unable to load Klaviyo segments", error)
        }
      } finally {
        if (!cancelled) {
          setSegmentsLoading(false)
        }
      }
    }, 250)

    return () => {
      cancelled = true
      controller.abort()
      window.clearTimeout(timeout)
    }
  }, [
    accountId,
    removed,
    segmentDropdownOpen,
    segmentSearch,
    selectedSegmentId,
    selectedSegmentName,
  ])

  async function saveConnection() {
    if (removed) {
      return
    }

    if (!accountId) {
      setStatusMessage("Select a Klaviyo connection to edit.")
      return
    }

    setRemoved(false)
    setSaving(true)
    try {
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
    } finally {
      setSaving(false)
    }
  }

  async function refreshSegments() {
    if (!accountId || removed) {
      return
    }

    setRefreshing(true)
    try {
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

      setSegmentOptions((current) =>
        mergeSegmentOptions(
          selectedSegmentId
            ? [
                {
                  id: selectedSegmentId,
                  name: selectedSegmentName || "Selected segment",
                },
              ]
            : [],
          data.segments,
          current.filter((segment) => segment.id === selectedSegmentId)
        )
      )
      setStatusMessage("Segments refreshed.")
    } finally {
      setRefreshing(false)
    }
  }

  const removeConfirmationName = connectionName.trim() || "Klaviyo"
  const removeConfirmationMatches =
    removeConfirmation.trim() === removeConfirmationName

  async function removeConnection() {
    if (!accountId || removed || !removeConfirmationMatches) {
      return
    }

    if (!workspacePermissions.canDeleteIntegrations) {
      setStatusMessage("Only owners and admins can delete integrations.")
      return
    }

    setRemoving(true)
    try {
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
      setRemoveDialogOpen(false)
      setRemoveConfirmation("")
      setStatusMessage("Klaviyo connection removed from this workspace.")
    } finally {
      setRemoving(false)
    }
  }

  const retrySettings = [
    {
      title: "Full Mailbox Retries",
      description:
        "Retry full mailboxes once per month, up to the number of months you set.",
      value: fullMailboxRetries,
      onChange: setFullMailboxRetries,
      unit: "month" as const,
      options: fullMailboxRetryOptions,
    },
    {
      title: "Greylisted",
      description: "Retry emails blocked due to greylisting.",
      value: greylistedRetries,
      onChange: setGreylistedRetries,
      unit: "retry" as const,
      options: standardRetryOptions,
    },
    {
      title: "Mail Server Temporary Error",
      description:
        "Set how many times to retry emails after temporary errors like server timeouts.",
      value: temporaryErrorRetries,
      onChange: setTemporaryErrorRetries,
      unit: "retry" as const,
      options: standardRetryOptions,
    },
    {
      title: "Unexpected Error",
      description: "Retry emails that failed due to unknown issues.",
      value: unexpectedErrorRetries,
      onChange: setUnexpectedErrorRetries,
      unit: "retry" as const,
      options: standardRetryOptions,
    },
  ]
  const selectedSegment =
    selectedSegmentId
      ? normalizeSegmentOption(
          segmentOptions.find((segment) => segment.id === selectedSegmentId) ||
            {
              id: selectedSegmentId,
              name: selectedSegmentName || "Selected segment",
            }
        )
      : allEmailsSegment
  const segmentChoices = [
    allEmailsSegment,
    ...mergeSegmentOptions(
      selectedSegment?.id !== allEmailsSegment.id ? [selectedSegment] : [],
      segmentOptions
    ),
  ]

  return (
    <div className="grid w-full max-w-3xl gap-4">
      <div className="mb-2 grid gap-2 sm:mb-4">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/settings">Settings</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Edit Connection</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <h1 className="text-2xl font-semibold tracking-normal sm:text-3xl">
          Edit Connection
        </h1>
      </div>

      <Card>
        <CardContent className="grid gap-3">
          <Label htmlFor="connection-name" className="text-xl">
            Name This Connection
          </Label>
          {accountLoading ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <Input
              id="connection-name"
              name="connection-name"
              value={connectionName}
              onChange={(event) => setConnectionName(event.target.value)}
              disabled={removed}
            />
          )}
        </CardContent>
      </Card>

      {(statusMessage || !accountId) && (
        <Alert>
          <CheckCircle2 className="size-4" />
          <AlertTitle>Connection updated</AlertTitle>
          <AlertDescription>
            {statusMessage || "Select a Klaviyo connection to edit."}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Choose a Klaviyo Segment</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-sm text-muted-foreground">
            This segment will be monitored for new email addresses to check.
            Lists are not shown.
          </p>
          {accountLoading ? (
            <Skeleton className="h-4 w-64" />
          ) : !segmentOptions.length ? (
            <p className="flex items-start gap-1 text-sm text-muted-foreground">
              <Info className="mt-0.5 size-4" />
              No segments found. Create a segment in Klaviyo, then refresh.
            </p>
          ) : null}
          {accountLoading ? (
            <Skeleton className="h-8 w-full sm:max-w-md" />
          ) : (
            <Combobox
              disabled={removed}
              items={segmentChoices}
              filter={null}
              inputValue={segmentSearch}
              itemToStringLabel={(segment: SegmentOption) => segment.name}
              itemToStringValue={(segment: SegmentOption) => segment.id}
              isItemEqualToValue={(item: SegmentOption, value: SegmentOption) =>
                item.id === value.id
              }
              value={selectedSegment}
              onInputValueChange={(value) => setSegmentSearch(value)}
              onOpenChange={(open) => {
                setSegmentDropdownOpen(open)
                if (open) {
                  setSegmentSearch("")
                }
              }}
              onValueChange={(segment) => {
                if (!segment) {
                  return
                }
                if (segment.id === allEmailsSegment.id) {
                  setSelectedSegmentId(null)
                  setSelectedSegmentName(null)
                } else {
                  setSelectedSegmentId(segment.id)
                  setSelectedSegmentName(segment.name)
                }
                setSegmentSearch("")
              }}
            >
              <ComboboxTrigger className="w-full sm:max-w-md">
                <ComboboxValue>
                  {(segment: SegmentOption | null) =>
                    segment?.name || allEmailsSegment.name
                  }
                </ComboboxValue>
              </ComboboxTrigger>
              <ComboboxContent>
                <div className="border-b p-1">
                  <ComboboxInput placeholder="Search segments" />
                </div>
                {segmentsLoading ? (
                  <div className="flex items-center gap-2 px-2 py-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Loading segments
                  </div>
                ) : null}
                <ComboboxEmpty>No matching segments found.</ComboboxEmpty>
                <ComboboxList>
                  {(segment: SegmentOption) => (
                    <ComboboxItem key={segment.id} value={segment}>
                      {segment.name}
                    </ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          )}
          <Button
            type="button"
            variant="outline"
            className="w-fit"
            disabled={!accountId || accountLoading || refreshing || removed}
            onClick={refreshSegments}
          >
            {refreshing && <Loader2 className="size-4 animate-spin" />}
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
                disabled={accountLoading || removed}
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
                  {setting.options.map((option) => (
                    <SelectItem key={option} value={option}>
                      {retryOptionLabel(option, setting.unit)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="sticky bottom-0 z-10 -mx-4 mt-2 grid gap-3 border-t bg-background/95 p-4 sm:mx-0 sm:flex sm:items-center sm:justify-between sm:rounded-lg sm:border">
        <Button
          type="button"
          disabled={accountLoading || saving || removed}
          onClick={saveConnection}
        >
          {saving && <Loader2 className="size-4 animate-spin" />}
          Save
        </Button>
        {workspacePermissions.canDeleteIntegrations && (
          <Button
            type="button"
            variant="destructive"
            disabled={accountLoading || removing || removed}
            onClick={() => {
              setRemoveConfirmation("")
              setRemoveDialogOpen(true)
            }}
          >
            <Trash2 className="size-4" />
            Delete connection
          </Button>
        )}
      </div>

      {workspacePermissions.canDeleteIntegrations && (
      <Dialog
        open={removeDialogOpen}
        onOpenChange={(open) => {
          setRemoveDialogOpen(open)
          if (!open) {
            setRemoveConfirmation("")
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete connection</DialogTitle>
            <DialogDescription>
              Type {removeConfirmationName} to confirm deleting this Klaviyo
              connection.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="remove-connection-confirmation">
              Connection name
            </Label>
            <Input
              id="remove-connection-confirmation"
              value={removeConfirmation}
              onChange={(event) => setRemoveConfirmation(event.target.value)}
              placeholder={removeConfirmationName}
            />
          </div>
          <div className="grid gap-2 sm:flex sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={removing}
              onClick={() => setRemoveDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!removeConfirmationMatches || removing}
              onClick={removeConnection}
            >
              {removing && <Loader2 className="size-4 animate-spin" />}
              <Trash2 className="size-4" />
              Delete connection
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      )}

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
