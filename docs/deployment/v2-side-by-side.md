# v2 Side-by-Side Deployment

Use this checklist when running the native v2 app beside the current Plasmic v1 app against the same live Supabase database.

## Required Shape

- Deploy v2 on a separate hostname, for example `https://v2.listhygiene.com`.
- Keep v1 on the current production hostname, for example `https://app.listhygiene.com`.
- Do not serve v1 and v2 from different paths on the same hostname. Auth cookies, workspace cookies, local storage, OAuth callbacks, and billing returns are host-scoped assumptions.
- Point v2 at the same Supabase project only after the workspace-era production migrations from `list-hygiene-core/sql` have been applied.
- Do not run `supabase/migrations/20260713000000_v2_dev_bootstrap.sql` against live production. That file is for new dev/staging projects.
- Use `docs/deployment/live-db-readiness.md` to verify the live database before switching v2 to the live Supabase values.

## v2 Environment

Use the same live Supabase values as v1:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Set v2-specific host values:

```bash
NEXT_PUBLIC_APP_HOST=https://v2.listhygiene.com
NEXT_PUBLIC_ORG_WORKSPACES_ENABLED=true
ORG_WORKSPACES_ENABLED=true
```

Do not include a trailing slash in `NEXT_PUBLIC_APP_HOST`. The app normalizes it, but the Klaviyo and Stripe dashboards should be configured with the slashless host.

Optional direct database fallback:

```bash
DATABASE_URL=
```

`DATABASE_URL` must point to the same Supabase database as `NEXT_PUBLIC_SUPABASE_URL`. It is used only by the organization/workspace fallback APIs when Supabase REST schema cache is unavailable.

Klaviyo:

```bash
NEXT_PUBLIC_KLAVIYO_CLIENT_ID=
KLAVIYO_CLIENT_SECRET=
```

The Klaviyo app must allow:

```text
https://v2.listhygiene.com/api/oauth/klaviyo/callback
```

Stripe:

```bash
STRIPE_SECRET_KEY=
```

During side-by-side testing, keep Stripe webhook delivery on the current v1/live endpoint. v2 can create checkout and portal sessions, but this repo does not currently contain a v2 Stripe webhook route. The current v1 webhook already understands workspace billing metadata.

## Supabase Auth

Add these URLs to Supabase Auth redirect allowlist before testing v2 login, signup, magic link, social login, and password reset:

```text
https://v2.listhygiene.com/auth/callback
https://v2.listhygiene.com
```

Users will need to log in separately on v2 because v1 and v2 are on different hostnames. They still authenticate against the same Supabase Auth users table.

Enable and configure these OAuth providers in Supabase before testing the social buttons:

```text
Google
GitHub
```

In the Google/GitHub provider dashboards, use the provider callback URL shown by Supabase for this project, usually:

```text
https://<supabase-project-ref>.supabase.co/auth/v1/callback
```

Supabase will then redirect back to the v2 app callback URL:

```text
https://v2.listhygiene.com/auth/callback
```

## Database Safety

Expected v2 writes during testing:

- `organizations`, `organization_members`, `workspaces`, `workspace_members` default rows for legacy users.
- `klaviyo_accounts` rows when a tester connects Klaviyo from v2.
- `stripe_accounts` workspace rows if billing customer creation or checkout is tested.
- `stripe_payment_methods` updates if payment method actions are tested.

Existing v1 rows remain readable because v2 falls back to legacy user-scoped data where workspace rows do not exist.

## Initial Release Checks

1. Deploy v2 to a separate hostname with the env above.
2. Confirm password login, magic link, Google/GitHub login, signup confirmation, forgot password, and logout.
3. Confirm default organization/workspace creation for an existing live user.
4. Confirm workspace switch, create, rename, archive/delete, and forced create modal after deleting the last workspace.
5. Confirm dashboard data changes by workspace.
6. Confirm Klaviyo connection uses the v2 callback URL and creates a workspace-scoped row.
7. Confirm connected-workspace delete is blocked while an active Klaviyo account exists.
8. Confirm billing page loads without hanging.
9. Test checkout only if you are comfortable creating live Stripe customer/subscription objects for the selected workspace.
10. Keep v1 deployed and serving the main hostname as rollback until v2 webhook handling and any remaining route aliases are fully verified.

## Known Gaps Before Full Cutover

- v2 does not include a native Stripe webhook route yet; keep v1 webhook active.
- v2 does not include a dedicated `/team` page; team management is currently inside the workspace manager modal.
- v2 does not include a dedicated `/workspaces` page; workspace management is currently inside the sidebar/mobile workspace manager.
- Dashboard has live API wiring, but demo-data toggling remains in the dashboard UI for preview/testing.
