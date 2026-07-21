-- Trial credit redemption enforcement.
-- Safe rollout intent:
--   1. Run after the organization/workspace and workspace billing migrations.
--   2. Existing connections remain valid.
--   3. Existing trial users are backfilled so a user can redeem trial credits only once.
--   4. Existing Klaviyo account IDs are backfilled so a platform account cannot redeem again.

create extension if not exists pgcrypto;

alter table if exists public.stripe_accounts
  add column if not exists trial_plan integer not null default 0,
  add column if not exists trial_remaining integer not null default 0,
  add column if not exists trial_used integer not null default 0,
  add column if not exists trial_redeemed_with uuid;

create table if not exists public.klaviyo_accounts_directory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  account_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.klaviyo_accounts_directory
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.trial_credit_redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  workspace_id uuid references public.workspaces(id) on delete set null,
  platform text not null default 'klaviyo',
  external_account_id text not null,
  klaviyo_account_id text,
  stripe_account_id text,
  credits_granted integer not null default 300,
  status text not null default 'reserved' check (status in ('reserved', 'granted', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.credit_history
  add column if not exists source text,
  add column if not exists description text;

alter table if exists public.email_report_tbl
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.bulk_emails
  add column if not exists merged boolean not null default false,
  add column if not exists typo_fixed boolean not null default false,
  add column if not exists attempts_record jsonb not null default '[]'::jsonb,
  add column if not exists klaviyo_profile_id text,
  add column if not exists leading_period_email text;

create index if not exists klaviyo_accounts_directory_account_idx
  on public.klaviyo_accounts_directory (account_id);

create unique index if not exists klaviyo_accounts_directory_account_unique_idx
  on public.klaviyo_accounts_directory (account_id);

create unique index if not exists trial_credit_redemptions_user_once_idx
  on public.trial_credit_redemptions (user_id)
  where status in ('reserved', 'granted');

create unique index if not exists trial_credit_redemptions_platform_account_once_idx
  on public.trial_credit_redemptions (platform, external_account_id)
  where status in ('reserved', 'granted');

create index if not exists trial_credit_redemptions_tenant_idx
  on public.trial_credit_redemptions (organization_id, workspace_id);

insert into public.klaviyo_accounts_directory (user_id, account_id)
select distinct on (account_id)
  user_id::uuid,
  account_id
from (
  select
    user_id,
    account_details->0->>'id' as account_id,
    created_at
  from public.klaviyo_accounts
  where user_id is not null
    and account_details->0->>'id' is not null
) connected_accounts
order by account_id, created_at asc
on conflict (account_id) do nothing;

insert into public.trial_credit_redemptions (
  user_id,
  organization_id,
  workspace_id,
  platform,
  external_account_id,
  klaviyo_account_id,
  stripe_account_id,
  credits_granted,
  status,
  created_at,
  updated_at
)
select distinct on (au.id)
  au.id,
  sa.organization_id,
  sa.workspace_id,
  'klaviyo',
  coalesce(
    ka.account_details->0->>'id',
    case
      when sa.trial_redeemed_with is not null then 'klaviyo-account:' || sa.trial_redeemed_with::text
      else 'stripe-account:' || sa.id::text
    end
  ),
  sa.trial_redeemed_with::text,
  sa.id::text,
  greatest(coalesce(sa.trial_plan, 0), 300),
  'granted',
  coalesce(sa.created_at, now()),
  now()
from public.stripe_accounts sa
join auth.users au
  on au.id::text = sa.user_id::text
left join public.klaviyo_accounts ka
  on ka.id::text = sa.trial_redeemed_with::text
where sa.user_id is not null
  and (
    coalesce(sa.trial_plan, 0) > 0
    or sa.trial_redeemed_with is not null
  )
order by au.id, coalesce(sa.created_at, now()) asc
on conflict do nothing;

create or replace function public.is_organization_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function public.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = auth.uid()
  );
$$;

alter table public.trial_credit_redemptions enable row level security;

drop policy if exists trial_credit_redemptions_select_tenant on public.trial_credit_redemptions;
create policy trial_credit_redemptions_select_tenant on public.trial_credit_redemptions
for select using (
  user_id = auth.uid()
  or public.is_organization_member(organization_id)
  or public.is_workspace_member(workspace_id)
);
