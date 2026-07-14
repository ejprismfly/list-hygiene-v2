import { readdirSync, readFileSync, statSync } from "node:fs"
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
  ]

  for (const route of requiredRoutes) {
    assert.ok(read(route).length > 0, `${route} should exist`)
  }
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
  assert.match(switcher, /Loading\.\.\./)
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
