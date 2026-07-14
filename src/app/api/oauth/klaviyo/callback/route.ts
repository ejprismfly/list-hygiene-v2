import { getCurrentUser, getDataClient, resolveTenantContext } from "@/lib/api/tenant"
import {
  createStripeCustomer,
  getOrCreateStripeCustomerByEmail,
} from "@/lib/billing/stripe"
import {
  getBillingTenantFields,
  getStripeAccountForBilling,
  updateStripeAccountById,
} from "@/lib/billing/scope"

const scopes =
  "segments:read segments:write lists:read lists:write profiles:read profiles:write accounts:read subscriptions:write subscriptions:read"

type KlaviyoToken = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  scope?: string
}

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

async function getKlaviyoSegments(accessToken: string) {
  const response = await fetch("https://a.klaviyo.com/api/segments/?page[size]=100", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Revision: "2024-10-15",
    },
  })
  const json = await response.json()
  return Array.isArray(json.data) ? json.data : []
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

  const tenant = await resolveTenantContext(request)
  const tenantContext = tenant.ok && !tenant.context.legacyFallback ? tenant.context : null
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
  const segments = await getKlaviyoSegments(tokenJson.access_token)
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

  const { data: knownAccount } = await supabase
    .from("klaviyo_accounts_directory")
    .select("user_id, account_id")
    .eq("account_id", account.id)
    .maybeSingle()

  if (!knownAccount?.account_id) {
    await supabase.from("klaviyo_accounts_directory").insert({
      user_id: user.id,
      account_id: account.id,
    })

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
        await updateStripeAccountById(supabase, billingAccount, {
          trial_plan: 300,
          trial_remaining: 300,
          trial_used: 0,
          trial_redeemed_with: newKlaviyoAccount.id,
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

      await supabase.from("stripe_accounts").insert({
        user_id: user.id,
        customer_id: customer.id,
        ...getBillingTenantFields(billingScope),
        trial_plan: 300,
        trial_remaining: 300,
        trial_used: 0,
        trial_redeemed_with: newKlaviyoAccount.id,
      })
    }
  }

  await supabase
    .from("user_details")
    .update({ onboarded: true })
    .eq("user_id", user.id)

  return htmlMessage("connected", newKlaviyoAccount.id)
}
