# Data Safety

The v2 app can modify production data when it is configured with live Supabase,
Klaviyo, or Stripe values. Run it beside v1 only on a separate hostname and use
the side-by-side checklist in `docs/deployment/v2-side-by-side.md`.

## Rules for Future Migrations

- Use additive, idempotent SQL first.
- Backfill in batches for large tables.
- Avoid dropping columns, constraints, or indexes until the old code path is retired.
- Keep account-scoped credits compatible until workspace billing is fully verified.
- Test migrations against a cloned database before production.
- Keep rollback SQL or a restore point for every production migration.

## Environment Rules

- Do not commit `.env.local`.
- Do not copy live Supabase, Stripe, Klaviyo, or Plasmic secrets into this app.
- Use `.env.example` only for variable names.
- Keep Stripe webhooks pointed at the current v1/live endpoint until a v2
  webhook route is ported and tested.
