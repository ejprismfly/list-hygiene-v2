-- Harden stripe_accounts indexing and recover from legacy duplicate rows.
-- This migration is additive and safe to rerun on environments that already have
-- the desired indexes.

begin;

-- Keep workspace records and legacy user-scoped records explicitly partitioned.
update public.stripe_accounts
set billing_scope = case
  when workspace_id is null then 'user'::text
  else 'workspace'::text
end
where billing_scope is distinct from case
  when workspace_id is null then 'user'::text
  else 'workspace'::text
end;

with workspace_accounts as (
  select
    id,
    user_id,
    workspace_id,
    customer_id,
    updated_at,
    created_at,
    row_number() over (
      partition by user_id, workspace_id
      order by (case when customer_id is not null then 0 else 1 end) asc,
        coalesce(updated_at, created_at) desc,
        id desc
    ) as ranking
  from public.stripe_accounts
  where active = true and workspace_id is not null
),
legacy_accounts as (
  select
    id,
    user_id,
    customer_id,
    updated_at,
    created_at,
    row_number() over (
      partition by user_id
      order by (case when customer_id is not null then 0 else 1 end) asc,
        coalesce(updated_at, created_at) desc,
        id desc
    ) as ranking
  from public.stripe_accounts
  where active = true and workspace_id is null and billing_scope = 'user'
),
workspace_to_archive as (
  select id
  from workspace_accounts
  where ranking > 1
),
legacy_to_archive as (
  select id
  from legacy_accounts
  where ranking > 1
)
update public.stripe_accounts
set active = false
where id in (select id from workspace_to_archive)
   or id in (select id from legacy_to_archive);

create unique index if not exists stripe_accounts_workspace_scope_active_unique
  on public.stripe_accounts (user_id, workspace_id)
  where active = true
    and workspace_id is not null
    and billing_scope = 'workspace';

create unique index if not exists stripe_accounts_user_scope_active_unique
  on public.stripe_accounts (user_id, billing_scope)
  where active = true
    and workspace_id is null
    and billing_scope = 'user';

commit;
