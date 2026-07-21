"use client"

import { useEffect, useMemo, useState } from "react"
import { Info } from "lucide-react"

import { BillingReturnTracker } from "@/components/billing/billing-return-tracker"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { trackPlanChangeStarted } from "@/lib/billing-tracking"

type BillingContentProps = {
  email: string
}

type BillingPlanRow = {
  id: string
  name: string
  display_credits?: string | null
  display_price?: string | null
  display_per_unit?: string | null
  action_label?: string | null
  checkout_url?: string | null
  selected?: boolean
}

type BillingPlanGroup = {
  label: string
  range: string
  selected?: boolean
  rows?: BillingPlanRow[]
}

type BillingResponse = {
  account: {
    current_plan: string
    credits_used: number
    credits_plan: number
    credits_remaining: number
    trial_plan: number
    trial_used: number
    trial_remaining: number
    trial_completed: boolean
    trial_percentage: string
    usage_percentage: string
    reset_date: string
    overage_used: number
    overage_plan: number
    overage_remaining: number
    overage_percentage: string
    total: string
    invoice_date: string
  }
  plans: BillingPlanGroup[]
  customer: {
    id?: string
    email?: string
  }
  payments: {
    id: string
    brand: string
    last4: string
    exp_month: string
    exp_year: string
    is_default: boolean
  }[]
  portal: string
  billing_context?: {
    customer_id?: string | null
    organization_id?: string | null
    workspace_id?: string | null
    account_source?: string
    billing_scope?: string | null
  }
}

const emptyBilling: BillingResponse = {
  account: {
    current_plan: "None",
    credits_used: 0,
    credits_plan: 0,
    credits_remaining: 0,
    trial_plan: 0,
    trial_used: 0,
    trial_remaining: 0,
    trial_completed: true,
    trial_percentage: "0%",
    usage_percentage: "0%",
    reset_date: "-",
    overage_used: 0,
    overage_plan: 0,
    overage_remaining: 0,
    overage_percentage: "0%",
    total: "$0",
    invoice_date: "-",
  },
  plans: [],
  customer: {},
  payments: [],
  portal: "/api/billing/portal",
}

function formatUsageCount(value: number) {
  return Number(value || 0).toLocaleString()
}

function calculateUsagePercent(used: number, total: number) {
  if (!total) {
    return 0
  }

  return Math.min(100, Math.round((used / total) * 10000) / 100)
}

function formatUsagePercent(value: number) {
  return `${value.toFixed(2)}%`
}

function UsageProgressRow({
  label,
  used,
  total,
  percent,
  info,
}: {
  label: string
  used: number
  total: number
  percent: number
  info?: string
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-4 text-sm">
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <span>
            {label} ({formatUsagePercent(percent)})
          </span>
          {info && (
            <Info
              aria-label={info}
              className="size-4 shrink-0 text-muted-foreground"
            >
              <title>{info}</title>
            </Info>
          )}
        </span>
        <span className="shrink-0 text-muted-foreground">
          {formatUsageCount(used)} of {formatUsageCount(total)}
        </span>
      </div>
      <Progress
        aria-label={`${label}: ${formatUsageCount(used)} of ${formatUsageCount(
          total
        )}`}
        className="gap-0"
        value={percent}
      />
    </div>
  )
}

function UsageProgressSkeleton() {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-4 w-16" />
      </div>
      <Skeleton className="h-1 w-full rounded-full" />
    </div>
  )
}

function PlanTableSkeleton() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, index) => (
        <TableRow key={index} className="grid gap-3 p-4 md:table-row md:p-0">
          <TableCell className="flex items-center justify-between gap-4 p-0 md:table-cell md:p-2">
            <span className="text-sm text-muted-foreground md:hidden">
              Credits
            </span>
            <Skeleton className="h-4 w-20" />
          </TableCell>
          <TableCell className="flex items-center justify-between gap-4 p-0 md:table-cell md:p-2">
            <span className="text-sm text-muted-foreground md:hidden">
              Price
            </span>
            <Skeleton className="h-4 w-12" />
          </TableCell>
          <TableCell className="flex items-center justify-between gap-4 p-0 md:table-cell md:p-2">
            <span className="text-sm text-muted-foreground md:hidden">
              Per Unit
            </span>
            <Skeleton className="h-4 w-14" />
          </TableCell>
          <TableCell className="p-0 md:table-cell md:p-2">
            <Skeleton className="h-8 w-full md:w-32" />
          </TableCell>
        </TableRow>
      ))}
    </>
  )
}

