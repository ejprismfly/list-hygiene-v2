"use client"

import { useMemo, useState } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Progress,
  ProgressLabel,
} from "@/components/ui/progress"
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
import { billingDemoData } from "@/lib/demo-data"

type BillingContentProps = {
  email: string
}

export function BillingContent({ email }: BillingContentProps) {
  const [currentPlan, setCurrentPlan] = useState(billingDemoData.currentPlan)
  const [statusMessage, setStatusMessage] = useState("")
  const usagePercent = useMemo(
    () =>
      Math.round(
        (billingDemoData.creditsUsed / billingDemoData.creditsPlan) * 10000
      ) / 100,
    []
  )

  function selectPlan(credits: string) {
    setCurrentPlan(`${credits} Credits`)
    setStatusMessage(`${credits} credit plan selected for this workspace.`)
  }

  return (
    <div className="grid gap-8 md:gap-12">
      <section className="grid gap-8">
        <h1 className="text-2xl font-semibold tracking-normal sm:text-3xl">
          Your Plan
        </h1>
        <Card className="w-full max-w-xl">
          <CardHeader>
            <CardTitle>Current Plan: {currentPlan}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Progress value={usagePercent}>
              <ProgressLabel>Trial Usage ({usagePercent.toFixed(2)}%)</ProgressLabel>
              <span className="ml-auto text-sm text-muted-foreground">
                {billingDemoData.creditsUsed} of {billingDemoData.creditsPlan}
              </span>
            </Progress>
            <div className="grid gap-2 text-sm">
              <div className="flex items-center justify-between">
                <span>Monthly total:</span>
                <span>{billingDemoData.monthlyTotal}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Next Invoice date:</span>
                <span>{billingDemoData.nextInvoiceDate}</span>
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
          <Button
            type="button"
            onClick={() =>
              setStatusMessage(
                `Billing portal ready for ${billingDemoData.customerId}.`
              )
            }
          >
            Manage
          </Button>
        </div>

        {statusMessage && (
          <Alert>
            <AlertTitle>Billing updated</AlertTitle>
            <AlertDescription>{statusMessage}</AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="under-10k">
          <TabsList className="h-auto w-full flex-wrap justify-start sm:w-fit">
            <TabsTrigger value="under-10k">{"<10k"}</TabsTrigger>
            <TabsTrigger value="10k-50k">10k to 50k</TabsTrigger>
            <TabsTrigger value="50k-1m">50k to 1m</TabsTrigger>
            <TabsTrigger value="enterprise">Enterprise</TabsTrigger>
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
                {billingDemoData.plans.map((plan) => (
                  <TableRow key={plan.credits}>
                    <TableCell>{plan.credits}</TableCell>
                    <TableCell>{plan.price}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span>{plan.unit}</span>
                        {plan.savings && (
                          <Badge variant="secondary">{plan.savings}</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        className="w-32"
                        onClick={() => selectPlan(plan.credits)}
                      >
                        Upgrade
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
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
          <Button className="w-fit">Edit</Button>
        </div>
        <Card>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1">
              <p className="text-sm font-medium">Email</p>
              <p className="text-sm text-muted-foreground">{email}</p>
            </div>
            <div className="grid gap-1">
              <p className="text-sm font-medium">Payment method</p>
              <p className="text-sm text-muted-foreground">
                {billingDemoData.paymentMethod}
              </p>
            </div>
          </CardContent>
        </Card>
        <Separator />
      </section>
    </div>
  )
}
