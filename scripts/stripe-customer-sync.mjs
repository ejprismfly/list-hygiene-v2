#!/usr/bin/env node

const BASE_URL =
  (process.env.STRIPE_SYNC_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_HOST ||
    "http://localhost:3000").replace(/\/$/, "")
const SECRET = process.env.STRIPE_SYNC_SECRET || process.env.CRON_SECRET
const MODE =
  process.env.STRIPE_SYNC_MODE === "loop" ? "loop" : "once"
const POLL_INTERVAL_MS = Number.parseInt(
  process.env.STRIPE_SYNC_INTERVAL_MS || "900000",
  10
)

const body = {
  dry_run: process.env.STRIPE_SYNC_DRY_RUN === "1" || process.env.STRIPE_SYNC_DRY_RUN === "true",
  max_workspaces: Number.parseInt(
    process.env.STRIPE_SYNC_MAX_WORKSPACES || "200",
    10
  ),
  max_users_per_workspace: Number.parseInt(
    process.env.STRIPE_SYNC_MAX_USERS_PER_WORKSPACE || "200",
    10
  ),
  workspace_offset: Number.parseInt(
    process.env.STRIPE_SYNC_WORKSPACE_OFFSET || "0",
    10
  ),
}

if (process.env.STRIPE_SYNC_ORGANIZATION_ID) {
  body.organization_id = process.env.STRIPE_SYNC_ORGANIZATION_ID
}

if (process.env.STRIPE_SYNC_WORKSPACE_ID) {
  body.workspace_id = process.env.STRIPE_SYNC_WORKSPACE_ID
}

if (process.env.STRIPE_SYNC_WORKSPACE_IDS) {
  try {
    const raw = process.env.STRIPE_SYNC_WORKSPACE_IDS
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length) {
      body.workspace_ids = parsed
    }
  } catch {
    console.warn("Ignoring STRIPE_SYNC_WORKSPACE_IDS: invalid JSON array")
  }
}

if (!SECRET) {
  console.error("Missing STRIPE_SYNC_SECRET (or CRON_SECRET)")
  process.exit(1)
}

if (
  Number.isNaN(body.max_workspaces) ||
  Number.isNaN(body.max_users_per_workspace) ||
  Number.isNaN(body.workspace_offset)
) {
  console.error("Invalid numeric sync env values")
  process.exit(1)
}

async function runSync() {
  const payload = { ...body }

  const response = await fetch(`${BASE_URL}/api/cron/billing/stripe-accounts/sync`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-stripe-sync-secret": SECRET,
    },
    body: JSON.stringify(payload),
  })

  const responseBody = await response.text()
  const data = responseBody ? JSON.parse(responseBody) : null

  if (!response.ok) {
    const message = data?.error || response.statusText || "sync failed"
    throw new Error(message)
  }

  console.log(`stripe-sync ${new Date().toISOString()}:`, JSON.stringify(data))
  return data
}

async function runLoop() {
  while (true) {
    try {
      await runSync()
    } catch (error) {
      console.error("stripe-sync error:", error)
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }
}

runSync()
  .then(() => {
    if (MODE === "loop") {
      return runLoop()
    }
  })
  .catch((error) => {
    console.error("stripe-sync failed:", error)
    process.exit(1)
  })
