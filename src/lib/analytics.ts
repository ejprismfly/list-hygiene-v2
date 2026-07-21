export type DataLayerValue = string | number | boolean | null
export type DataLayerPayload = Record<string, DataLayerValue | undefined>
export type DataLayerEvent = {
  event: string
  app: "list_hygiene_v2"
} & Record<string, DataLayerValue>

declare global {
  interface Window {
    dataLayer?: DataLayerEvent[]
  }
}

const BLOCKED_ANALYTICS_KEYS = new Set([
  "email",
  "user_email",
  "userEmail",
  "user_id",
  "userId",
])

function cleanPayload(payload: DataLayerPayload) {
  return Object.fromEntries(
    Object.entries(payload).filter(([key, value]) => {
      return value !== undefined && !BLOCKED_ANALYTICS_KEYS.has(key)
    })
  ) as Record<string, DataLayerValue>
}

export function pushDataLayerEvent(
  event: string,
  payload: DataLayerPayload = {}
) {
  if (typeof window === "undefined") {
    return
  }

  window.dataLayer = window.dataLayer || []
  window.dataLayer.push({
    event,
    app: "list_hygiene_v2",
    ...cleanPayload(payload),
  })
}

export function pushDedupedDataLayerEvent(
  event: string,
  payload: DataLayerPayload,
  dedupeKey: string
) {
  if (typeof window === "undefined") {
    return
  }

  const storageKey = `list_hygiene_analytics:${dedupeKey}`
  try {
    if (window.sessionStorage.getItem(storageKey)) {
      return
    }
    window.sessionStorage.setItem(storageKey, "1")
  } catch {
    // Tracking should never block the user flow.
  }

  pushDataLayerEvent(event, payload)
}