export function BillingContent({ email }: BillingContentProps) {
  const [billing, setBilling] = useState<BillingResponse>(emptyBilling)
  const [statusMessage, setStatusMessage] = useState("")
  const [loading, setLoading] = useState(true)
  const [activePlanRange, setActivePlanRange] = useState("9999")

  useEffect(() => {
    let cancelled = false

    async function loadBilling() {
      setLoading(true)

      try {
        const response = await fetch("/api/billing")
        if (!response.ok) {
          if (!cancelled) {
            setStatusMessage("Unable to load billing for this workspace.")
          }
          return
        }

        const data = (await response.json()) as BillingResponse
        if (!cancelled) {
          const selectedGroup = data.plans.find((group) => group.selected)
          setBilling(data)
          setActivePlanRange(
            selectedGroup?.range || data.plans[0]?.range || "9999"
          )
        }
      } catch {
        if (!cancelled) {
          setStatusMessage("Unable to load billing for this workspace.")
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadBilling()
    return () => {
      cancelled = true
    }
  }, [])

  const trialUsagePercent = useMemo(() => {
    return calculateUsagePercent(
      billing.account.trial_used,
      billing.account.trial_plan
    )
  }, [billing])

  const planUsagePercent = useMemo(() => {
    return calculateUsagePercent(
      billing.account.credits_used,
      billing.account.credits_plan
    )
  }, [billing])

  const overageUsagePercent = useMemo(() => {
    return calculateUsagePercent(
      billing.account.overage_used,
      billing.account.overage_plan
    )
  }, [billing])

  const trialRemaining = Number(billing.account.trial_remaining || 0)
  const trialActive =
    billing.account.trial_plan > 0 &&
    trialRemaining > 0 &&
    !billing.account.trial_completed
  const overageUsed = Number(billing.account.overage_used || 0)
  const overageTotal =
    billing.account.overage_plan ||
    billing.account.overage_used + billing.account.overage_remaining
  const showOverage = overageUsed > 0
  const resetDate = billing.account.reset_date || billing.account.invoice_date

  function openBillingRoute(url: string | null | undefined, fallback: string) {
    try {
      const route = new URL(url || fallback, window.location.origin)
      window.location.assign(`${route.pathname}${route.search}${route.hash}`)
    } catch {
      window.location.assign(fallback)
    }
  }

  function openPortal() {
    openBillingRoute(billing.portal, "/api/billing/portal")
  }

  function selectPlan(plan: BillingPlanRow) {
    if (plan.checkout_url) {
      trackPlanChangeStarted({
        context: billing.billing_context || null,
        plan,
      })
      openBillingRoute(plan.checkout_url, "/api/billing/checkout")
      return
    }

    setStatusMessage(`${plan.name} is already selected.`)
  }

  const activePlanGroup =
    billing.plans.find((group) => group.range === activePlanRange) ||
    billing.plans[0]
  const planRows = activePlanGroup?.rows || []
  const hasPlanRows = planRows.length > 0
  const isEnterprisePlanRange = activePlanRange === "enterprise"
  const paymentMethod = billing.payments[0]

  return (
    <>
      <BillingReturnTracker
        context={billing.billing_context || null}
        disabled={loading}
        status="success"
      />
      <div className="grid gap-8 md:gap-12">
        <section className="grid gap-8">
        <h1 className="text-2xl font-semibold tracking-normal sm:text-3xl">
          Your Plan
        </h1>
        <Card className="w-full max-w-xl">
          <CardHeader>
            <CardTitle>
              {loading ? (
                <Skeleton className="h-7 w-48" />
              ) : (
                <>Current Plan: {billing.account.current_plan}</>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5">
            {loading ? (
              <>
                <UsageProgressSkeleton />
                <UsageProgressSkeleton />
                <Skeleton className="h-3 w-32" />
              </>
            ) : (
              <>
                {trialActive && (
                  <UsageProgressRow
                    label="Trial Usage"
                    percent={trialUsagePercent}
                    total={billing.account.trial_plan}
                    used={billing.account.trial_used}
                  />
                )}
                <UsageProgressRow
                  label="Plan Usage"
                  percent={planUsagePercent}
                  total={billing.account.credits_plan}
                  used={billing.account.credits_used}
                />
                {resetDate && resetDate !== "-" && (
                  <p className="text-xs text-muted-foreground">
                    Resets {resetDate}
                  </p>
                )}
                {showOverage && (
                  <UsageProgressRow
                    info="Overage credits are used after plan credits are exhausted."
                    label="Overage Usage"
                    percent={overageUsagePercent}
                    total={overageTotal}
                    used={billing.account.overage_used}
                  />
                )}
              </>
            )}
            <div className="grid gap-2 text-sm">
              <div className="flex items-center justify-between">
                <span>Monthly total:</span>
                {loading ? (
                  <Skeleton className="h-4 w-12" />
                ) : (
                  <span>{billing.account.total}</span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span>Next Invoice date:</span>
                {loading ? (
                  <Skeleton className="h-4 w-24" />
                ) : (
                  <span>{billing.account.invoice_date}</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6">
        <div className="grid gap-4 sm:flex sm:items-start sm:justify-between">
          <div className="grid gap-1">
            <h2 className="text-2xl font-semibold tracking-normal sm:text-3xl">
              Manage Plan
            </h2>
            <p className="text-muted-foreground">
              Each credit represents an email verification.
            </p>
          </div>
          <Button type="button" disabled={loading} onClick={openPortal}>
            Manage
          </Button>
        </div>

        {statusMessage && (
          <Alert>
            <AlertTitle>Billing</AlertTitle>
            <AlertDescription>{statusMessage}</AlertDescription>
          </Alert>
        )}

        <Tabs value={activePlanRange} onValueChange={setActivePlanRange}>
          <TabsList className="h-auto w-full flex-wrap justify-start sm:w-fit">
            {billing.plans.length ? (
              billing.plans.map((group) => (
                <TabsTrigger key={group.range} value={group.range}>
                  {group.label}
                </TabsTrigger>
              ))
            ) : (
              <>
                <TabsTrigger value="9999">{"<10k"}</TabsTrigger>
                <TabsTrigger value="10000-50000">10k to 50k</TabsTrigger>
                <TabsTrigger value="50000-1000000">50k to 1m</TabsTrigger>
                <TabsTrigger value="enterprise">Enterprise</TabsTrigger>
              </>
            )}
          </TabsList>
        </Tabs>

        <Card>
          <CardContent className="px-0 md:px-(--card-spacing)">
            <Table className="min-w-0 md:min-w-[34rem]">
              <TableHeader className="hidden md:table-header-group">
                <TableRow>
                  <TableHead>Credits</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Per Unit</TableHead>
                  <TableHead className="w-40">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <PlanTableSkeleton />
                ) : hasPlanRows ? (
                  planRows.map((plan) => (
                    <TableRow
                      key={plan.id}
                      className="grid gap-3 p-4 md:table-row md:p-0"
                    >
                      <TableCell className="flex items-center justify-between gap-4 p-0 md:table-cell md:p-2">
                        <span className="text-sm text-muted-foreground md:hidden">
                          Credits
                        </span>
                        <span className="font-medium md:font-normal">
                          {plan.display_credits || "-"}
                        </span>
                      </TableCell>
                      <TableCell className="flex items-center justify-between gap-4 p-0 md:table-cell md:p-2">
                        <span className="text-sm text-muted-foreground md:hidden">
                          Price
                        </span>
                        <span>{plan.display_price || "-"}</span>
                      </TableCell>
                      <TableCell className="flex items-center justify-between gap-4 p-0 md:table-cell md:p-2">
                        <span className="text-sm text-muted-foreground md:hidden">
                          Per Unit
                        </span>
                        <span>{plan.display_per_unit || "-"}</span>
                      </TableCell>
                      <TableCell className="p-0 md:table-cell md:p-2">
                        <Button
                          type="button"
                          className="w-full md:w-32"
                          disabled={plan.selected}
                          onClick={() => selectPlan(plan)}
                        >
                          {plan.action_label || "Upgrade"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : isEnterprisePlanRange ? (
                  <TableRow>
                    <TableCell colSpan={4} className="p-4 md:p-2">
                      <div className="grid gap-3 py-2 sm:flex sm:items-center sm:justify-between md:py-4">
                        <span>Need more than 1m credits?</span>
                        <a
                          href="mailto:support@listhygiene.com?subject=Enterprise%20billing"
                          className={buttonVariants({
                            className: "w-full sm:w-fit",
                          })}
                        >
                          Contact support
                        </a>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="p-4 md:p-2">
                      No billing plans are configured.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6">
        <div className="grid gap-3 sm:flex sm:items-center sm:justify-between">
          <h2 className="text-2xl font-semibold tracking-normal sm:text-3xl">
            Billing Contact
          </h2>
          <Button type="button" disabled={loading} onClick={openPortal}>
            Edit
          </Button>
        </div>
        <Card>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1">
              <p className="text-sm font-medium">Email</p>
              {loading ? (
                <Skeleton className="h-4 w-48" />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {billing.customer.email || email}
                </p>
              )}
            </div>
            <div className="grid gap-1">
              <p className="text-sm font-medium">Payment method</p>
              {loading ? (
                <Skeleton className="h-4 w-40" />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {paymentMethod
                    ? `${paymentMethod.brand} ending in ${paymentMethod.last4}`
                    : "No payment method"}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
        <Separator />
      </section>
      </div>
    </>
  )
}
