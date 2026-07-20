import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import test from "node:test"
import assert from "node:assert/strict"

const root = process.cwd()

function read(path) {
  return readFileSync(join(root, path), "utf8")
}

function walk(dir) {
  return readdirSync(join(root, dir)).flatMap((entry) => {
    const path = join(dir, entry)
    const absolute = join(root, path)
    if (statSync(absolute).isDirectory()) {
      return walk(path)
    }
    return [relative(root, absolute)]
  })
}

test("Supabase CLI migration includes workspace-era v1 compatibility tables and columns", () => {
  const sql = read("supabase/migrations/20260713000000_v2_dev_bootstrap.sql")
  const requiredSnippets = [
    "create table if not exists public.organizations",
    "create table if not exists public.workspaces",
    "create table if not exists public.workspace_members",
    "create table if not exists public.organization_invitations",
    "create table if not exists public.klaviyo_accounts_directory",
    "account_details jsonb",
    "segments jsonb",
    "selected_segment jsonb",
    "fix_typos boolean",
    "full_mailbox_retries integer",
    "greylisted_retries integer",
    "unexpected_error_retries integer",
    "mail_server_temporary_error_retries integer",
    "token_expires_in timestamptz",
    "lh_category text",
    "tagged boolean",
    "merged boolean",
    "typo_fixed boolean",
    "attempts integer",
    "attempts_record jsonb",
    "did_you_mean text",
    "klaviyo_profile_id text",
    "leading_period_email text",
    "billing_scope text",
    "reset_date timestamptz",
    "overage_plan integer",
    "overage_remaining integer",
    "overage_used integer",
    "trial_plan integer",
    "trial_remaining integer",
    "trial_used integer",
    "trial_redeemed_with uuid",
    "payment_id text",
    "change integer",
    "remaining integer",
    "reason text",
    "context text",
    "email_report_tbl_workspace_unique",
    "emails_historical_performance_workspace_unique",
    "email_usage_monthly_workspace_unique",
    "email_usage_breakdown_monthly_workspace_unique",
    "klaviyo_accounts_directory_select_own",
  ]

  for (const snippet of requiredSnippets) {
    assert.match(sql, new RegExp(snippet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  }
})

test("documented bootstrap SQL matches the Supabase migration source", () => {
  assert.equal(
    read("docs/migration/sql/20260713_v2_dev_bootstrap.sql"),
    read("supabase/migrations/20260713000000_v2_dev_bootstrap.sql")
  )
})

test("workspace/billing/integration API surface exists in v2 app router", () => {
  const requiredRoutes = [
    "src/app/api/organizations/route.ts",
    "src/app/api/workspaces/route.ts",
    "src/app/api/organizations/members/route.ts",
    "src/app/api/organizations/invitations/route.ts",
    "src/app/api/organizations/invitations/accept/route.ts",
    "src/app/api/oauth/klaviyo/accounts/route.ts",
    "src/app/api/oauth/klaviyo/callback/route.ts",
    "src/app/api/oauth/klaviyo/disconnect/route.ts",
    "src/app/api/oauth/klaviyo/segments/route.ts",
    "src/app/api/user/dashboard/route.ts",
    "src/app/api/user/info/route.ts",
    "src/app/api/billing/route.ts",
    "src/app/api/billing/customer/route.ts",
    "src/app/api/billing/plans/route.ts",
    "src/app/api/billing/checkout/route.ts",
    "src/app/api/billing/portal/route.ts",
    "src/app/api/billing/payment/route.ts",
    "src/app/api/billing/webhook/route.ts",
  ]

  for (const route of requiredRoutes) {
    assert.ok(read(route).length > 0, `${route} should exist`)
  }
})

test("legacy route aliases redirect to native v2 pages", () => {
  const aliases = [
    ["src/app/(app)/integration-settings/page.tsx", "/settings"],
    ["src/app/(app)/billing-failed/page.tsx", "/billing/failed"],
    ["src/app/(app)/billing-successful/page.tsx", "/billing"],
  ]

  for (const [route, target] of aliases) {
    const content = read(route)
    assert.match(content, new RegExp(`redirect\\("${target.replace("/", "\\/")}"\\)`))
  }
})

test("side-by-side deployment docs capture live database constraints", () => {
  const env = read(".env.example")
  const guide = read("docs/deployment/v2-side-by-side.md")
  const readiness = read("docs/deployment/live-db-readiness.md")
  const demoSeed = read("docs/migration/sql/20260714_v2_efren_demo_seed.sql")

  for (const key of [
    "NEXT_PUBLIC_APP_HOST",
    "NEXT_PUBLIC_ORG_WORKSPACES_ENABLED",
    "ORG_WORKSPACES_ENABLED",
    "SUPABASE_SERVICE_ROLE_KEY",
    "DATABASE_URL",
    "NEXT_PUBLIC_KLAVIYO_CLIENT_ID",
    "KLAVIYO_CLIENT_SECRET",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
  ]) {
    assert.match(env, new RegExp(`^${key}=`, "m"))
  }

  assert.match(guide, /Deploy v2 on a separate hostname/)
  assert.match(guide, /same live Supabase database/)
  assert.match(guide, /Do not run `supabase\/migrations\/20260713000000_v2_dev_bootstrap.sql` against live production/)
  assert.match(guide, /configure Stripe webhook delivery to the v2 endpoint/)
  assert.match(readiness, /20260706_organizations_workspaces\.sql/)
  assert.match(readiness, /20260706_backfill_organizations_workspaces\.sql/)
  assert.match(readiness, /20260707_workspace_archiving\.sql/)
  assert.match(readiness, /20260709_workspace_billing\.sql/)
  assert.match(readiness, /20260709_workspace_report_tables\.sql/)
  assert.match(readiness, /Do not run the v2 greenfield bootstrap migration on live/)
  assert.match(readiness, /Stripe webhook endpoint/)
  assert.match(demoSeed, /Dev\/test seed only/)
  assert.match(demoSeed, /Do not run this against the current v1\/live database/)
})

test("side-by-side callbacks prefer the configured v2 host", () => {
  const authActions = read("src/app/(auth)/actions.ts")
  const klaviyoOAuth = read("src/lib/klaviyo-oauth.ts")
  const stripe = read("src/lib/billing/stripe.ts")

  assert.match(authActions, /NEXT_PUBLIC_APP_HOST\?\.replace\(\/\\\/\+\$\/, ""\)/)
  assert.match(authActions, /configuredHost \|\| headerList\.get\("origin"\)/)
  assert.match(klaviyoOAuth, /NEXT_PUBLIC_APP_HOST\?\.replace\(\/\\\/\+\$\/, ""\)/)
  assert.match(klaviyoOAuth, /\$\{appHost\}\/api\/oauth\/klaviyo\/callback/)
  assert.match(stripe, /NEXT_PUBLIC_APP_HOST \|\| "http:\/\/localhost:3000"/)
  assert.match(stripe, /replace\(\n    \/\\\/\+\$\/,\n    ""\n  \)/)
})

test("auth UI is password-only", () => {
  const authActions = read("src/app/(auth)/actions.ts")
  const loginForm = read("src/components/auth/login-form.tsx")
  const signupForm = read("src/components/auth/signup-form.tsx")
  const guide = read("docs/deployment/v2-side-by-side.md")
  const pkg = read("package.json")
  const impersonate = read("scripts/impersonate.mjs")

  assert.match(authActions, /signInWithPassword/)
  assert.match(authActions, /signUp/)
  assert.doesNotMatch(loginForm, /magicLinkAction|Send magic link|Magic link/)
  assert.doesNotMatch(loginForm, /SocialAuthButtons|Continue with Google|Continue with GitHub/)
  assert.doesNotMatch(signupForm, /SocialAuthButtons|Continue with Google|Continue with GitHub/)
  assert.doesNotMatch(guide, /magic link|social login|Google\/GitHub login/)
  assert.match(guide, /supabase-project-ref/)
  assert.match(guide, /auth\/v1\/callback/)
  assert.match(pkg, /"impersonate": "node scripts\/impersonate\.mjs"/)
  assert.match(impersonate, /auth\.admin\.generateLink/)
  assert.match(impersonate, /type: "magiclink"/)
  assert.match(impersonate, /\/auth\/callback\?next=/)
  assert.match(impersonate, /SUPABASE_SERVICE_ROLE_KEY/)
})

test("auth pages keep the v1 centered form composition", () => {
  const authLayout = read("src/app/(auth)/layout.tsx")
  const authShell = read("src/components/auth/auth-form-shell.tsx")
  const passwordInput = read("src/components/auth/password-input.tsx")
  const loginForm = read("src/components/auth/login-form.tsx")
  const signupForm = read("src/components/auth/signup-form.tsx")
  const forgotPasswordForm = read("src/components/auth/forgot-password-form.tsx")
  const resetPasswordForm = read("src/components/auth/reset-password-form.tsx")

  assert.match(authLayout, /<BrandLogo className="h-8" \/>/)
  assert.match(authShell, /<h1 className="text-4xl/)
  assert.match(authShell, /<Card className="w-full max-w-xs/)
  assert.doesNotMatch(authShell, /CardHeader|CardTitle|CardDescription/)
  assert.match(passwordInput, /Eye, EyeOff/)
  assert.match(loginForm, /title="Login"/)
  assert.match(loginForm, /Reset Password/)
  assert.match(loginForm, /Sign up now!/)
  assert.match(signupForm, /title="Sign Up"/)
  assert.match(signupForm, /Create an account and get started/)
  assert.match(signupForm, /Check Your Inbox!/)
  assert.match(signupForm, /Terms of Use/)
  assert.match(forgotPasswordForm, /title="Reset Password"/)
  assert.match(forgotPasswordForm, /Send Reset Instructions/)
  assert.match(forgotPasswordForm, /Back to Login/)
  assert.match(resetPasswordForm, /title="Change Password"/)
  assert.match(resetPasswordForm, /Update Password/)
})

test("page navigation avoids duplicate workspace bootstrap and remote auth checks", () => {
  const appSession = read("src/lib/app-session.ts")
  const proxy = read("src/lib/supabase/proxy.ts")
  const tenant = read("src/lib/api/tenant.ts")
  const workspaceClientData = read("src/lib/workspace-client-data.ts")
  const workspaceGate = read("src/components/app/workspace-required-gate.tsx")
  const workspaceSwitcher = read("src/components/app/workspace-switcher.tsx")

  assert.match(appSession, /auth\.getSession\(\)/)
  assert.doesNotMatch(appSession, /auth\.getUser\(\)/)
  assert.match(proxy, /auth\.getSession\(\)/)
  assert.doesNotMatch(proxy, /auth\.getUser\(\)/)
  assert.match(tenant, /auth\.getUser\(\)/)
  assert.match(workspaceClientData, /organizationCache\.pending/)
  assert.match(workspaceClientData, /workspaceCaches/)
  assert.match(workspaceGate, /loadOrganizations/)
  assert.match(workspaceGate, /loadWorkspaces/)
  assert.match(workspaceSwitcher, /loadOrganizations/)
  assert.match(workspaceSwitcher, /loadWorkspaces/)
  assert.doesNotMatch(workspaceGate, /fetch\("\/api\/organizations"/)
  assert.doesNotMatch(workspaceSwitcher, /fetch\("\/api\/organizations"/)
})

test("billing manage opens Stripe portal and plan actions open checkout", () => {
  const billingContent = read("src/components/billing/billing-content.tsx")
  const billingFailed = read("src/app/(app)/billing/failed/page.tsx")
  const stripe = read("src/lib/billing/stripe.ts")
  const billingRoute = read("src/app/api/billing/route.ts")
  const plansRoute = read("src/app/api/billing/plans/route.ts")
  const portalRoute = read("src/app/api/billing/portal/route.ts")
  const checkoutRoute = read("src/app/api/billing/checkout/route.ts")
  const customerRoute = read("src/app/api/billing/customer/route.ts")
  const billingCustomer = read("src/lib/billing/customer.ts")

  assert.match(billingContent, /openBillingRoute\(billing\.portal, "\/api\/billing\/portal"\)/)
  assert.match(billingContent, /openBillingRoute\(plan\.checkout_url, "\/api\/billing\/checkout"\)/)
  assert.match(billingContent, /activePlanRange/)
  assert.match(billingContent, /<Tabs value=\{activePlanRange\} onValueChange=\{setActivePlanRange\}>/)
  assert.match(billingContent, /const planRows = activePlanGroup\?\.rows \|\| \[\]/)
  assert.match(billingContent, /value="enterprise"[\s\S]*Enterprise/)
  assert.match(billingContent, /mailto:support@listhygiene\.com\?subject=Enterprise%20billing/)
  assert.match(stripe, /"app\.listhygiene\.com", "beta\.listhygiene\.com"/)
  assert.match(stripe, /export function appHost\(request\?: Request\)/)
  assert.match(stripe, /originFromHost\(headers\.get\("x-forwarded-host"\), forwardedProto\)/)
  assert.match(stripe, /originFromHost\(headers\.get\("host"\), forwardedProto\)/)
  assert.match(stripe, /isAllowedAppOrigin/)
  assert.match(billingRoute, /const billingHost = appHost\(request\)/)
  assert.match(billingRoute, /\$\{billingHost\}\/api\/billing\/checkout/)
  assert.match(billingRoute, /portal: `\$\{billingHost\}\/api\/billing\/portal`/)
  assert.match(plansRoute, /const billingHost = appHost\(request\)/)
  assert.match(plansRoute, /\$\{billingHost\}\/api\/billing\/checkout/)
  assert.match(read("src/app/api/billing/route.ts"), /range: "enterprise"/)
  assert.match(portalRoute, /ensureScopedStripeCustomer\(billing\.context\)/)
  assert.match(portalRoute, /stripe\.billingPortal\.sessions\.create/)
  assert.match(portalRoute, /return_url: `\$\{appHost\(request\)\}\/billing`/)
  assert.match(checkoutRoute, /ensureScopedStripeCustomer\(billing\.context\)/)
  assert.match(checkoutRoute, /stripe\.checkout\.sessions\.create/)
  assert.match(checkoutRoute, /const billingHost = appHost\(request\)/)
  assert.match(checkoutRoute, /success_url: `\$\{billingHost\}\/billing\?success=true&session_id=\{CHECKOUT_SESSION_ID\}`/)
  assert.match(checkoutRoute, /cancel_url: `\$\{billingHost\}\/billing\/failed\?cancel=true&session_id=\{CHECKOUT_SESSION_ID\}`/)
  assert.match(customerRoute, /ensureScopedStripeCustomer\(billing\.context\)/)
  assert.match(billingCustomer, /getScopedBillingAccount\(context\)/)
  assert.match(billingCustomer, /createStripeCustomer/)
  assert.match(billingCustomer, /getOrCreateStripeCustomerByEmail/)
  assert.match(billingFailed, /href="\/billing"[\s\S]*Retry Payment/)
  assert.doesNotMatch(billingFailed, /<Button>Retry Payment<\/Button>/)
})

test("billing plan card shows separate trial, plan, and overage usage states", () => {
  const billingContent = read("src/components/billing/billing-content.tsx")
  const billingRoute = read("src/app/api/billing/route.ts")
  const billingScope = read("src/lib/billing/scope.ts")

  assert.match(billingContent, /Trial Usage/)
  assert.match(billingContent, /Plan Usage/)
  assert.match(billingContent, /Overage Usage/)
  assert.match(billingContent, /trialRemaining > 0/)
  assert.match(billingContent, /!billing\.account\.trial_completed/)
  assert.match(billingContent, /overageUsed > 0/)
  assert.match(billingContent, /Resets \{resetDate\}/)
  assert.match(billingContent, /UsageProgressSkeleton/)
  assert.match(billingContent, /PlanTableSkeleton/)
  assert.match(billingContent, /loading \?\s*\(\s*<PlanTableSkeleton \/>/)
  assert.match(billingRoute, /trial_remaining: trialRemaining/)
  assert.match(billingRoute, /overage_remaining/)
  assert.match(billingRoute, /reset_date: resetDate/)
  assert.match(billingScope, /"trial_remaining"/)
  assert.match(billingScope, /"overage_remaining"/)
  assert.match(billingScope, /"reset_date"/)
})

test("billing webhook covers Stripe subscription and payment-method scenarios", () => {
  const route = read("src/app/api/billing/webhook/route.ts")
  const webhook = read("src/lib/billing/webhook.ts")
  const checkout = read("src/app/api/billing/checkout/route.ts")

  assert.match(route, /stripe\.webhooks\.constructEvent\(rawBody, signature, webhookSecret\)/)
  assert.match(route, /case "checkout\.session\.completed":/)
  assert.match(route, /case "invoice\.paid":/)
  assert.match(route, /case "invoice\.payment_failed":/)
  assert.match(route, /case "customer\.updated":/)
  assert.match(route, /case "payment_method\.attached":/)
  assert.match(route, /case "payment_method\.detached":/)
  assert.match(route, /case "customer\.subscription\.deleted":/)
  assert.match(route, /expand: \["default_payment_method", "latest_invoice\.payment_intent"\]/)
  assert.match(route, /subscription\.metadata\?\.stripe_account_id/)
  assert.match(route, /stripeAccount\.subscription_id !== subscriptionId/)
  assert.match(route, /stripe\.subscriptions\.cancel/)
  assert.match(route, /syncPaymentMethodsForCustomer/)
  assert.match(route, /previous_attributes/)
  assert.match(route, /cachePaymentMethods\(\{ stripe, stripeAccount, supabase \}\)/)
  assert.match(webhook, /subscription_create/)
  assert.match(webhook, /subscription_update/)
  assert.match(webhook, /subscription_cycle/)
  assert.match(webhook, /reason: "new"/)
  assert.match(webhook, /reason: "upgrade"/)
  assert.match(webhook, /reason: "reset"/)
  assert.match(webhook, /reason: "renew"/)
  assert.match(webhook, /buildPaymentMethodCacheRows/)
  assert.match(webhook, /toLegacyPaymentMethodCacheRows/)
  assert.match(webhook, /isMissingColumnError/)
  assert.match(checkout, /stripe_account_id/)
  assert.match(checkout, /organization_id/)
  assert.match(checkout, /workspace_id/)
})

test("billing failed page avoids hard-coded plan and price details", () => {
  const billingFailed = read("src/app/(app)/billing/failed/page.tsx")

  assert.match(billingFailed, /getCheckoutSummary/)
  assert.match(billingFailed, /checkout\.sessions\.retrieve\(sessionId\)/)
  assert.match(billingFailed, /checkout\.sessions\.listLineItems\(sessionId/)
  assert.doesNotMatch(billingFailed, /<span>1K<\/span>/)
  assert.doesNotMatch(billingFailed, /<span>\$30<\/span>/)
})

test("page metadata titles align with visible page headings", () => {
  assert.match(
    read("src/app/(auth)/login/page.tsx"),
    /title: "Login \| List Hygiene"/
  )
  assert.match(
    read("src/app/(auth)/signup/page.tsx"),
    /title: "Sign Up \| List Hygiene"/
  )
  assert.match(
    read("src/app/(auth)/forgot-password/page.tsx"),
    /title: "Forgot Password \| List Hygiene"/
  )
  assert.match(
    read("src/app/(auth)/reset-password/page.tsx"),
    /title: "Set New Password \| List Hygiene"/
  )
  assert.match(
    read("src/app/(app)/settings/page.tsx"),
    /title: "Integrations \| List Hygiene"/
  )
  assert.match(
    read("src/app/(app)/settings/klaviyo/page.tsx"),
    /title: "Configure Your Connection \| List Hygiene"/
  )
})

test("critical UI controls are wired to their own actions", () => {
  const billingContent = read("src/components/billing/billing-content.tsx")
  const settingsContent = read("src/components/settings/settings-content.tsx")
  const klaviyoOAuth = read("src/lib/klaviyo-oauth.ts")
  const settingsKlaviyoPage = read("src/app/(app)/settings/klaviyo/page.tsx")
  const configureConnection = read("src/components/settings/configure-connection-content.tsx")
  const workspaceSwitcher = read("src/components/app/workspace-switcher.tsx")
  const onboardingContent = read("src/components/app/onboarding-content.tsx")
  const loginForm = read("src/components/auth/login-form.tsx")
  const signupForm = read("src/components/auth/signup-form.tsx")
  const forgotPasswordForm = read("src/components/auth/forgot-password-form.tsx")
  const resetPasswordForm = read("src/components/auth/reset-password-form.tsx")
  const mobileMenu = read("src/components/app/mobile-menu.tsx")
  const logoutForm = read("src/components/app/logout-form.tsx")

  assert.match(billingContent, /onClick=\{openPortal\}/)
  assert.match(billingContent, /onClick=\{openPortal\}[\s\S]*Edit[\s\S]*<\/Button>/)
  assert.match(billingContent, /onClick=\{\(\) => selectPlan\(plan\)\}/)
  assert.match(settingsContent, /onClick=\{addKlaviyoConnection\}/)
  assert.match(settingsContent, /startKlaviyoOAuth/)
  assert.match(klaviyoOAuth, /popup=yes/)
  assert.match(klaviyoOAuth, /width=\$\{width\}/)
  assert.match(klaviyoOAuth, /height=\$\{height\}/)
  assert.match(klaviyoOAuth, /"klaviyo-oauth"/)
  assert.match(klaviyoOAuth, /popup\.location\.href = authUrl/)
  assert.match(klaviyoOAuth, /popup\.focus\(\)/)
  assert.match(klaviyoOAuth, /window\.location\.assign\(authUrl\)/)
  assert.match(settingsContent, /href=\{`\/settings\/klaviyo\?id=\$\{connection\.id\}`\}/)
  assert.match(settingsContent, /loadingConnections/)
  assert.match(settingsContent, /ConnectionsTableSkeleton/)
  assert.match(settingsContent, /<Skeleton className="h-4 w-20" \/>/)
  assert.doesNotMatch(settingsContent, /Loading connections\.\.\./)
  assert.match(settingsContent, /<div className="overflow-x-auto">\s*<Table className="min-w-\[38rem\]">/)
  assert.doesNotMatch(settingsContent, /<TableHead>Workspace<\/TableHead>/)
  assert.match(settingsContent, /Multiple connections coming soon\./)
  assert.match(settingsKlaviyoPage, /<AppShell active="settings" userEmail=\{user\.email\}>/)
  assert.doesNotMatch(configureConnection, /<main className="min-h-svh/)
  assert.match(configureConnection, /unit === "month" && option === "12"/)
  assert.match(configureConnection, /unit === "retry" && option === "3"/)
  assert.match(configureConnection, /\$\{label\} \(recommended\)/)
  assert.match(configureConnection, /const fullMailboxRetryOptions = \["0", "6", "12", "24", "36"\]/)
  assert.match(configureConnection, /const standardRetryOptions = \["0", "3", "6"\]/)
  assert.match(configureConnection, /return "Off"/)
  assert.match(configureConnection, /options: fullMailboxRetryOptions/)
  assert.match(configureConnection, /options: standardRetryOptions/)
  assert.match(configureConnection, /onClick=\{refreshSegments\}/)
  assert.match(configureConnection, /onClick=\{saveConnection\}/)
  assert.match(configureConnection, /onClick=\{removeConnection\}/)
  assert.match(configureConnection, /if \(!accountId \|\| removed\)/)
  assert.match(configureConnection, /accountLoading/)
  assert.match(configureConnection, /refreshing && <Loader2 className="size-4 animate-spin" \/>/)
  assert.match(configureConnection, /saving && <Loader2 className="size-4 animate-spin" \/>/)
  assert.match(configureConnection, /removing && <Loader2 className="size-4 animate-spin" \/>/)
  assert.match(configureConnection, /<Breadcrumb>/)
  assert.match(configureConnection, /<BreadcrumbLink href="\/settings">Settings<\/BreadcrumbLink>/)
  assert.match(configureConnection, /<BreadcrumbPage>Configure Your Connection<\/BreadcrumbPage>/)
  assert.match(configureConnection, /Combobox/)
  assert.match(configureConnection, /segment_search/)
  assert.match(configureConnection, /segment_limit: "30"/)
  assert.match(configureConnection, /itemToStringLabel=\{\(segment: SegmentOption\) => segment\.name\}/)
  assert.match(configureConnection, /Selected segment/)
  assert.match(configureConnection, /Search segments/)
  assert.match(onboardingContent, /"use client"/)
  assert.match(onboardingContent, /onClick=\{connectKlaviyo\}/)
  assert.match(onboardingContent, /startKlaviyoOAuth/)
  assert.match(onboardingContent, /window\.location\.assign\("\/settings\?connected=1"\)/)
  assert.doesNotMatch(onboardingContent, /href="\/settings\/klaviyo"/)
  assert.match(onboardingContent, /support@listhygiene\.com/)
  assert.doesNotMatch(onboardingContent, /support@prismfly\.com/)
  assert.match(workspaceSwitcher, /onValueChange=\{\(value\) => \{[\s\S]*switchWorkspace\(value\)/)
  assert.match(workspaceSwitcher, /onClick=\{saveWorkspaceName\}/)
  assert.match(workspaceSwitcher, /onClick=\{inviteMember\}/)
  assert.match(workspaceSwitcher, /setDeleteDialogOpen\(true\)/)
  assert.match(workspaceSwitcher, /onClick=\{createWorkspace\}/)
  assert.match(loginForm, /action=\{formAction\}/)
  assert.doesNotMatch(loginForm, /magicFormAction/)
  assert.match(signupForm, /action=\{formAction\}/)
  assert.match(forgotPasswordForm, /action=\{formAction\}/)
  assert.match(resetPasswordForm, /action=\{formAction\}/)
  assert.equal(
    existsSync(join(root, "src/components/auth/social-auth-buttons.tsx")),
    false
  )
  assert.match(mobileMenu, /onClick=\{\(\) => setOpen\(true\)\}/)
  assert.match(mobileMenu, /onClick=\{\(\) => setOpen\(false\)\}/)
  assert.match(logoutForm, /action=\{signOutAction\}/)
})

test("Klaviyo OAuth routes are workspace-scoped and maintain token lifecycle", () => {
  const callback = read("src/app/api/oauth/klaviyo/callback/route.ts")
  const accounts = read("src/app/api/oauth/klaviyo/accounts/route.ts")
  const segments = read("src/app/api/oauth/klaviyo/segments/route.ts")
  const segmentHelpers = read("src/lib/klaviyo-segments.ts")
  const disconnect = read("src/app/api/oauth/klaviyo/disconnect/route.ts")

  assert.match(accounts, /getSegmentName, type KlaviyoSegment/)
  assert.match(segments, /fetchKlaviyoSegments/)
  assert.match(segments, /sortAndMapSegments/)
  assert.match(segmentHelpers, /export function getSegmentName/)
  assert.match(segmentHelpers, /segment\?\.name\?\.trim\(\)/)
  assert.match(segmentHelpers, /"Unnamed segment"/)
  assert.match(segmentHelpers, /export async function fetchKlaviyoSegments/)
  assert.match(segmentHelpers, /accept: "application\/vnd\.api\+json"/)
  assert.match(segmentHelpers, /Revision: "2025-04-15"/)
  assert.match(segmentHelpers, /let url = "https:\/\/a\.klaviyo\.com\/api\/segments"/)
  assert.match(segmentHelpers, /while \(url && segments\.length < limit\)/)
  assert.match(segmentHelpers, /data\.links\?\.next/)
  assert.match(segmentHelpers, /Klaviyo segments request failed/)
  assert.match(callback, /klaviyo_pkce_verifier/)
  assert.match(callback, /window\.opener\?\.postMessage/)
  assert.match(callback, /workspace_id: tenantContext\.workspaceId/)
  assert.match(callback, /token_expires_in/)
  assert.match(callback, /fetchKlaviyoSegments\(tokenJson\.access_token\)/)
  assert.match(accounts, /applyAccountScope/)
  assert.match(accounts, /Only owners and admins can manage integrations/)
  assert.match(segments, /grant_type: "refresh_token"/)
  assert.match(segments, /access_token: tokenJson\.access_token/)
  assert.match(segments, /Object\.assign\(tokenUpdates, refreshedToken\.tokenUpdates\)/)
  assert.match(segments, /refreshKlaviyoAccessToken/)
  assert.match(segments, /error\.status === 401 \|\| error\.status === 403/)
  assert.match(segments, /Unable to refresh segments\./)
  assert.match(segments, /\.update\(\{ segments, \.\.\.tokenUpdates \}\)/)
  assert.match(disconnect, /account\.refresh_token \|\| account\.access_token/)
  assert.match(disconnect, /token_type_hint: account\.refresh_token \? "refresh_token" : "access_token"/)
  assert.match(disconnect, /\.update\(\{ active: false \}\)/)
})

test("dashboard remains the only component importing demo data", () => {
  const files = walk("src").filter((file) => /\.(ts|tsx)$/.test(file))
  const offenders = files.filter((file) => {
    if (file === "src/components/dashboard/dashboard-content.tsx") {
      return false
    }
    return read(file).includes("@/lib/demo-data")
  })

  assert.deepEqual(offenders, [])
})

test("dashboard non-demo mode is wired to workspace-scoped live API data", () => {
  const component = read("src/components/dashboard/dashboard-content.tsx")
  const route = read("src/app/api/user/dashboard/route.ts")
  const report = read("src/lib/dashboard/report.ts")

  assert.match(component, /fetch\("\/api\/user\/dashboard"/)
  assert.match(component, /showDummyData\s+\?\s+dashboardDemoData\s+:\s+liveData/)
  assert.match(route, /resolveTenantContext\(request, \{ requireWorkspace: true \}\)/)
  assert.match(route, /emails_historical_performance/)
  assert.match(route, /typo_fixed/)
  assert.match(report, /distribution: DASHBOARD_CATEGORY_KEYS\.map/)
  assert.match(report, /nextMilestoneRemaining/)
})

test("UI code stays on shadcn/local primitives and avoids extra UI kits", () => {
  const files = walk("src").filter((file) => /\.(ts|tsx)$/.test(file))
  const bannedImports = [
    "@mui/",
    "@chakra-ui/",
    "antd",
    "react-bootstrap",
    "semantic-ui-react",
    "@headlessui/",
    "@radix-ui/",
  ]
  const offenders = []

  for (const file of files) {
    const content = read(file)
    for (const bannedImport of bannedImports) {
      if (content.includes(`from "${bannedImport}`) || content.includes(`from '${bannedImport}`)) {
        offenders.push(`${file}: ${bannedImport}`)
      }
    }
  }

  assert.deepEqual(offenders, [])
})

test("custom CSS is limited to the shadcn global stylesheet", () => {
  const cssFiles = walk("src").filter((file) => file.endsWith(".css"))
  assert.deepEqual(cssFiles, ["src/app/globals.css"])
})

test("desktop and mobile shells share the same workspace management component", () => {
  const desktopShell = read("src/components/app/app-shell.tsx")
  const mobileShell = read("src/components/app/mobile-menu.tsx")

  assert.match(desktopShell, /<WorkspaceSwitcher/)
  assert.match(mobileShell, /<WorkspaceSwitcher/)
  assert.doesNotMatch(desktopShell, /demoWorkspaceContext|organizationName=|workspaces=/)
  assert.doesNotMatch(mobileShell, /demoWorkspaceContext|organizationName=|workspaces=/)
})

test("workspace delete action requires a confirmation dialog", () => {
  const switcher = read("src/components/app/workspace-switcher.tsx")

  assert.match(switcher, /deleteDialogOpen/)
  assert.match(switcher, /setDeleteDialogOpen\(true\)/)
  assert.match(switcher, /<DialogTitle>Delete workspace<\/DialogTitle>/)
  assert.match(switcher, /Delete workspace/)
  assert.match(switcher, /selectedWorkspace\.has_connected_account/)
})

test("workspace delete can leave the user in required-workspace flow", () => {
  const route = read("src/app/api/workspaces/route.ts")
  const switcher = read("src/components/app/workspace-switcher.tsx")
  const gate = read("src/components/app/workspace-required-gate.tsx")

  assert.doesNotMatch(route, /Default workspace cannot be archived\./)
  assert.doesNotMatch(route, /At least one active workspace is required\./)
  assert.match(
    route,
    /Disconnect or move connected Klaviyo accounts before archiving this workspace\./
  )
  assert.match(switcher, /persistSelection\(organizationId, null\)/)
  assert.match(gate, /A workspace is required before continuing\./)
})

test("workspace selector shows loading state without a field label", () => {
  const switcher = read("src/components/app/workspace-switcher.tsx")

  assert.match(switcher, /workspacesLoading/)
  assert.match(switcher, /<Loader2 className="size-4 animate-spin" \/>/)
  assert.match(switcher, /Loading/)
  assert.doesNotMatch(switcher, /Loading\.\.\./)
  assert.doesNotMatch(
    switcher,
    /<Label className="text-xs text-muted-foreground">Workspace<\/Label>/
  )
})

test("app shell mounts a global no-workspace creation gate", () => {
  const gate = read("src/components/app/workspace-required-gate.tsx")
  const shell = read("src/components/app/app-shell.tsx")

  assert.match(shell, /<WorkspaceRequiredGate \/>/)
  assert.match(gate, /<Dialog open=\{workspaceRequired\} onOpenChange=\{\(\) => undefined\}>/)
  assert.match(gate, /<DialogContent showCloseButton=\{false\}>/)
  assert.match(gate, /A workspace is required before continuing\./)
  assert.match(gate, /Create workspace/)
})

test("workspace management routes ignore stale selected-workspace cookies", () => {
  const route = read("src/app/api/workspaces/route.ts")
  const tenant = read("src/lib/api/tenant.ts")

  assert.match(tenant, /ignoreWorkspaceScope\?: boolean/)
  assert.match(route, /ignoreWorkspaceScope: true/)
})

test("logout clears client workspace selection before server sign-out", () => {
  const logoutForm = read("src/components/app/logout-form.tsx")
  const desktopShell = read("src/components/app/app-shell.tsx")
  const mobileShell = read("src/components/app/mobile-menu.tsx")
  const profileContent = read("src/components/profile/profile-content.tsx")

  assert.match(logoutForm, /"use client"/)
  assert.match(logoutForm, /clearWorkspaceClientState\(window\.localStorage\)/)
  assert.match(logoutForm, /invalidateWorkspaceClientData\(\)/)
  assert.match(logoutForm, /action=\{signOutAction\}/)
  assert.match(desktopShell, /<LogoutForm showIcon \/>/)
  assert.match(mobileShell, /<LogoutForm fullWidth showIcon \/>/)
  assert.match(profileContent, /<LogoutForm \/>/)
})

test("mobile menu keeps navigation and account actions inside the viewport overlay", () => {
  const mobileShell = read("src/components/app/mobile-menu.tsx")

  assert.match(mobileShell, /fixed inset-0/)
  assert.match(mobileShell, /h-dvh/)
  assert.match(mobileShell, /grid-rows-\[auto_minmax\(0,1fr\)_auto\]/)
  assert.match(mobileShell, /overflow-y-auto/)
})

test("floating dialogs and selects stack above the mobile menu overlay", () => {
  const mobileShell = read("src/components/app/mobile-menu.tsx")
  const dialog = read("src/components/ui/dialog.tsx")
  const select = read("src/components/ui/select.tsx")
  const workspaceSwitcher = read("src/components/app/workspace-switcher.tsx")

  assert.match(mobileShell, /z-\[60\]/)
  assert.match(workspaceSwitcher, /<Dialog[\s\S]*open=\{createDialogOpen\}/)
  assert.match(workspaceSwitcher, /<DialogContent className="max-h-\[calc\(100svh-2rem\)\] overflow-y-auto sm:max-w-3xl">/)
  assert.match(dialog, /z-\[1000\]/)
  assert.match(select, /z-\[1100\]/)
})
