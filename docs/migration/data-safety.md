# Data Safety

The v2 UI scaffold does not modify production data.

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
