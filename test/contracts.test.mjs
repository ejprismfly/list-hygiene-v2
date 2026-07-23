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
    "create table if not exists public.trial_credit_redemptions",
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
    "trial_credit_redemptions_user_once_idx",
    "trial_credit_redemptions_platform_account_once_idx",
    "add column if not exists active boolean not null default true",
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
    "trial_credit_redemptions_select_tenant",
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

test("documented trial redemption SQL matches the Supabase migration source", () => {
  assert.equal(
    read("docs/migration/sql/20260721_trial_credit_redemptions.sql"),
    read("supabase/migrations/20260721000000_trial_credit_redemptions.sql")
  )
})

test("workspace/billing/integration API surface exists in v2 app router", () => {
  const requiredRoutes = [
    "src/app/api/organizations/route.ts",
    "src/app/api/workspaces/route.ts",
    "src/app/api/organizations/members/route.ts",
    "src/app/api/organizations/invitations/route.ts",
    "src/app/api/organizations/invitations/accept/route.ts",
    "src/app/(auth)/invite/page.tsx",
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
  const inviteTemplate = read("docs/deployment/supabase-invite-template.html")
  const signupTemplate = read(
    "docs/deployment/supabase-signup-confirmation-template.html"
  )

  for (const key of [
    "NEXT_PUBLIC_APP_HOST",
    "NEXT_PUBLIC_ORG_WORKSPACES_ENABLED",
    "ORG_WORKSPACES_ENABLED",
    "SUPABASE_SERVICE_ROLE_KEY",
    "DATABASE_URL",
    "NEXT_PUBLIC_GTM_ID",
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
  assert.match(guide, /supabase-signup-confirmation-template\.html/)
  assert.match(guide, /\{\{ \.RedirectTo \}\}&token_hash=\{\{ \.TokenHash \}\}&type=signup/)
  assert.match(guide, /supabase-invite-template\.html/)
  assert.match(guide, /\{\{ \.RedirectTo \}\}&token_hash=\{\{ \.TokenHash \}\}&type=invite/)
  assert.match(guide, /https:\/\/beta\.listhygiene\.com\/auth\/invite-callback/)
  assert.match(guide, /default `\{\{ \.ConfirmationURL \}\}` invite template/)
  assert.match(guide, /Invite roles are intentionally limited to `admin` and `member`/)
  assert.match(readiness, /20260706_organizations_workspaces\.sql/)
  assert.match(readiness, /20260706_backfill_organizations_workspaces\.sql/)
  assert.match(readiness, /20260707_workspace_archiving\.sql/)
  assert.match(readiness, /20260709_workspace_billing\.sql/)
  assert.match(readiness, /20260721_trial_credit_redemptions\.sql/)
  assert.match(readiness, /20260709_workspace_report_tables\.sql/)
  assert.match(readiness, /trial_credit_redemptions\.user_id/)
  assert.match(readiness, /Do not run the v2 greenfield bootstrap migration on live/)
  assert.match(readiness, /Supabase Auth Confirm signup email template/)
  assert.match(readiness, /Supabase Auth Invite user email template/)
  assert.match(readiness, /\/auth\/invite-callback/)
  assert.match(readiness, /Stripe webhook endpoint/)
  assert.match(demoSeed, /Dev\/test seed only/)
  assert.match(demoSeed, /Do not run this against the current v1\/live database/)
  assert.match(signupTemplate, /\{\{ \.RedirectTo \}\}&token_hash=\{\{ \.TokenHash \}\}&type=signup/)
  assert.match(inviteTemplate, /\{\{ \.RedirectTo \}\}&token_hash=\{\{ \.TokenHash \}\}&type=invite/)
})

test("side-by-side callbacks prefer the configured v2 host", () => {
  const authActions = read("src/app/(auth)/actions.ts")
  const authCallback = read("src/app/auth/callback/route.ts")
  const invitationsRoute = read("src/app/api/organizations/invitations/route.ts")
  const klaviyoOAuth = read("src/lib/klaviyo-oauth.ts")
  const stripe = read("src/lib/billing/stripe.ts")

  assert.match(authActions, /NEXT_PUBLIC_APP_HOST\?\.replace\(\/\\\/\+\$\/, ""\)/)
  assert.match(authActions, /getOrigin\(configuredHost, headerList\.get\("origin"\), undefined/)
  assert.match(authActions, /cfVisitor: headerList\.get\("cf-visitor"\)/)
  assert.match(authActions, /forwardedHost: headerList\.get\("x-forwarded-host"\)/)
  assert.match(authCallback, /NEXT_PUBLIC_APP_HOST\?\.replace\(\/\\\/\+\$\/, ""\)/)
  assert.match(authCallback, /getOrigin\(configuredHost, request\.headers\.get\("origin"\), request\.url/)
  assert.match(authCallback, /cfVisitor: request\.headers\.get\("cf-visitor"\)/)
  assert.match(authCallback, /forwardedHost: request\.headers\.get\("x-forwarded-host"\)/)
  assert.match(authCallback, /return NextResponse\.redirect\(new URL\(path, getRequestOrigin\(request\)\)\)/)
  assert.match(authCallback, /function inviteFallbackCallbackPath\(nextPath: string\)/)
  assert.match(authCallback, /url\.pathname === "\/reset-password" && nestedNext\.startsWith\("\/invite"\)/)
  assert.match(authCallback, /\/auth\/invite-callback\?\$\{new URLSearchParams/)
  assert.doesNotMatch(authCallback, /new URL\([^,]+, request\.url\)/)
  assert.match(invitationsRoute, /cfVisitor: request\.headers\.get\("cf-visitor"\)/)
  assert.match(invitationsRoute, /forwardedHost: request\.headers\.get\("x-forwarded-host"\)/)
  assert.match(invitationsRoute, /forwardedProto: request\.headers\.get\("x-forwarded-proto"\)/)
  assert.match(invitationsRoute, /hostHeader: request\.headers\.get\("host"\)/)
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
  assert.match(authActions, /resendSignupConfirmationAction/)
  assert.match(authActions, /auth\.resend\(\{[\s\S]*type: "signup"/)
  assert.match(authActions, /emailRedirectTo: buildAuthCallbackUrl\(origin, nextPath, "signup"\)/)
  assert.match(authActions, /isAlreadyRegisteredAuthError/)
  assert.match(authActions, /data\.user && !data\.session && data\.user\.identities\?\.length === 0/)
  assert.match(authActions, /existingAccountState\(email, nextPath\)/)
  assert.doesNotMatch(loginForm, /magicLinkAction|Send magic link|Magic link/)
  assert.doesNotMatch(loginForm, /SocialAuthButtons|Continue with Google|Continue with GitHub/)
  assert.doesNotMatch(signupForm, /SocialAuthButtons|Continue with Google|Continue with GitHub/)
  assert.doesNotMatch(guide, /magic link|social login|Google\/GitHub login/)
  assert.match(guide, /password login, signup confirmation, forgot password, and logout/)
  assert.match(guide, /supabase-signup-confirmation-template\.html/)
  assert.match(guide, /supabase-invite-template\.html/)
  assert.match(pkg, /"impersonate": "node scripts\/impersonate\.mjs"/)
  assert.match(impersonate, /auth\.admin\.generateLink/)
  assert.match(impersonate, /type: "magiclink"/)
  assert.match(impersonate, /\/auth\/callback\?next=/)
  assert.match(impersonate, /SUPABASE_SERVICE_ROLE_KEY/)
})

test("direct signup enters workspace onboarding while invites keep invite flow", () => {
  const signupPage = read("src/app/(auth)/signup/page.tsx")
  const signupForm = read("src/components/auth/signup-form.tsx")
  const inviteAcceptance = read("src/components/auth/invite-acceptance.tsx")
  const onboardingContent = read("src/components/app/onboarding-content.tsx")
  const klaviyoOAuth = read("src/lib/klaviyo-oauth.ts")

  assert.match(signupPage, /safeNextPath\(next \|\| "\/onboarding"\)/)
  assert.match(signupForm, /nextPath = "\/onboarding"/)
  assert.match(inviteAcceptance, /href=\{`\/signup\?\$\{authQuery\}`\}/)
  assert.match(onboardingContent, /loadOrganizations/)
  assert.match(onboardingContent, /loadWorkspaces/)
  assert.match(onboardingContent, /setWorkspaces\(workspaces\)/)
  assert.match(onboardingContent, /setWorkspace\(nextWorkspace\)/)
  assert.match(onboardingContent, /value=\{workspace\?\.id \|\| ""\}/)
  assert.match(onboardingContent, /onValueChange=\{selectWorkspace\}/)
  assert.match(onboardingContent, /disabled=\{connecting \|\| workspaces\.length <= 1\}/)
  assert.match(onboardingContent, /is selected as your default workspace\./)
  assert.match(onboardingContent, /canUseOnboarding\(nextOrganization\.role\)/)
  assert.match(onboardingContent, /window\.location\.assign\("\/dashboard"\)/)
  assert.match(onboardingContent, /Select a workspace to continue\./)
  assert.match(onboardingContent, /persistSelection\(organization\.id, workspace\.id\)/)
  assert.doesNotMatch(onboardingContent, /@\/components\/ui\/input/)
  assert.doesNotMatch(onboardingContent, /method: workspace \? "PATCH" : "POST"/)
  assert.doesNotMatch(onboardingContent, /Workspace name is required\./)
  assert.match(onboardingContent, /openKlaviyoOAuthPopup/)
  assert.match(onboardingContent, /startKlaviyoOAuth\(\{[\s\S]*popup/)
  assert.match(klaviyoOAuth, /export function openKlaviyoOAuthPopup/)
  assert.match(klaviyoOAuth, /popup: existingPopup/)
})

test("team invitations are usable by existing and new users", () => {
  const workspaceSwitcher = read("src/components/app/workspace-switcher.tsx")
  const memberRoute = read("src/app/api/organizations/members/route.ts")
  const invitationsRoute = read("src/app/api/organizations/invitations/route.ts")
  const acceptRoute = read("src/app/api/organizations/invitations/accept/route.ts")
  const teamMembers = read("src/lib/api/team-members.ts")
  const inviteAuthCallbackPage = read("src/app/(auth)/auth/invite-callback/page.tsx")
  const inviteAuthCallback = read("src/components/auth/invite-auth-callback.tsx")
  const invitePage = read("src/app/(auth)/invite/page.tsx")
  const inviteAcceptance = read("src/components/auth/invite-acceptance.tsx")
  const loginForm = read("src/components/auth/login-form.tsx")
  const resetPasswordPage = read("src/app/(auth)/reset-password/page.tsx")
  const resetPasswordForm = read("src/components/auth/reset-password-form.tsx")
  const signupForm = read("src/components/auth/signup-form.tsx")
  const authActions = read("src/app/(auth)/actions.ts")
  const authCallback = read("src/app/auth/callback/route.ts")
  const urlSafety = read("src/lib/url-safety.cjs")

  assert.match(workspaceSwitcher, /fetch\("\/api\/organizations\/members"/)
  assert.match(workspaceSwitcher, /memberResponse\.status !== 404/)
  assert.match(workspaceSwitcher, /fetch\("\/api\/organizations\/invitations"/)
  assert.match(workspaceSwitcher, /data\.invite_url/)
  assert.match(workspaceSwitcher, /copyInviteLink/)
  assert.match(workspaceSwitcher, /openRemoveMemberDialog/)
  assert.match(workspaceSwitcher, /<DialogTitle>Remove member<\/DialogTitle>/)
  assert.match(workspaceSwitcher, /onClick=\{removeMember\}/)
  assert.match(workspaceSwitcher, /openCancelInvitationDialog/)
  assert.match(workspaceSwitcher, /<DialogTitle>Cancel invite<\/DialogTitle>/)
  assert.match(workspaceSwitcher, /onClick=\{cancelInvitation\}/)
  assert.match(workspaceSwitcher, /resendInvitation/)
  assert.match(workspaceSwitcher, /action: "resend"/)
  assert.match(workspaceSwitcher, /aria-label="Resend invite"/)
  assert.match(workspaceSwitcher, /resendingInvitationId === row\.id/)
  assert.match(workspaceSwitcher, /data\.member/)
  assert.match(workspaceSwitcher, /email_delivery\?: "existing_user" \| "manual_link" \| "supabase_auth"/)
  assert.match(workspaceSwitcher, /data\.email_delivery === "manual_link"/)
  assert.match(workspaceSwitcher, /memberRemovalBlockedReason/)
  assert.match(workspaceSwitcher, /Admins have organization-wide access/)
  assert.match(workspaceSwitcher, /workspace_id: selectedId/)
  assert.match(workspaceSwitcher, /scope: "workspace"/)
  assert.match(workspaceSwitcher, /organization_removed/)
  assert.match(workspaceSwitcher, /No team access for this workspace\./)
  assert.match(workspaceSwitcher, /status === "pending"/)
  assert.match(memberRoute, /findTeamMemberProfileByEmail/)
  assert.match(memberRoute, /addExistingUserToTeam/)
  assert.match(memberRoute, /resolveTeamWorkspaceIds/)
  assert.match(memberRoute, /Owners cannot be changed\./)
  assert.match(memberRoute, /No updates provided\./)
  assert.match(memberRoute, /workspace_id/)
  assert.match(memberRoute, /organization_removed/)
  assert.match(memberRoute, /Admins have organization-wide access/)
  assert.match(teamMembers, /export async function addExistingUserToTeam/)
  assert.match(teamMembers, /preserveHighestRole/)
  assert.match(teamMembers, /roleRank/)
  assert.match(teamMembers, /export async function resolveTeamWorkspaceIds/)
  assert.match(teamMembers, /Members must have at least one workspace\./)
  assert.match(teamMembers, /role === "owner" \|\| role === "admin"/)
  assert.match(teamMembers, /organization_invitations/)
  assert.match(teamMembers, /status: "accepted"/)
  assert.match(invitationsRoute, /createAdminClient/)
  assert.match(invitationsRoute, /findTeamMemberProfileByEmail/)
  assert.match(invitationsRoute, /resolveTeamWorkspaceIds/)
  assert.match(invitationsRoute, /inviteResendCooldownMs/)
  assert.match(invitationsRoute, /isInviteSendCoolingDown/)
  assert.match(invitationsRoute, /email_delivery: "existing_user"/)
  assert.match(invitationsRoute, /inviteUserByEmail/)
  assert.match(invitationsRoute, /action === "resend"/)
  assert.match(invitationsRoute, /resent: delivery\.emailDelivery === "supabase_auth"/)
  assert.match(invitationsRoute, /emailDelivery: "manual_link"/)
  assert.match(invitationsRoute, /buildInviteAuthRedirectUrl/)
  assert.match(invitationsRoute, /emailDelivery: "supabase_auth"/)
  assert.match(invitationsRoute, /buildInviteUrl/)
  assert.match(invitationsRoute, /invite_url/)
  assert.match(invitationsRoute, /existingInvitation/)
  assert.match(invitationsRoute, /token_hash: hashToken\(token\)/)
  assert.match(acceptRoute, /role = invitation\.role === "admin" \? "admin" : "member"/)
  assert.match(acceptRoute, /addExistingUserToTeam/)
  assert.match(urlSafety, /new URL\("\/reset-password", origin\)/)
  assert.match(urlSafety, /new URL\("\/auth\/invite-callback", origin\)/)
  assert.match(inviteAuthCallbackPage, /title: "Verify Invite \| List Hygiene"/)
  assert.match(inviteAuthCallbackPage, /<InviteAuthCallback \/>/)
  assert.match(inviteAuthCallback, /supabase\.auth\.setSession/)
  assert.match(inviteAuthCallback, /supabase\.auth\.verifyOtp/)
  assert.match(inviteAuthCallback, /supabase\.auth\.exchangeCodeForSession/)
  assert.match(inviteAuthCallback, /safeNextPath\(search\.get\("next"\) \|\| hash\.get\("next"\)\)/)
  assert.match(inviteAuthCallback, /window\.location\.replace\(nextPath\)/)
  assert.match(acceptRoute, /Invitation has already been accepted/)
  assert.match(acceptRoute, /accepted_by_user_id === user\.id/)
  assert.match(invitePage, /title: "Accept Invite \| List Hygiene"/)
  assert.match(invitePage, /loginAgainParam === "1" \|\| loginAgainParam === "true"/)
  assert.match(invitePage, /loginAgainAfterAccept=\{loginAgainAfterAccept\}/)
  assert.match(inviteAcceptance, /\/api\/organizations\/invitations\/accept/)
  assert.match(inviteAcceptance, /writeWorkspaceSelection/)
  assert.match(inviteAcceptance, /clearWorkspaceClientState/)
  assert.match(inviteAcceptance, /auth\.signOut\(\)/)
  assert.match(inviteAcceptance, /loginAgainAfterAccept/)
  assert.match(inviteAcceptance, /Log in again to open the workspace\./)
  assert.match(inviteAcceptance, /Log in again/)
  assert.match(inviteAcceptance, /WORKSPACE_ORGANIZATION_COOKIE/)
  assert.match(inviteAcceptance, /href=\{`\/login\?\$\{authQuery\}`\}/)
  assert.match(inviteAcceptance, /href=\{`\/signup\?\$\{authQuery\}`\}/)
  assert.match(loginForm, /<input type="hidden" name="next" value=\{nextPath\} \/>/)
  assert.match(signupForm, /<input type="hidden" name="next" value=\{nextPath\} \/>/)
  assert.match(resetPasswordPage, /safeNextPath\(nextParam\)/)
  assert.match(resetPasswordPage, /<ResetPasswordForm nextPath=\{nextPath\} \/>/)
  assert.match(resetPasswordForm, /nextPath = "\/dashboard"/)
  assert.match(resetPasswordForm, /nextPath\.startsWith\("\/invite"\)/)
  assert.match(resetPasswordForm, /name="next" value=\{nextPath\}/)
  assert.match(resetPasswordForm, /Create a password before joining the workspace\./)
  assert.match(authActions, /safeNextPath/)
  assert.match(authActions, /addInviteLoginAgainFlag/)
  assert.match(authActions, /url\.searchParams\.set\("login_again", "1"\)/)
  assert.match(authActions, /redirect\(addInviteLoginAgainFlag\(nextPath\)\)/)
  assert.match(authActions, /buildAuthCallbackUrl\(origin, nextPath\)/)
  assert.match(authCallback, /safeNextPath/)
  assert.match(authCallback, /verifyOtp/)
  assert.match(authCallback, /token_hash/)
  assert.match(authCallback, /isEmailOtpType/)
})

test("resending a pending invitation never accepts it", () => {
  const invitationsRoute = read("src/app/api/organizations/invitations/route.ts")
  const workspaceSwitcher = read("src/components/app/workspace-switcher.tsx")
  const resendStart = invitationsRoute.indexOf('if (action === "resend")')
  const resendEnd = invitationsRoute.indexOf('if (status !== "revoked")')
  const resendBlock = invitationsRoute.slice(resendStart, resendEnd)
  const uiResendStart = workspaceSwitcher.indexOf(
    "async function resendInvitation"
  )
  const uiResendEnd = workspaceSwitcher.indexOf("async function updateMemberRole")
  const uiResendBlock = workspaceSwitcher.slice(uiResendStart, uiResendEnd)

  assert.notEqual(resendStart, -1)
  assert.notEqual(resendEnd, -1)
  assert.notEqual(uiResendStart, -1)
  assert.notEqual(uiResendEnd, -1)
  assert.match(resendBlock, /token_hash: hashToken\(token\)/)
  assert.match(resendBlock, /email_delivery: delivery\.emailDelivery/)
  assert.match(resendBlock, /resent: delivery\.emailDelivery === "supabase_auth"/)
  assert.doesNotMatch(resendBlock, /addExistingUserToTeam/)
  assert.doesNotMatch(resendBlock, /acceptedInvitationId/)
  assert.doesNotMatch(resendBlock, /status: "accepted"/)
  assert.doesNotMatch(resendBlock, /member: /)
  assert.doesNotMatch(uiResendBlock, /data\.member[\s\S]*setInvitations/)
  assert.match(uiResendBlock, /status: "pending"/)
  assert.match(uiResendBlock, /invite link refreshed\. Copy the link/)
})

test("auth pages follow the shadcn login-02 two-column composition", () => {
  const authLayout = read("src/app/(auth)/layout.tsx")
  const authVisual = read("src/components/auth/auth-visual.tsx")
  const authShell = read("src/components/auth/auth-form-shell.tsx")
  const passwordInput = read("src/components/auth/password-input.tsx")
  const loginForm = read("src/components/auth/login-form.tsx")
  const signupForm = read("src/components/auth/signup-form.tsx")
  const forgotPasswordForm = read("src/components/auth/forgot-password-form.tsx")
  const resetPasswordForm = read("src/components/auth/reset-password-form.tsx")

  assert.match(authLayout, /grid min-h-svh bg-background lg:grid-cols-2/)
  assert.match(authLayout, /<BrandLogo className="h-7" \/>/)
  assert.match(authLayout, /href="\/login"/)
  assert.match(authLayout, /<AuthVisual \/>/)
  assert.equal(existsSync(join(root, "public/login-graphic.jpg")), true)
  assert.match(authVisual, /import loginGraphic from "\.\.\/\.\.\/\.\.\/public\/login-graphic\.jpg"/)
  assert.match(authVisual, /placeholder="blur"/)
  assert.match(authVisual, /quality=\{85\}/)
  assert.match(authVisual, /sizes="\(min-width: 1024px\) 50vw, 0vw"/)
  assert.match(authVisual, /onLoad=\{\(\) => setLoaded\(true\)\}/)
  assert.match(authVisual, /transition-all duration-700 ease-out/)
  assert.match(authVisual, /<Skeleton className="absolute inset-0 z-10 h-full w-full rounded-none" \/>/)
  assert.match(authShell, /CardHeader/)
  assert.match(authShell, /CardTitle className="text-xl"/)
  assert.match(authShell, /CardDescription/)
  assert.match(authShell, /<Card className="w-full">/)
  assert.match(passwordInput, /Eye, EyeOff/)
  assert.match(loginForm, /title="Login"/)
  assert.match(loginForm, /Reset Password/)
  assert.match(loginForm, /className="w-full"/)
  assert.match(loginForm, /Sign up now!/)
  assert.match(signupForm, /title="Sign Up"/)
  assert.match(signupForm, /Create an account and get started/)
  assert.match(signupForm, /Check Your Inbox!/)
  assert.match(signupForm, /Resend confirmation email/)
  assert.match(signupForm, /resendSignupConfirmationAction/)
  assert.match(signupForm, /Reset password/)
  assert.match(signupForm, /Terms of Use/)
  assert.match(signupForm, /className="w-full"/)
  assert.match(forgotPasswordForm, /title="Reset Password"/)
  assert.match(forgotPasswordForm, /Send Reset Instructions/)
  assert.match(forgotPasswordForm, /Back to Login/)
  assert.match(forgotPasswordForm, /className="w-full"/)
  assert.match(resetPasswordForm, /"Set Password" : "Change Password"/)
  assert.match(resetPasswordForm, /Update Password/)
  assert.match(resetPasswordForm, /className="w-full"/)
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
  const paymentRoute = read("src/app/api/billing/payment/route.ts")
  const billingCustomer = read("src/lib/billing/customer.ts")

  assert.match(billingContent, /openBillingRoute\(billing\.portal, "\/api\/billing\/portal"\)/)
  assert.match(billingContent, /openBillingRoute\(plan\.checkout_url, "\/api\/billing\/checkout"\)/)
  assert.match(billingContent, /activePlanRange/)
  assert.match(billingContent, /<Tabs value=\{activePlanRange\} onValueChange=\{setActivePlanRange\}>/)
  assert.match(billingContent, /const planRows = activePlanGroup\?\.rows \|\| \[\]/)
  assert.match(billingContent, /<Table className="min-w-0 md:min-w-\[34rem\]">/)
  assert.match(billingContent, /<TableHeader className="hidden md:table-header-group">/)
  assert.match(billingContent, /className="grid gap-3 p-4 md:table-row md:p-0"/)
  assert.match(billingContent, /className="w-full md:w-32"/)
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
  assert.match(billingRoute, /billing_scope: billing\.context\.workspaceId \? "workspace" : "user"/)
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
  assert.match(customerRoute, /billing_scope: billing\.context\.workspaceId \? "workspace" : "user"/)
  assert.match(billingCustomer, /getScopedBillingAccount\(context\)/)
  assert.match(billingCustomer, /createStripeCustomer/)
  assert.match(billingCustomer, /getOrCreateStripeCustomerByEmail/)
  assert.match(paymentRoute, /\^pm_\[A-Za-z0-9_\]\+\$/)
  assert.match(paymentRoute, /stripe\.paymentMethods\.retrieve\(paymentId\)/)
  assert.match(paymentRoute, /paymentMethodCustomerId !== customerId/)
  assert.match(billingFailed, /href="\/billing"[\s\S]*Retry Payment/)
  assert.doesNotMatch(billingFailed, /<Button>Retry Payment<\/Button>/)
})

test("browser billing GTM tracking uses dataLayer without PII", () => {
  const env = read(".env.example")
  const layout = read("src/app/layout.tsx")
  const gtm = read("src/components/app/google-tag-manager.tsx")
  const analytics = read("src/lib/analytics.ts")
  const billingTracking = read("src/lib/billing-tracking.ts")
  const billingContent = read("src/components/billing/billing-content.tsx")
  const returnTracker = read("src/components/billing/billing-return-tracker.tsx")
  const billingFailed = read("src/app/(app)/billing/failed/page.tsx")

  assert.match(env, /^NEXT_PUBLIC_GTM_ID=/m)
  assert.match(layout, /import \{ GoogleTagManager \}/)
  assert.match(layout, /<GoogleTagManager \/>/)
  assert.match(gtm, /NEXT_PUBLIC_GTM_ID/)
  assert.match(gtm, /googletagmanager\.com\/gtm\.js/)
  assert.match(gtm, /dataLayer/)
  assert.match(analytics, /pushDataLayerEvent/)
  assert.match(analytics, /pushDedupedDataLayerEvent/)
  assert.match(analytics, /"email"/)
  assert.match(analytics, /"user_id"/)
  assert.match(billingTracking, /lh_plan_change_started/)
  assert.match(billingTracking, /lh_payment_success/)
  assert.match(billingTracking, /lh_payment_failed/)
  assert.match(billingTracking, /event_category: "billing"/)
  assert.match(billingTracking, /billing_scope/)
  assert.match(billingTracking, /stripe_checkout_session_id/)
  assert.match(billingContent, /trackPlanChangeStarted/)
  assert.match(billingContent, /<BillingReturnTracker[\s\S]*status="success"/)
  assert.match(returnTracker, /\/api\/billing\/customer/)
  assert.match(returnTracker, /session_id/)
  assert.match(returnTracker, /params\.get\("cancel"\) === "true"/)
  assert.match(billingFailed, /<BillingReturnTracker status="failed" \/>/)
  assert.doesNotMatch(billingTracking, /email|user_id|userEmail|user_email/)
  assert.doesNotMatch(returnTracker, /email|user_id|userEmail|user_email/)
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
  assert.match(route, /throw new Error\(error\.message \|\| "Unable to look up Stripe account"\)/)
  assert.match(route, /throw new Error\(updateError\.message\)/)
  assert.match(route, /throw new Error\(historyError\.message\)/)
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
    /title: "Edit Connection \| List Hygiene"/
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
  const authFormShell = read("src/components/auth/auth-form-shell.tsx")
  const mobileMenu = read("src/components/app/mobile-menu.tsx")
  const logoutForm = read("src/components/app/logout-form.tsx")

  assert.match(billingContent, /onClick=\{openPortal\}/)
  assert.match(billingContent, /onClick=\{openPortal\}[\s\S]*Edit[\s\S]*<\/Button>/)
  assert.match(billingContent, /onClick=\{\(\) => selectPlan\(plan\)\}/)
  assert.match(billingContent, /openingPortal && <Loader2 className="size-4 animate-spin" \/>/)
  assert.match(billingContent, /checkingOutPlanId === plan\.id/)
  assert.match(settingsContent, /onClick=\{addKlaviyoConnection\}/)
  assert.match(settingsContent, /connectingKlaviyo && \(/)
  assert.match(settingsContent, /startKlaviyoOAuth/)
  assert.match(klaviyoOAuth, /popup=yes/)
  assert.match(klaviyoOAuth, /width=\$\{width\}/)
  assert.match(klaviyoOAuth, /height=\$\{height\}/)
  assert.match(klaviyoOAuth, /"klaviyo-oauth"/)
  assert.match(klaviyoOAuth, /popup\.location\.href = authUrl/)
  assert.match(klaviyoOAuth, /popup\.focus\(\)/)
  assert.match(klaviyoOAuth, /window\.location\.assign\(authUrl\)/)
  assert.match(settingsContent, /href=\{`\/settings\/klaviyo\?id=\$\{connection\.id\}`\}/)
  assert.match(settingsContent, /<MoreHorizontal className="size-4" \/>/)
  assert.match(settingsContent, /<DropdownMenuItem/)
  assert.match(settingsContent, /Delete connection/)
  assert.match(settingsContent, /loadingConnections/)
  assert.match(settingsContent, /ConnectionsTableSkeleton/)
  assert.match(settingsContent, /<Skeleton className="h-4 w-20" \/>/)
  assert.doesNotMatch(settingsContent, /Loading connections\.\.\./)
  assert.match(settingsContent, /<Table className="min-w-0 md:min-w-\[38rem\]">/)
  assert.match(settingsContent, /<TableHeader className="hidden md:table-header-group">/)
  assert.match(settingsContent, /className="grid gap-3 p-4 md:table-row md:p-0"/)
  assert.match(settingsContent, /max-h-\[calc\(100svh-2rem\)\] overflow-y-auto sm:max-w-4xl/)
  assert.doesNotMatch(settingsContent, /<TableHead>Workspace<\/TableHead>/)
  assert.doesNotMatch(settingsContent, /Multiple connections coming soon\./)
  assert.doesNotMatch(settingsContent, /Multiple connections will be available soon\./)
  assert.doesNotMatch(settingsContent, /No Integration connected yet\./)
  assert.match(settingsContent, /No connections/)
  assert.doesNotMatch(settingsContent, />\s*Configure\s*</)
  assert.match(workspaceSwitcher, /Danger Zone/)
  assert.match(workspaceSwitcher, /Cancel active billing before deleting this workspace\./)
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
  assert.match(configureConnection, /<BreadcrumbPage>Edit Connection<\/BreadcrumbPage>/)
  assert.match(configureConnection, /Combobox/)
  assert.match(configureConnection, /segment_search/)
  assert.match(configureConnection, /segment_limit: "30"/)
  assert.match(configureConnection, /itemToStringLabel=\{\(segment: SegmentOption\) => segment\.name\}/)
  assert.match(configureConnection, /Choose a Klaviyo Segment/)
  assert.match(
    configureConnection,
    /This segment will be monitored for new email addresses to check\.[\s\S]*Lists are not shown\./
  )
  assert.match(configureConnection, /Search segments/)
  assert.match(configureConnection, /sticky bottom-0/)
  assert.match(onboardingContent, /"use client"/)
  assert.match(onboardingContent, /onClick=\{connectKlaviyo\}/)
  assert.match(onboardingContent, /connecting && <Loader2 className="size-4 animate-spin" \/>/)
  assert.match(onboardingContent, /startKlaviyoOAuth/)
  assert.match(onboardingContent, /window\.location\.assign\("\/settings\?connected=1"\)/)
  assert.doesNotMatch(onboardingContent, /href="\/settings\/klaviyo"/)
  assert.match(onboardingContent, /Eligible users unlock 300 trial credits/)
  assert.match(onboardingContent, /support@listhygiene\.com/)
  assert.doesNotMatch(onboardingContent, /support@prismfly\.com/)
  assert.match(workspaceSwitcher, /onValueChange=\{\(value\) => \{[\s\S]*switchWorkspace\(value\)/)
  assert.match(workspaceSwitcher, /onClick=\{saveWorkspaceName\}/)
  assert.match(workspaceSwitcher, /savingWorkspaceName && \(/)
  assert.match(workspaceSwitcher, /onClick=\{inviteMember\}/)
  assert.match(workspaceSwitcher, /invitingMember \? \(/)
  assert.match(workspaceSwitcher, /updatingMemberUserId ===\s*row\.user_id/)
  assert.match(workspaceSwitcher, /setInviteStatusMessage\("Member email is required\."\)/)
  assert.match(workspaceSwitcher, /id="member-email-feedback"/)
  assert.match(workspaceSwitcher, /aria-describedby=\{\s*inviteStatusMessage \? "member-email-feedback" : undefined\s*\}/)
  assert.doesNotMatch(workspaceSwitcher, /setMessage\("Member email is required\."\)/)
  assert.match(workspaceSwitcher, /onClick=\{createWorkspace\}/)
  assert.match(loginForm, /action=\{formAction\}/)
  assert.match(loginForm, /loading=\{pending\}/)
  assert.match(loginForm, /loadingLabel="Logging in"/)
  assert.doesNotMatch(loginForm, /magicFormAction/)
  assert.match(signupForm, /action=\{formAction\}/)
  assert.match(signupForm, /loading=\{pending\}/)
  assert.match(signupForm, /loadingLabel="Creating account"/)
  assert.match(signupForm, /className="grid gap-1 text-xs leading-5/)
  assert.match(forgotPasswordForm, /action=\{formAction\}/)
  assert.match(forgotPasswordForm, /loading=\{pending\}/)
  assert.match(forgotPasswordForm, /loadingLabel="Sending reset link"/)
  assert.match(resetPasswordForm, /action=\{formAction\}/)
  assert.match(resetPasswordForm, /loading=\{pending\}/)
  assert.match(resetPasswordForm, /loadingLabel="Updating password"/)
  assert.match(authFormShell, /aria-busy=\{loading\}/)
  assert.match(authFormShell, /backdrop-blur-sm/)
  assert.match(authFormShell, /<Loader2 className="size-8 animate-spin text-primary" \/>/)
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
  assert.match(callback, /const TRIAL_CREDITS = 300/)
  assert.match(callback, /reserveTrialRedemption/)
  assert.match(callback, /trial_credit_redemptions/)
  assert.match(callback, /hasUserRedeemedTrial/)
  assert.match(callback, /klaviyo_accounts_directory/)
  assert.match(callback, /recordTrialCreditHistory/)
  assert.match(callback, /Trial credits granted/)
  assert.match(accounts, /applyAccountScope/)
  assert.match(accounts, /canManageIntegrations/)
  assert.match(accounts, /Workspace access is required to manage integrations/)
  assert.match(accounts, /const \{ error: updateError \} = await applyAccountScope\(updateQuery, context\)/)
  assert.match(accounts, /return errorJson\(updateError\.message\)/)
  assert.match(segments, /canManageIntegrations/)
  assert.match(segments, /Workspace access is required to manage integrations/)
  assert.match(segments, /grant_type: "refresh_token"/)
  assert.match(segments, /access_token: tokenJson\.access_token/)
  assert.match(segments, /Object\.assign\(tokenUpdates, refreshedToken\.tokenUpdates\)/)
  assert.match(segments, /refreshKlaviyoAccessToken/)
  assert.match(segments, /error\.status === 401 \|\| error\.status === 403/)
  assert.match(segments, /Unable to refresh segments\./)
  assert.match(segments, /\.update\(\{ segments, \.\.\.tokenUpdates \}\)/)
  assert.match(disconnect, /canManageIntegrations/)
  assert.match(disconnect, /Workspace access is required to manage integrations/)
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
  const breakdown = read("src/lib/dashboard/breakdown.ts")
  const report = read("src/lib/dashboard/report.ts")

  assert.match(component, /fetch\("\/api\/user\/dashboard"/)
  assert.match(component, /const \[showDummyData, setShowDummyData\] = useState\(false\)/)
  assert.match(component, /showDummyData\s+\?\s+dashboardDemoData\s+:\s+liveData/)
  assert.match(component, /checked=\{showDummyData\}/)
  assert.match(component, /onCheckedChange=\{setShowDummyData\}/)
  assert.match(route, /resolveTenantContext\(request, \{ requireWorkspace: true \}\)/)
  assert.match(route, /email_report_tbl/)
  assert.match(route, /emails_historical_performance/)
  assert.match(route, /email_usage_breakdown_monthly/)
  assert.match(route, /DASHBOARD_CATEGORY_BREAKDOWN_METRICS/)
  assert.match(route, /categoryBreakdown/)
  assert.match(route, /currentMonthReport/)
  assert.match(route, /getLastTwelveMonthBuckets\(now\)/)
  assert.match(route, /\.gte\("start", `\$\{firstMonthStart\}T00:00:00\.000Z`\)/)
  assert.match(route, /\.gte\("month_start", firstMonthStart\)/)
  assert.match(route, /typo_fixed/)
  assert.match(breakdown, /metric: "attempts"/)
  assert.match(breakdown, /metric: "bounce_reason"/)
  assert.match(breakdown, /metric: "risk_flag"/)
  assert.match(breakdown, /metric: "suppress_reason"/)
  assert.match(breakdown, /valid_first/)
  assert.match(breakdown, /no_mail_accepted/)
  assert.match(breakdown, /possible_trap/)
  assert.match(breakdown, /globally_suppressed/)
  assert.match(report, /distribution: DASHBOARD_CATEGORY_KEYS\.map/)
  assert.match(report, /categoryBreakdown: counts\.categoryBreakdown \|\| \[\]/)
  assert.match(report, /label: "Emails Removed"/)
  assert.match(report, /label: "Typos Fixed"/)
  assert.match(report, /nextMilestoneRemaining/)
})

test("dashboard matches updated chart and milestone direction", () => {
  const component = read("src/components/dashboard/dashboard-content.tsx")
  const breakdown = read("src/lib/dashboard/breakdown.ts")

  assert.match(component, /DASHBOARD_CATEGORY_KEYS\.map/)
  assert.match(component, /DASHBOARD_CATEGORY_BREAKDOWN_CONFIG/)
  assert.match(component, /buildDerivedDashboardCategoryBreakdownRows/)
  assert.match(component, /Cleanup Milestones/)
  assert.match(component, /Emails Removed/)
  assert.match(component, /visibleKpis = kpis\.filter/)
  assert.match(component, /isRemovedKpiLabel/)
  assert.match(component, /Typos Fixed/)
  assert.match(component, /RadialBarChart/)
  assert.match(component, /ChartLegend/)
  assert.match(component, /nameKey="status"/)
  assert.match(component, /#346ce6/)
  assert.match(component, /#ef4444/)
  assert.match(component, /#f59e0b/)
  assert.match(component, /#64748b/)
  assert.match(component, /stackId="status"/)
  assert.match(component, /<Tabs/)
  assert.match(component, /<TabsList/)
  assert.match(component, /activeBreakdownCategory/)
  assert.match(component, /buildCategoryBreakdownRows/)
  assert.match(component, /categoryBreakdownChartConfig/)
  assert.match(component, /stackId=\{activeBreakdownCategory\}/)
  assert.match(breakdown, /Valid/)
  assert.match(breakdown, /No mail accepted/)
  assert.match(breakdown, /Possible spam trap/)
  assert.match(breakdown, /Globally suppressed/)
  assert.match(breakdown, /categoryBreakdownColors/)
  assert.match(breakdown, /#3f5d9f/)
  assert.match(breakdown, /#7895cc/)
  assert.match(breakdown, /#bfdc3e/)
  assert.doesNotMatch(component, /Wipe out/)
  assert.doesNotMatch(component, /layout="vertical"/)
  assert.doesNotMatch(component, /horizontalCategoryData/)
})

test("dashboard charts render with zero-state data instead of placeholders", () => {
  const component = read("src/components/dashboard/dashboard-content.tsx")

  assert.match(component, /getLastTwelveEmptyHistoricalPoints/)
  assert.match(component, /normalizeLastTwelveHistoricalPoints/)
  assert.match(component, /removedChartData/)
  assert.match(component, /remaining: Math\.max/)
  assert.match(component, /data=\{visibleHistorical\}/)
  assert.match(component, /data=\{categoryBreakdownData\}/)
  assert.match(component, /data=\{removedChartData\}/)
  assert.doesNotMatch(component, /categoryBreakdownData\.length \?/)
  assert.doesNotMatch(component, /historical\.length \?/)
  assert.doesNotMatch(component, /distribution\.length \?/)
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

test("shadcn preset colors stay applied", () => {
  const components = read("components.json")
  const globals = read("src/app/globals.css")
  const layout = read("src/app/layout.tsx")

  assert.match(components, /"style": "base-nova"/)
  assert.match(components, /"menuColor": "default-translucent"/)
  assert.match(globals, /--primary: oklch\(0\.488 0\.243 264\.376\)/)
  assert.match(globals, /--chart-1: oklch\(0\.828 0\.111 230\.318\)/)
  assert.match(globals, /--sidebar-primary: oklch\(0\.546 0\.245 262\.881\)/)
  assert.match(layout, /Inter\(\{ subsets: \["latin"\], variable: "--font-sans" \}\)/)
})

test("theme mode switcher lives in profile as a button group", () => {
  const layout = read("src/app/layout.tsx")
  const profileContent = read("src/components/profile/profile-content.tsx")
  const themeToggle = read("src/components/app/theme-toggle.tsx")
  const buttonGroup = read("src/components/ui/button-group.tsx")

  assert.match(layout, /list-hygiene-theme/)
  assert.doesNotMatch(layout, /ThemeToggle|ThemeModeButtonGroup/)
  assert.doesNotMatch(layout, /fixed right-4 bottom-4/)
  assert.match(profileContent, /Appearance/)
  assert.match(profileContent, /<ThemeModeButtonGroup \/>/)
  assert.match(themeToggle, /export function ThemeModeButtonGroup/)
  assert.match(themeToggle, /localStorage\.setItem\(storageKey, nextTheme\)/)
  assert.match(themeToggle, /aria-pressed=\{theme === "dark"\}/)
  assert.match(buttonGroup, /data-slot="button-group"/)
  assert.match(buttonGroup, /role="group"/)
})

test("desktop and mobile shells share the same workspace management component", () => {
  const desktopShell = read("src/components/app/app-shell.tsx")
  const mobileShell = read("src/components/app/mobile-menu.tsx")

  assert.match(desktopShell, /<WorkspaceSwitcher/)
  assert.match(mobileShell, /<WorkspaceSwitcher/)
  assert.doesNotMatch(desktopShell, /demoWorkspaceContext|organizationName=|workspaces=/)
  assert.doesNotMatch(mobileShell, /demoWorkspaceContext|organizationName=|workspaces=/)
})

test("workspace delete action lives in workspace modal danger zone", () => {
  const settings = read("src/components/settings/settings-content.tsx")
  const switcher = read("src/components/app/workspace-switcher.tsx")
  const route = read("src/app/api/workspaces/route.ts")

  assert.doesNotMatch(settings, /Danger Zone/)
  assert.match(switcher, /Danger Zone/)
  assert.match(switcher, /archiveDialogOpen/)
  assert.match(switcher, /archiveBlockedDialogOpen/)
  assert.match(switcher, /archiveConfirmation/)
  assert.match(switcher, /<DialogTitle>Delete workspace<\/DialogTitle>/)
  assert.match(switcher, /Workspace cannot be deleted/)
  assert.match(switcher, /selectedWorkspace\.has_connected_account/)
  assert.match(switcher, /selectedWorkspace\.has_active_billing/)
  assert.match(switcher, /openArchiveWorkspaceDialog/)
  assert.match(switcher, /Delete workspace/)
  assert.match(
    switcher,
    /variant="destructive"[\s\S]*disabled=\{archivingWorkspace\}[\s\S]*onClick=\{openArchiveWorkspaceDialog\}/
  )
  assert.match(route, /Cancel active billing before archiving this workspace\./)
  assert.doesNotMatch(settings, /Archive workspace/)
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
  assert.match(
    switcher,
    /persistSelection\(organizationId, nextWorkspace\?\.id \|\| null\)/
  )
  assert.match(gate, /A workspace is required before continuing\./)
})

test("workspace selector shows loading state without a field label", () => {
  const switcher = read("src/components/app/workspace-switcher.tsx")

  assert.match(switcher, /workspacesLoading/)
  assert.match(switcher, /teamLoading/)
  assert.match(switcher, /setTeamLoading\(true\)/)
  assert.match(switcher, /setTeamLoading\(false\)/)
  assert.match(switcher, /<Skeleton className="h-4 w-44" \/>/)
  assert.match(switcher, /<Loader2 className="size-4 animate-spin" \/>/)
  assert.match(switcher, /Loading/)
  assert.match(switcher, /<Table className="min-w-0 md:min-w-\[38rem\]">/)
  assert.match(switcher, /<TableHeader className="hidden md:table-header-group">/)
  assert.match(switcher, /className="grid gap-3 p-4 md:table-row md:p-0"/)
  assert.match(switcher, /className="min-w-0 break-all text-right font-medium md:text-left md:font-normal"/)
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

test("new workspaces seed organization owners and admins as members", () => {
  const route = read("src/app/api/workspaces/route.ts")

  assert.match(route, /om\.role in \('owner', 'admin'\)/)
  assert.match(route, /organizationManagers/)
  assert.match(route, /\.in\("role", \["owner", "admin"\]\)/)
  assert.match(route, /member_count: organizationManagers\?\.length \|\| 0/)
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
  assert.doesNotMatch(desktopShell, /LogoutForm/)
  assert.doesNotMatch(mobileShell, /LogoutForm/)
  assert.match(profileContent, /<LogoutForm \/>/)
})

test("nav profile entry lives at the bottom and menu items have tooltips", () => {
  const desktopShell = read("src/components/app/app-shell.tsx")
  const mobileShell = read("src/components/app/mobile-menu.tsx")
  const tooltip = read("src/components/ui/tooltip.tsx")

  assert.match(tooltip, /@base-ui\/react\/tooltip/)
  assert.match(desktopShell, /TooltipProvider delay=\{300\}/)
  assert.match(mobileShell, /TooltipProvider delay=\{300\}/)
  assert.match(desktopShell, /<TooltipContent>\{item\.label\}<\/TooltipContent>/)
  assert.match(mobileShell, /<TooltipContent>\{item\.label\}<\/TooltipContent>/)
  assert.match(desktopShell, /href="\/profile"/)
  assert.match(mobileShell, /href="\/profile"/)
  assert.match(desktopShell, /<CircleUserRound className="size-5" \/>/)
  assert.match(mobileShell, /<CircleUserRound className="size-5" \/>/)
  assert.match(desktopShell, /group-hover:hidden/)
  assert.match(mobileShell, /group-hover:hidden/)
  assert.match(desktopShell, /Open Profile/)
  assert.match(mobileShell, /Open Profile/)
  assert.doesNotMatch(desktopShell, /key: "profile"/)
  assert.doesNotMatch(mobileShell, /key: "profile"/)
  assert.match(desktopShell, /<ProfileNavLink active=\{active\} userEmail=\{userEmail\} \/>/)
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
  const combobox = read("src/components/ui/combobox.tsx")
  const workspaceSwitcher = read("src/components/app/workspace-switcher.tsx")

  assert.match(mobileShell, /z-\[60\]/)
  assert.match(workspaceSwitcher, /<Dialog[\s\S]*open=\{createDialogOpen\}/)
  assert.match(workspaceSwitcher, /<DialogContent className="max-h-\[calc\(100svh-2rem\)\] overflow-y-auto sm:max-w-3xl">/)
  assert.match(workspaceSwitcher, /createPortal\(/)
  assert.match(workspaceSwitcher, /document\.body/)
  assert.match(workspaceSwitcher, /z-\[2147483647\]/)
  assert.match(workspaceSwitcher, /role="status"/)
  assert.match(dialog, /z-\[1000\]/)
  assert.match(select, /z-\[1100\]/)
  assert.match(combobox, /z-\[1100\]/)
  assert.match(combobox, /className=\{cn\("contents", className\)\}/)
  assert.match(combobox, /<div className="px-2 py-3 text-sm text-muted-foreground">/)
})
