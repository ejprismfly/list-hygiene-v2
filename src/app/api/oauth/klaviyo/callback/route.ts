import {
  canCreateIntegrations,
  getCurrentUser,
  getDataClient,
  resolveTenantContext,
} from "@/lib/api/tenant"
import {
  createStripeCustomer,
  getOrCreateStripeCustomerByEmail,
} from "@/lib/billing/stripe"
import {
  getBillingTenantFields,
  getStripeAccountForBilling,
  updateStripeAccountById,
} from "@/lib/billing/scope"
import { fetchKlaviyoSegments } from "@/lib/klaviyo-segments"

const scopes =
  "segments:read segments:write lists:read lists:write profiles:read profiles:write accounts:read subscriptions:write subscriptions:read"
const TRIAL_CREDITS = 300

type KlaviyoToken = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  scope?: string
}

type SupabaseWriteError = {
  code?: string
  message?: string
  details?: string
}

type TrialReservation =
  | { eligible: true; redemptionId: string }
  | { eligible: false; reason: "platform_account_seen" | "user_redeemed" | "ledger_unavailable" }

function htmlMessage(status: "connected" | "blocked" | "failed", id?: string) {
  return new Response(
    `<html><body><script>window.opener?.postMessage({ status: "${status}"${
      id ? `, id: "${id}"` : ""
    } }, "*"); window.close();</script><p>Authentication complete. You can close this window.</p></body></html>`,
    { headers: { "Content-Type": "text/html" } }
  )
}

function getCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get("cookie")
  if (!cookieHeader) {
    return null
  }

  const cookie = cookieHeader
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${name}=`))

  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : null
}

async function getKlaviyoAccounts(accessToken: string) {
  const response = await fetch("https://a.klaviyo.com/api/accounts", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Revision: "2024-10-15",
    },
  })
  const json = await response.json()
  return Array.isArray(json.data) ? json.data : []
}

function isDuplicateError(error: SupabaseWriteError | null | undefined) {
  return error?.code === "23505"
}

function isMissingLedgerError(error: SupabaseWriteError | null | undefined) {
  return (
    error?.code === "42P01" ||
    error?.code === "42703" ||
    /trial_credit_redemptions/i.test(error?.message || "")
  )
}

async function hasUserRedeemedTrial({
  supabase,
  userId,
}: {
  supabase: Awaited<ReturnType<typeof getDataClient>>
  userId: string
}) {
  const { data: trialPlan, error: trialPlanError } = await supabase
    .from("stripe_accounts")
    .select("id")
    .eq("user_id", userId)
    .gt("trial_plan", 0)
    .limit(1)
    .maybeSingle()

  if (trialPlanError && !isMissingLedgerError(trialPlanError)) {
    console.error("Trial plan eligibility lookup error:", trialPlanError)
  }

  if (trialPlan?.id) {
    return true
  }

  const { data: trialRedemption, error: trialRedemptionError } = await supabase
    .from("stripe_accounts")
    .select("id")
    .eq("user_id", userId)
    .not("trial_redeemed_with", "is", null)
    .limit(1)
    .maybeSingle()

  if (trialRedemptionError && !isMissingLedgerError(trialRedemptionError)) {
    console.error(
      "Trial redemption eligibility lookup error:",
      trialRedemptionError
    )
  }

  if (trialRedemption?.id) {
    return true
  }

  const { data: trialHistory, error: trialHistoryError } = await supabase
    .from("credit_history")
    .select("id")
    .eq("user_id", userId)
    .or("source.eq.trial,reason.eq.trial,context.eq.trial")
    .limit(1)
    .maybeSingle()

  if (trialHistoryError && !isMissingLedgerError(trialHistoryError)) {
    console.error("Trial credit history eligibility lookup error:", trialHistoryError)
  }

  return Boolean(trialHistory?.id)
}

async function reserveTrialRedemption({
  accountId,
  klaviyoAccountId,
  organizationId,
  supabase,
  userId,
  workspaceId,
}: {
  accountId: string
  klaviyoAccountId: string
  organizationId: string | null
  supabase: Awaited<ReturnType<typeof getDataClient>>
  userId: string
  workspaceId: string | null
}): Promise<TrialReservation> {
  const { error: directoryError } = await supabase
    .from("klaviyo_accounts_directory")
    .insert({
      user_id: userId,
      account_id: accountId,
    })

  if (directoryError) {
    if (isDuplicateError(directoryError)) {
      return { eligible: false, reason: "platform_account_seen" }
    }

    console.error("Klaviyo account directory insert error:", directoryError)
    return { eligible: false, reason: "ledger_unavailable" }
  }

  if (await hasUserRedeemedTrial({ supabase, userId })) {
    return { eligible: false, reason: "user_redeemed" }
  }

  const { data, error } = await supabase
    .from("trial_credit_redemptions")
    .insert({
      user_id: userId,
      organization_id: organizationId,
      workspace_id: workspaceId,
      platform: "klaviyo",
      external_account_id: accountId,
      klaviyo_account_id: klaviyoAccountId,
      credits_granted: TRIAL_CREDITS,
      status: "reserved",
    })
    .select("id")
    .single()

  if (error || !data?.id) {
    if (isDuplicateError(error)) {
      return { eligible: false, reason: "user_redeemed" }
    }

    if (isMissingLedgerError(error)) {
      console.error("Trial redemption ledger is not available:", error)
      return { eligible: false, reason: "ledger_unavailable" }
    }

    console.error("Trial redemption reservation error:", error)
    return { eligible: false, reason: "ledger_unavailable" }
  }

  return { eligible: true, redemptionId: String(data.id) }
}

async function markTrialRedemption({
  redemptionId,
  status,
  stripeAccountId,
  supabase,
}: {
  redemptionId: string
  status: "granted" | "failed"
  stripeAccountId?: string | null
  supabase: Awaited<ReturnType<typeof getDataClient>>
}) {
  const { error } = await supabase
    .from("trial_credit_redemptions")
    .update({
      status,
      stripe_account_id: stripeAccountId || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", redemptionId)

  if (error) {
    console.error("Trial redemption status update error:", error)
  }
}

async function recordTrialCreditHistory({
  klaviyoAccountId,
  organizationId,
  supabase,
  userId,
  workspaceId,
}: {
  klaviyoAccountId: string
  organizationId: string | null
  supabase: Awaited<ReturnType<typeof getDataClient>>
  userId: string
  workspaceId: string | null
}) {
  const { error } = await supabase.from("credit_history").insert({
    user_id: userId,
    organization_id: organizationId,
    workspace_id: workspaceId,
    klaviyo_account_id: klaviyoAccountId,
    credits_delta: TRIAL_CREDITS,
    credits_remaining: TRIAL_CREDITS,
    change: TRIAL_CREDITS,
    remaining: TRIAL_CREDITS,
    reason: "trial",
    context: "klaviyo_oauth",
    source: "trial",
    description: "Trial credits granted",
  })

  if (error) {
    console.error("Trial credit history insert error:", error)
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const verifier = getCookie(request, "klaviyo_pkce_verifier")
  const clientId = process.env.NEXT_PUBLIC_KLAVIYO_CLIENT_ID
  const clientSecret = process.env.KLAVIYO_CLIENT_SECRET
  const appHost = process.env.NEXT_PUBLIC_APP_HOST || url.origin

  if (!code || !verifier || !clientId || !clientSecret) {
    return htmlMessage("failed")
  }

  const user = await getCurrentUser()
  if (!user?.email) {
    return htmlMessage("failed")
  }

  const tenant = await resolveTenantContext(request, { requireWorkspace: true })
  if (!tenant.ok) {
    return htmlMessage("failed")
  }

  const tenantContext = !tenant.context.legacyFallback ? tenant.context : null
  if (tenantContext && !canCreateIntegrations(tenantContext.role)) {
    return htmlMessage("failed")
  }
  const tenantFields =
    tenantContext?.organizationId
      ? {
          organization_id: tenantContext.organizationId,
          workspace_id: tenantContext.workspaceId,
          created_by_user_id: user.id,
          billing_user_id: user.id,
        }
      : {
          created_by_user_id: user.id,
          billing_user_id: user.id,
        }

  const authKey = Buffer.from(`${clientId}:${clientSecret}`).toString("base64")
  const tokenResponse = await fetch("https://a.klaviyo.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${authKey}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      redirect_uri: `${appHost}/api/oauth/klaviyo/callback`,
    }),
  })

  const tokenJson = (await tokenResponse.json()) as KlaviyoToken
  if (!tokenJson.access_token) {
    return htmlMessage("failed")
  }

  const accounts = await getKlaviyoAccounts(tokenJson.access_token)
  const segments = await fetchKlaviyoSegments(tokenJson.access_token)
  const [account] = accounts
  if (!account?.id) {
    return htmlMessage("failed")
  }

  const supabase = await getDataClient()
  const { data: existingActive } = await supabase
    .from("klaviyo_accounts")
    .select("id")
    .eq("active", true)
    .eq("account_details->0->>id", account.id)
    .limit(1)
    .maybeSingle()

  if (existingActive) {
    return htmlMessage("blocked")
  }

  const { data: newKlaviyoAccount, error } = await supabase
    .from("klaviyo_accounts")
    .insert({
      user_id: user.id,
      access_token: tokenJson.access_token,
      refresh_token: tokenJson.refresh_token,
      token_expires_in: tokenJson.expires_in
        ? new Date(Date.now() + Number(tokenJson.expires_in) * 1000).toISOString()
        : null,
      token_scope: tokenJson.scope || scopes,
      account_details: accounts,
      active: true,
      segments,
      selected_segment: null,
      connection_name:
        account.attributes?.contact_information?.organization_name || "Klaviyo",
      ...tenantFields,
    })
    .select("id")
    .single()

  if (error || !newKlaviyoAccount) {
    console.error("Klaviyo account insert error:", error)
    return htmlMessage("failed")
  }

  const trialReservation = await reserveTrialRedemption({
    accountId: account.id,
    klaviyoAccountId: newKlaviyoAccount.id,
    organizationId: tenantContext?.organizationId || null,
    supabase,
    userId: user.id,
    workspaceId: tenantContext?.workspaceId || null,
  })

  if (trialReservation.eligible) {
    const billingLookup = await getStripeAccountForBilling(
      supabase,
      user.id,
      tenantContext?.workspaceId || null,
      "id, user_id, customer_id, trial_plan, organization_id, workspace_id"
    )
    const billingAccount =
      tenantContext?.workspaceId && billingLookup.source !== "workspace"
        ? null
        : billingLookup.account

    if (billingAccount?.id) {
      if (!billingAccount.trial_plan) {
        const { error: trialUpdateError } = await updateStripeAccountById(
          supabase,
          billingAccount,
          {
            trial_plan: TRIAL_CREDITS,
            trial_remaining: TRIAL_CREDITS,
            trial_used: 0,
            trial_redeemed_with: newKlaviyoAccount.id,
          }
        )

        if (trialUpdateError) {
          console.error("Trial credit update error:", trialUpdateError)
          await markTrialRedemption({
            redemptionId: trialReservation.redemptionId,
            status: "failed",
            supabase,
          })
        } else {
          await markTrialRedemption({
            redemptionId: trialReservation.redemptionId,
            status: "granted",
            stripeAccountId: String(billingAccount.id),
            supabase,
          })
          await recordTrialCreditHistory({
            klaviyoAccountId: newKlaviyoAccount.id,
            organizationId: tenantContext?.organizationId || null,
            supabase,
            userId: user.id,
            workspaceId: tenantContext?.workspaceId || null,
          })
        }
      } else {
        await markTrialRedemption({
          redemptionId: trialReservation.redemptionId,
          status: "failed",
          stripeAccountId: String(billingAccount.id),
          supabase,
        })
      }
    } else if (process.env.STRIPE_SECRET_KEY) {
      const billingScope = {
        user,
        tenant: tenantContext,
        organizationId: tenantContext?.organizationId || null,
        workspaceId: tenantContext?.workspaceId || null,
        legacyFallback: !tenantContext,
      }
      const metadata = {
        user_id: user.id,
        user_email: user.email,
        billing_scope: tenantContext?.workspaceId ? "workspace" : "user",
        ...(tenantContext?.organizationId
          ? { organization_id: tenantContext.organizationId }
          : {}),
        ...(tenantContext?.workspaceId
          ? { workspace_id: tenantContext.workspaceId }
          : {}),
      }
      const customer = tenantContext?.workspaceId
        ? await createStripeCustomer(
            user.email,
            metadata,
            `customer_create_workspace_${tenantContext.workspaceId}`
          )
        : await getOrCreateStripeCustomerByEmail(user.email, metadata)

      const { data: createdBillingAccount, error: billingInsertError } =
        await supabase
          .from("stripe_accounts")
          .insert({
            user_id: user.id,
            customer_id: customer.id,
            ...getBillingTenantFields(billingScope),
            trial_plan: TRIAL_CREDITS,
            trial_remaining: TRIAL_CREDITS,
            trial_used: 0,
            trial_redeemed_with: newKlaviyoAccount.id,
          })
          .select("id")
          .single()

      if (billingInsertError) {
        console.error("Trial billing account insert error:", billingInsertError)
        await markTrialRedemption({
          redemptionId: trialReservation.redemptionId,
          status: "failed",
          supabase,
        })
      } else {
        await markTrialRedemption({
          redemptionId: trialReservation.redemptionId,
          status: "granted",
          stripeAccountId: createdBillingAccount?.id
            ? String(createdBillingAccount.id)
            : null,
          supabase,
        })
        await recordTrialCreditHistory({
          klaviyoAccountId: newKlaviyoAccount.id,
          organizationId: tenantContext?.organizationId || null,
          supabase,
          userId: user.id,
          workspaceId: tenantContext?.workspaceId || null,
        })
      }
    } else {
      await markTrialRedemption({
        redemptionId: trialReservation.redemptionId,
        status: "failed",
        supabase,
      })
    }
  }

  await supabase
    .from("user_details")
    .update({ onboarded: true })
    .eq("user_id", user.id)

  return htmlMessage("connected", newKlaviyoAccount.id)
}
