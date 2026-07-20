"use client"

import { useEffect, useMemo, useState } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress, ProgressLabel } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

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
    trial_plan: number
    trial_used: number
    trial_percentage: string
    usage_percentage: string
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
    account_source?: string
  }
}

const emptyBilling: BillingResponse = {
  account: {
    current_plan: "None",
    credits_used: 0,
    credits_plan: 0,
    trial_plan: 0,
    trial_used: 0,
    trial_percentage: "0%",
    usage_percentage: "0%",
    total: "$0",
    invoice_date: "-",
  },
  plans: [],
  customer: {},
  payments: [],
  portal: "/api/billing/portal",
}

export function BillingContent({ email }: BillingContentProps) {
  const [billing, setBilling] = useState<BillingResponse>(emptyBilling)
  const [statusMessage, setStatusMessage] = useState("")
  const [loading, setLoading] = useState(true)
  const [activePlanRange, setActivePlanRange] = useState("9999")

  useEffect(() => {
    let cancelled = false

    async function loadBilling() {
      const response = await fetch("/api/billing")
      if (!response.ok) {
        setStatusMessage("Unable to load billing for this workspace.")
        setLoading(false)
        return
      }

      const data = (await response.json()) as BillingResponse
      if (!cancelled) {
        const selectedGroup = data.plans.find((group) => group.selected)
        setBilling(data)
        setActivePlanRange(selectedGroup?.range || data.plans[0]?.range || "9999")
        setLoading(false)
      }
    }

    loadBilling()
    return () => {
      cancelled = true
    }
  }, [])

  const usagePercent = useMemo(() => {
    const total =
      billing.account.credits_plan || billing.account.trial_plan || 0
    const used =
      billing.account.credits_plan > 0
        ? billing.account.credits_used
        : billing.account.trial_used

    if (!total) {
      return 0
    }

    return Math.round((used / total) * 10000) / 100
  }, [billing])

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
    <div className="grid gap-8 md:gap-12">
      <section className="grid gap-8">
        <h1 className="text-2xl font-semibold tracking-normal sm:text-3xl">
          Your Plan
        </h1>
        <Card className="w-full max-w-xl">
          <CardHeader>
            <CardTitle>
              Current Plan: {loading ? "Loading" : billing.account.current_plan}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Progress value={usagePercent}>
              <ProgressLabel>Usage ({usagePercent.toFixed(2)}%)</ProgressLabel>
              <span className="ml-auto text-sm text-muted-foreground">
                {billing.account.credits_used || billing.account.trial_used} of{" "}
                {billing.account.credits_plan || billing.account.trial_plan}
              </span>
            </Progress>
            <div className="grid gap-2 text-sm">
              <div className="flex items-center justify-between">
                <span>Monthly total:</span>
                <span>{billing.account.total}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Next Invoice date:</span>
                <span>{billing.account.invoice_date}</span>
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
          <Button type="button" onClick={openPortal}>
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
          <CardContent className="overflow-x-auto">
            <Table className="min-w-[34rem]">
              <TableHeader>
                <TableRow>
                  <TableHead>Credits</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Per Unit</TableHead>
                  <TableHead className="w-40">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hasPlanRows ? (
                  planRows.map((plan) => (
                    <TableRow key={plan.id}>
                      <TableCell>{plan.display_credits || "-"}</TableCell>
                      <TableCell>{plan.display_price || "-"}</TableCell>
                      <TableCell>{plan.display_per_unit || "-"}</TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          className="w-32"
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
                    <TableCell colSpan={4}>
                      <div className="grid gap-3 py-4 sm:flex sm:items-center sm:justify-between">
                        <span>Need more than 1m credits?</span>
                        <a
                          href="mailto:support@listhygiene.com?subject=Enterprise%20billing"
                          className={buttonVariants({ className: "w-fit" })}
                        >
                          Contact support
                        </a>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  <TableRow>
                    <TableCell colSpan={4}>
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
          <Button type="button" onClick={openPortal}>
            Edit
          </Button>
        </div>
        <Card>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1">
              <p className="text-sm font-medium">Email</p>
              <p className="text-sm text-muted-foreground">
                {billing.customer.email || email}
              </p>
            </div>
            <div className="grid gap-1">
              <p className="text-sm font-medium">Payment method</p>
              <p className="text-sm text-muted-foreground">
                {paymentMethod
                  ? `${paymentMethod.brand} ending in ${paymentMethod.last4}`
                  : "No payment method"}
              </p>
            </div>
          </CardContent>
        </Card>
        <Separator />
      </section>
    </div>
  )
}
