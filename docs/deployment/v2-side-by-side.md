# v2 Side-by-Side Deployment

Use this checklist when running the native v2 app beside the current Plasmic v1 app against the same live Supabase database.

## Required Shape

- Deploy v2 on a separate hostname, for example `https://beta.listhygiene.com`.
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
NEXT_PUBLIC_APP_HOST=https://beta.listhygiene.com
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
https://beta.listhygiene.com/api/oauth/klaviyo/callback
```

Stripe:

```bash
STRIPE_SECRET_KEY=
```

During side-by-side testing, keep Stripe webhook delivery on the current v1/live endpoint until you are ready to test v2 billing end to end. v2 now includes a native Stripe webhook route at `/api/billing/webhook`; before using it, configure Stripe webhook delivery to the v2 endpoint and set `STRIPE_WEBHOOK_SECRET` to that endpoint secret.

## Supabase Auth

Add these URLs to Supabase Auth redirect allowlist before testing v2 login, signup, and password reset:

```text
https://beta.listhygiene.com/auth/callback
https://beta.listhygiene.com/auth/invite-callback
https://beta.listhygiene.com/invite
https://beta.listhygiene.com
```

Users will need to log in separately on v2 because v1 and v2 are on different hostnames. They still authenticate against the same Supabase Auth users table.

Password signup uses Supabase Auth's Confirm signup email. Update the Supabase
Auth Confirm signup email template to use the server-verification link in
[supabase-signup-confirmation-template.html](./supabase-signup-confirmation-template.html):

```html
<a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=signup">
  Confirm account
</a>
```

The app passes `https://beta.listhygiene.com/auth/callback?type=signup` as
`.RedirectTo`, plus `next` when needed. The template appends Supabase's
`token_hash`, so `/auth/callback` can verify the signup and create the app
session.

Workspace team invites use Supabase Auth's Invite User email plus the app's
`organization_invitations` table. Set `SUPABASE_SERVICE_ROLE_KEY`, then update
the Supabase Auth Invite user email template to use the server-verification
link in [supabase-invite-template.html](./supabase-invite-template.html):

```html
<a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=invite">
  Accept invitation
</a>
```

The app passes `https://beta.listhygiene.com/auth/invite-callback?next=/reset-password?...`
as `.RedirectTo`. The template appends Supabase's `token_hash` and
`type=invite`, so `/auth/invite-callback` can verify the Supabase invite, set
the session cookie, send new invitees through password setup, and then continue
to `/invite` to apply the app-level organization/workspace role. If Supabase's
default `{{ .ConfirmationURL }}` invite template is still used, the same client
callback also captures the session hash returned by Supabase's verify endpoint.

Invite roles are intentionally limited to `admin` and `member`. Workspace roles
are the app permission source of truth: Owners and Admins can manage workspace
members and pending invitations, while Members can view team access and manage
existing integration settings for the workspaces they are assigned. The `owner`
role is reserved for one workspace Owner and cannot be selected in the invite UI.

## Database Safety

Expected v2 writes during testing:

- `organizations`, `organization_members`, `workspaces`, `workspace_members` default rows for legacy users.
- `workspace_members.role` is normalized so each workspace has one Owner. Run
  `docs/migration/sql/20260723_workspace_roles.sql` after the earlier
  workspace-era migrations.
- `klaviyo_accounts` rows when a tester connects Klaviyo from v2.
- `stripe_accounts` workspace rows if billing customer creation or checkout is tested.
- Stripe webhook endpoint `/api/billing/webhook` receives signed events for checkout completion, subscription invoices, and subscription deletion.
- `stripe_payment_methods` updates if payment method actions are tested.

Existing v1 rows remain readable because v2 falls back to legacy user-scoped data where workspace rows do not exist.

## Initial Release Checks

1. Deploy v2 to a separate hostname with the env above.
2. Confirm password login, signup confirmation, forgot password, and logout.
3. Confirm default organization/workspace creation for an existing live user.
4. Confirm workspace switch, create, rename, archive/delete, and forced create modal after deleting the last workspace.
5. Confirm workspace ownership transfer from Owner to an existing Admin.
6. Confirm dashboard data changes by workspace.
7. Confirm Klaviyo connection uses the v2 callback URL and creates a workspace-scoped row.
8. Confirm connected-workspace delete is blocked while an active Klaviyo account exists.
9. Confirm billing page loads without hanging.
10. Test checkout only if you are comfortable creating live Stripe customer/subscription objects for the selected workspace.
11. If testing v2 billing webhooks, point a Stripe webhook endpoint at `{NEXT_PUBLIC_APP_HOST}/api/billing/webhook` and use its own `STRIPE_WEBHOOK_SECRET`.
12. Keep v1 deployed and serving the main hostname as rollback until v2 webhook handling and any remaining route aliases are fully verified.

## Known Gaps Before Full Cutover

- v2 includes a native Stripe webhook route, but do not switch live Stripe delivery from v1 until the v2 endpoint has been tested with signed events.
- v2 does not include a dedicated `/team` page; team management is currently inside the workspace manager modal.
- v2 does not include a dedicated `/workspaces` page; workspace management is currently inside the sidebar/mobile workspace manager.
- Dashboard has live API wiring, but demo-data toggling remains in the dashboard UI for preview/testing.
