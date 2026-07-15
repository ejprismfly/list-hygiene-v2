# List Hygiene v2 Migration

This folder tracks the move from the current Plasmic-based UI to a native Next.js and shadcn UI.

The v2 scaffold is intentionally isolated:

- It does not copy production environment values.
- It does not include Plasmic packages.
- It can run beside v1 on a separate hostname against the same live Supabase database after the workspace-era production migrations in `list-hygiene-core/sql` are applied.
- It includes native auth, dashboard, billing, settings/integrations, profile, workspace switching/management, and team-management modal flows.

## Cutover Plan

1. Build v2 with placeholder and test Supabase projects first.
2. Recreate pages route by route using shadcn components.
3. Keep API contracts compatible with the current backend before replacing each live route.
4. Deploy v2 behind a separate preview domain or v2 hostname.
5. Switch traffic only after auth, workspace, billing, integrations, reports, and team flows pass regression checks.
6. Keep the current Plasmic app deployable as the rollback path until v2 is fully verified.

See `docs/deployment/v2-side-by-side.md` for the current live side-by-side checklist.
