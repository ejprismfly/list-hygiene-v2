# Live Database Readiness

Use this before pointing v2 at the current v1/live Supabase project.

## Migration Source Of Truth

Do not run the v2 greenfield bootstrap migration on live:

```text
supabase/migrations/20260713000000_v2_dev_bootstrap.sql
```

For the current live database, use the additive production SQL from the v1/core repo in this order:

```text
/root/list-hygiene/list-hygiene-core/sql/20260706_organizations_workspaces.sql
/root/list-hygiene/list-hygiene-core/sql/20260706_backfill_organizations_workspaces.sql
/root/list-hygiene/list-hygiene-core/sql/20260707_workspace_archiving.sql
/root/list-hygiene/list-hygiene-core/sql/20260709_workspace_billing.sql
/root/list-hygiene/list-hygiene-core/sql/20260709_workspace_report_tables.sql
```

Run those against a cloned live database first. They are intended to be additive and backwards compatible with v1, but the clone test should still verify row counts and existing v1 flows.

## Required Live Shape

The live database should have these workspace-era tables:

```text
organizations
organization_members
workspaces
workspace_members
organization_invitations
```

These existing v1 tables should have nullable tenant columns:

```text
klaviyo_accounts.organization_id
klaviyo_accounts.workspace_id
emails.organization_id
emails.workspace_id
bulk_jobs.organization_id
bulk_jobs.workspace_id
bulk_emails.organization_id
bulk_emails.workspace_id
stripe_accounts.organization_id
stripe_accounts.workspace_id
stripe_payment_methods.organization_id
stripe_payment_methods.workspace_id
credit_history.organization_id
credit_history.workspace_id
email_report_tbl.organization_id
email_report_tbl.workspace_id
emails_historical_performance.organization_id
emails_historical_performance.workspace_id
email_usage_monthly.organization_id
email_usage_monthly.workspace_id
email_usage_breakdown_monthly.organization_id
email_usage_breakdown_monthly.workspace_id
```

The v2 dashboard reads report summaries without requiring `id` columns on
`email_report_tbl`, `email_usage_monthly`, or
`email_usage_breakdown_monthly`. Those tables may remain in their current v1
shape during side-by-side testing.

## Side-By-Side Rules

- Deploy v2 on a separate hostname from v1.
- Set `NEXT_PUBLIC_APP_HOST` to the v2 hostname.
- Add the v2 auth callback and invite URLs in Supabase Auth settings.
- Supabase Auth password login/signup and password reset should be configured before testing auth.
- Configure the Supabase Auth Invite user email template from
  `docs/deployment/supabase-invite-template.html` so team invites verify through
  `/auth/callback` with `token_hash` before applying workspace membership.
- Add the v2 Klaviyo callback URL in the Klaviyo app.
- Stripe webhook endpoint: v2 exposes `/api/billing/webhook`, but keep live Stripe webhooks pointed at v1 until the v2 endpoint has been tested with signed events and its own `STRIPE_WEBHOOK_SECRET`.
- Use a small internal tester list first because v2 will create default organization/workspace rows for users who do not have them yet.

## Smoke Test

1. Login/logout on v2.
2. Existing user gets a default organization/workspace if missing.
3. Workspace create, switch, rename, archive/delete.
4. Workspace invite sends a Supabase Auth email; the invitee accepts into the selected workspace as admin/member.
5. Klaviyo OAuth creates an active connection with `organization_id` and `workspace_id`.
6. Dashboard API changes when `workspace_id` changes.
7. Billing page loads and returns workspace billing context.
8. V1 remains usable on the current live hostname after the same user tests v2.
