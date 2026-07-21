import {
  pushDataLayerEvent,
  pushDedupedDataLayerEvent,
  type DataLayerPayload,
} from "@/lib/analytics"

export type BillingTrackingContext = {
  customer_id?: string | null
  organization_id?: string | null
  workspace_id?: string | null
  account_source?: string | null
  billing_scope?: string | null
}

type BillingPlanTrackingData = {
  id: string
  name: string
  action_label?: string | null
  checkout_url?: string | null
  display_credits?: string | null
  display_price?: string | null
}

function baseBillingPayload(context?: BillingTrackingContext | null) {
  return {
    event_category: "billing",
    billing_scope: context?.billing_scope || null,
    organization_id: context?.organization_id || null,
    workspace_id: context?.workspace_id || null,
    customer_id: context?.customer_id || null,
    account_source: context?.account_source || null,
  } satisfies DataLayerPayload
}

function planChangeType(actionLabel?: string | null) {
  const normalized = actionLabel?.toLowerCase() || ""

  if (normalized.includes("upgrade")) {
    return "upgrade"
  }

  if (normalized.includes("downgrade")) {
    return "downgrade"
  }

  return "change"
}

function getPriceId(checkoutUrl?: string | null) {
  if (typeof window === "undefined" || !checkoutUrl) {
    return null
  }

  try {
    const url = new URL(checkoutUrl, window.location.origin)
    return url.searchParams.get("price_id")
  } catch {
    return null
  }
}

export function trackPlanChangeStarted({
  context,
  plan,
}: {
  context?: BillingTrackingContext | null
  plan: BillingPlanTrackingData
}) {
  pushDataLayerEvent("lh_plan_change_started", {
    ...baseBillingPayload(context),
    plan_change_type: planChangeType(plan.action_label),
    plan_id: plan.id,
    price_id: getPriceId(plan.checkout_url),
    plan_name: plan.name,
    credits: plan.display_credits || null,
    display_price: plan.display_price || null,
  })
}

export function trackBillingReturn({
  context,
  failureType,
  sessionId,
  status,
}: {
  context?: BillingTrackingContext | null
  failureType?: "cancelled" | "failed"
  sessionId: string
  status: "success" | "failed"
}) {
  const event =
    status === "success" ? "lh_payment_success" : "lh_payment_failed"

  pushDedupedDataLayerEvent(
    event,
    {
      ...baseBillingPayload(context),
      stripe_checkout_session_id: sessionId,
      ...(failureType ? { failure_type: failureType } : {}),
    },
    `${event}:${sessionId}`
  )
}
