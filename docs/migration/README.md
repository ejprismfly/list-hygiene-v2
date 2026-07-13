# List Hygiene v2 Migration

This folder tracks the move from the current Plasmic-based UI to a native Next.js and shadcn UI.

The v2 scaffold is intentionally isolated:

- It does not copy production environment values.
- It does not include Plasmic packages.
- It does not run or require database migrations.
- It starts with auth-compatible routes only: `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/auth/callback`, and `/dashboard`.

## Cutover Plan

1. Build v2 with placeholder and test Supabase projects first.
2. Recreate pages route by route using shadcn components.
3. Keep API contracts compatible with the current backend before replacing each live route.
4. Deploy v2 behind a separate preview domain.
5. Switch traffic only after auth, workspace, billing, integrations, reports, and team flows pass regression checks.
6. Keep the current Plasmic app deployable as the rollback path until v2 is fully verified.
