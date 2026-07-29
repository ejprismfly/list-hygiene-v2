"use client"

import { useEffect } from "react"

import {
  trackPaidSubscription,
  trackBillingReturn,
  type BillingTrackingContext,
  type PaidSubscriptionTrackingData,
} from "@/lib/billing-tracking"

type BillingReturnTrackerProps = {
  context?: BillingTrackingContext | null
  disabled?: boolean
  status: "success" | "failed"
}

function billingContextFromResponse(data: unknown): BillingTrackingContext {
  const record = data && typeof data === "object" ? data : {}
  const source = record as Record<string, unknown>

  return {
    customer_id:
      typeof source.customer_id === "string" ? source.customer_id : null,
    organization_id:
      typeof source.organization_id === "string" ? source.organization_id : null,
    workspace_id:
      typeof source.workspace_id === "string" ? source.workspace_id : null,
    account_source:
      typeof source.account_source === "string" ? source.account_source : null,
    billing_scope:
      typeof source.billing_scope === "string" ? source.billing_scope : null,
  }
}

function paidSubscriptionFromResponse(
  data: unknown
): PaidSubscriptionTrackingData | null {
  const record = data && typeof data === "object" ? data : {}
  const source = record as { paid_subscription?: unknown }
  const paidSubscription =
    source.paid_subscription && typeof source.paid_subscription === "object"
      ? (source.paid_subscription as Record<string, unknown>)
      : null

  if (
    !paidSubscription ||
    typeof paidSubscription.transaction_id !== "string" ||
    typeof paidSubscription.transaction_value !== "number" ||
    typeof paidSubscription.transaction_currency !== "string"
  ) {
    return null
  }

  return {
    transaction_id: paidSubscription.transaction_id,
    transaction_value: paidSubscription.transaction_value,
    transaction_currency: paidSubscription.transaction_currency,
    customer_email:
      typeof paidSubscription.customer_email === "string"
        ? paidSubscription.customer_email
        : null,
  }
}

export function BillingReturnTracker({
  context,
  disabled = false,
  status,
}: BillingReturnTrackerProps) {
  useEffect(() => {
    if (disabled) {
      return
    }

    const params = new URLSearchParams(window.location.search)
    const sessionId = params.get("session_id")
    const isSuccessReturn = status === "success" && params.get("success") === "true"
    const isFailedReturn =
      status === "failed" &&
      (window.location.pathname === "/billing/failed" || params.has("cancel"))

    if (!sessionId || (!isSuccessReturn && !isFailedReturn)) {
      return
    }

    const checkoutSessionId = sessionId
    const failureType = params.get("cancel") === "true" ? "cancelled" : "failed"

    if (status === "failed" && context !== undefined) {
      trackBillingReturn({
        context,
        failureType,
        sessionId: checkoutSessionId,
        status,
      })
      return
    }

    let cancelled = false

    async function loadContextAndTrack() {
      try {
        const query =
          status === "success"
            ? `?${new URLSearchParams({ session_id: checkoutSessionId }).toString()}`
            : ""
        const response = await fetch(`/api/billing/customer${query}`, {
          cache: "no-store",
          credentials: "same-origin",
        })
        const data = response.ok ? await response.json() : null
        if (!cancelled) {
          const paidSubscription = paidSubscriptionFromResponse(data)
          if (status === "success" && !paidSubscription) {
            return
          }

          trackBillingReturn({
            context: billingContextFromResponse(data),
            failureType: status === "failed" ? failureType : undefined,
            sessionId: checkoutSessionId,
            status,
          })
          if (paidSubscription) {
            trackPaidSubscription(paidSubscription)
          }
        }
      } catch {
        if (!cancelled && status === "failed") {
          trackBillingReturn({
            failureType: status === "failed" ? failureType : undefined,
            sessionId: checkoutSessionId,
            status,
          })
        }
      }
    }

    loadContextAndTrack()

    return () => {
      cancelled = true
    }
  }, [context, disabled, status])

  return null
}
