-- Greenfield bootstrap for a new List Hygiene v2 Supabase project.
--
-- Intended for dev/staging projects only. Do not run this against the
-- current production database; production already has additive migrations in
-- list-hygiene-core/sql.

begin;

create extension if not exists pgcrypto;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.lh_slugify(value text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(lower(coalesce(value, '')), '[^a-z0-9]+', '-', 'g'));
$$;

create table if not exists public.user_details (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text,
  name text,
  onboarded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  legacy_user_id uuid unique references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  status text not null default 'active' check (status in ('active', 'invited', 'disabled')),
  invited_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  slug text,
  created_by_user_id uuid references auth.users(id) on delete set null,
  legacy_user_id uuid references auth.users(id) on delete set null,
  is_default boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists workspaces_org_slug_unique
  on public.workspaces (organization_id, slug)
  where slug is not null;

create unique index if not exists workspaces_org_legacy_user_unique
  on public.workspaces (organization_id, legacy_user_id)
  where legacy_user_id is not null;

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create table if not exists public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'member')),
  workspace_ids uuid[] not null default '{}'::uuid[],
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  token_hash text not null unique,
  invited_by_user_id uuid not null references auth.users(id) on delete cascade,
  accepted_by_user_id uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists organization_invitations_pending_email_unique
  on public.organization_invitations (organization_id, lower(email))
  where status = 'pending';

create table if not exists public.klaviyo_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  workspace_id uuid references public.workspaces(id) on delete set null,
  created_by_user_id uuid references auth.users(id) on delete set null,
  billing_user_id uuid references auth.users(id) on delete set null,
  platform text not null default 'klaviyo',
  connection_name text,
  external_account_id text,
  access_token text,
  refresh_token text,
  token_expires_in timestamptz,
  token_scope text,
  account_details jsonb not null default '[]'::jsonb,
  segments jsonb not null default '[]'::jsonb,
  selected_segment jsonb,
  fix_typos boolean not null default false,
  full_mailbox_retries integer not null default 0,
  greylisted_retries integer not null default 0,
  unexpected_error_retries integer not null default 0,
  mail_server_temporary_error_retries integer not null default 0,
  active boolean not null default true,
  connected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.klaviyo_accounts_directory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  account_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.emails (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  workspace_id uuid references public.workspaces(id) on delete set null,
  klaviyo_account_id uuid references public.klaviyo_accounts(id) on delete set null,
  email text not null,
  status text,
  substatus text,
  lh_status text,
  lh_category text,
  tagged boolean not null default false,
  merged boolean not null default false,
  typo_fixed boolean not null default false,
  attempts integer not null default 0,
  attempts_record jsonb not null default '[]'::jsonb,
  did_you_mean text,
  klaviyo_profile_id text,
  leading_period_email text,
  suppress boolean,
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bulk_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  workspace_id uuid references public.workspaces(id) on delete set null,
  billing_user_id uuid references auth.users(id) on delete set null,
  account_id uuid references public.klaviyo_accounts(id) on delete set null,
  status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bulk_emails (
  id uuid primary key default gen_random_uuid(),
  bulk_job_id uuid references public.bulk_jobs(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  workspace_id uuid references public.workspaces(id) on delete set null,
  email text not null,
  status text,
  substatus text,
  lh_status text,
  lh_category text,
  tagged boolean not null default false,
  merged boolean not null default false,
  typo_fixed boolean not null default false,
  attempts integer not null default 0,
  attempts_record jsonb not null default '[]'::jsonb,
  did_you_mean text,
  klaviyo_profile_id text,
  leading_period_email text,
  suppress boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bulk_job_reports (
  id uuid primary key default gen_random_uuid(),
  bulk_job_id uuid references public.bulk_jobs(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  workspace_id uuid references public.workspaces(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stripe_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  workspace_id uuid references public.workspaces(id) on delete set null,
  billing_scope text not null default 'user' check (billing_scope in ('user', 'workspace')),
  customer_id text,
  subscription_id text,
  plan_id text,
  credits_plan integer not null default 0,
  credits_remaining integer not null default 0,
  credits_used integer not null default 0,
  credits_turnover integer not null default 0,
  reset_date timestamptz,
  overage_plan integer not null default 0,
  overage_remaining integer not null default 0,
  overage_used integer not null default 0,
  trial_plan integer not null default 0,
  trial_remaining integer not null default 0,
  trial_used integer not null default 0,
  trial_redeemed_with uuid references public.klaviyo_accounts(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stripe_payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  workspace_id uuid references public.workspaces(id) on delete set null,
  billing_scope text not null default 'user' check (billing_scope in ('user', 'workspace')),
  customer_id text,
  payment_id text,
  payment_method_id text,
  brand text,
  last4 text,
  exp_month integer,
  exp_year integer,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  workspace_id uuid references public.workspaces(id) on delete set null,
  klaviyo_account_id uuid references public.klaviyo_accounts(id) on delete set null,
  credits_delta integer not null default 0,
  credits_remaining integer,
  change integer,
  remaining integer,
  reason text,
  context text,
  source text,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.email_report_tbl (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  workspace_id uuid references public.workspaces(id) on delete set null,
  total_count integer not null default 0,
  valid_count integer not null default 0,
  invalid_count integer not null default 0,
  risky_count integer not null default 0,
  restricted_count integer not null default 0,
  suppressed_count integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists email_report_tbl_workspace_unique
  on public.email_report_tbl (user_id, organization_id, workspace_id) nulls not distinct;

create table if not exists public.emails_historical_performance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  workspace_id uuid references public.workspaces(id) on delete set null,
  order_id integer not null,
  month text not null,
  year integer not null,
  key text not null,
  start timestamptz not null,
  "end" timestamptz not null,
  valid integer,
  invalid integer,
  risky integer,
  restricted integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists emails_historical_performance_workspace_unique
  on public.emails_historical_performance (user_id, organization_id, workspace_id, order_id) nulls not distinct;

create table if not exists public.email_usage_monthly (
  id uuid primary key default gen_random_uuid(),
  month_start date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  workspace_id uuid references public.workspaces(id) on delete set null,
  valid_count integer not null default 0,
  invalid_count integer not null default 0,
  risky_count integer not null default 0,
  restricted_count integer not null default 0,
  suppressed_count integer not null default 0,
  sort_idx integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists email_usage_monthly_workspace_unique
  on public.email_usage_monthly (month_start, user_id, organization_id, workspace_id) nulls not distinct;

create table if not exists public.email_usage_breakdown_monthly (
  id uuid primary key default gen_random_uuid(),
  month_start date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  workspace_id uuid references public.workspaces(id) on delete set null,
  metric text not null,
  key text not null,
  count integer not null default 0,
  sort_idx integer not null default 0,
  color_hex text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists email_usage_breakdown_monthly_workspace_unique
  on public.email_usage_breakdown_monthly (month_start, user_id, organization_id, workspace_id, metric, key) nulls not distinct;

alter table if exists public.user_details
  add column if not exists onboarded boolean not null default false;

alter table if exists public.klaviyo_accounts
  add column if not exists token_expires_in timestamptz,
  add column if not exists token_scope text,
  add column if not exists account_details jsonb not null default '[]'::jsonb,
  add column if not exists segments jsonb not null default '[]'::jsonb,
  add column if not exists selected_segment jsonb,
  add column if not exists fix_typos boolean not null default false,
  add column if not exists full_mailbox_retries integer not null default 0,
  add column if not exists greylisted_retries integer not null default 0,
  add column if not exists unexpected_error_retries integer not null default 0,
  add column if not exists mail_server_temporary_error_retries integer not null default 0;

alter table if exists public.emails
  add column if not exists lh_category text,
  add column if not exists tagged boolean not null default false,
  add column if not exists merged boolean not null default false,
  add column if not exists typo_fixed boolean not null default false,
  add column if not exists attempts integer not null default 0,
  add column if not exists attempts_record jsonb not null default '[]'::jsonb,
  add column if not exists did_you_mean text,
  add column if not exists klaviyo_profile_id text,
  add column if not exists leading_period_email text;

alter table if exists public.bulk_emails
  add column if not exists lh_category text,
  add column if not exists tagged boolean not null default false,
  add column if not exists merged boolean not null default false,
  add column if not exists typo_fixed boolean not null default false,
  add column if not exists attempts integer not null default 0,
  add column if not exists attempts_record jsonb not null default '[]'::jsonb,
  add column if not exists did_you_mean text,
  add column if not exists klaviyo_profile_id text,
  add column if not exists leading_period_email text;

alter table if exists public.stripe_accounts
  add column if not exists reset_date timestamptz,
  add column if not exists overage_plan integer not null default 0,
  add column if not exists overage_remaining integer not null default 0,
  add column if not exists overage_used integer not null default 0,
  add column if not exists trial_plan integer not null default 0,
  add column if not exists trial_remaining integer not null default 0,
  add column if not exists trial_used integer not null default 0,
  add column if not exists trial_redeemed_with uuid references public.klaviyo_accounts(id) on delete set null;

alter table if exists public.stripe_payment_methods
  add column if not exists payment_id text;

alter table if exists public.credit_history
  add column if not exists change integer,
  add column if not exists remaining integer,
  add column if not exists reason text,
  add column if not exists context text;

create index if not exists organization_members_user_idx
  on public.organization_members (user_id, status);

create index if not exists workspace_members_user_idx
  on public.workspace_members (user_id, organization_id);

create index if not exists workspaces_org_active_idx
  on public.workspaces (organization_id, is_default, created_at)
  where archived_at is null;

create index if not exists klaviyo_accounts_tenant_idx
  on public.klaviyo_accounts (organization_id, workspace_id, active);

create index if not exists klaviyo_accounts_directory_account_idx
  on public.klaviyo_accounts_directory (account_id);

create index if not exists emails_tenant_idx
  on public.emails (organization_id, workspace_id);

create index if not exists bulk_jobs_tenant_idx
  on public.bulk_jobs (organization_id, workspace_id);

create index if not exists bulk_emails_tenant_idx
  on public.bulk_emails (organization_id, workspace_id);

create index if not exists stripe_accounts_user_workspace_idx
  on public.stripe_accounts (user_id, workspace_id);

create index if not exists stripe_accounts_customer_idx
  on public.stripe_accounts (customer_id)
  where customer_id is not null;

create index if not exists stripe_payment_methods_customer_tenant_idx
  on public.stripe_payment_methods (customer_id, organization_id, workspace_id)
  where customer_id is not null;

create index if not exists credit_history_tenant_idx
  on public.credit_history (organization_id, workspace_id);

create index if not exists email_report_tbl_tenant_idx
  on public.email_report_tbl (organization_id, workspace_id);

create index if not exists emails_historical_performance_tenant_idx
  on public.emails_historical_performance (organization_id, workspace_id);

create index if not exists email_usage_monthly_tenant_idx
  on public.email_usage_monthly (organization_id, workspace_id);

create index if not exists email_usage_breakdown_monthly_tenant_idx
  on public.email_usage_breakdown_monthly (organization_id, workspace_id);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'user_details',
    'organizations',
    'organization_members',
    'workspaces',
    'workspace_members',
    'organization_invitations',
    'klaviyo_accounts',
    'klaviyo_accounts_directory',
    'emails',
    'bulk_jobs',
    'bulk_emails',
    'bulk_job_reports',
    'stripe_accounts',
    'stripe_payment_methods',
    'email_report_tbl',
    'emails_historical_performance',
    'email_usage_monthly',
    'email_usage_breakdown_monthly'
  ]
  loop
    execute format('drop trigger if exists %I_touch_updated_at on public.%I', table_name, table_name);
    execute format(
      'create trigger %I_touch_updated_at before update on public.%I for each row execute function public.touch_updated_at()',
      table_name,
      table_name
    );
  end loop;
end $$;

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

create or replace function public.organization_role(p_organization_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.role
  from public.organization_members m
  where m.organization_id = p_organization_id
    and m.user_id = auth.uid()
    and m.status = 'active'
  order by case m.role when 'owner' then 1 when 'admin' then 2 else 3 end
  limit 1;
$$;

create or replace function public.can_manage_organization(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.organization_role(p_organization_id) in ('owner', 'admin'), false);
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

create or replace function public.ensure_default_organization_workspace(
  p_user_id uuid,
  p_email text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_org_id uuid;
  v_workspace_id uuid;
begin
  v_name := nullif(trim(coalesce(
    p_metadata->>'name',
    p_metadata->>'full_name',
    split_part(coalesce(p_email, ''), '@', 1),
    'Default Organization'
  )), '');

  if v_name is null then
    v_name := 'Default Organization';
  end if;

  insert into public.user_details (user_id, email, name)
  values (p_user_id, p_email, v_name)
  on conflict (user_id) do update
  set
    email = coalesce(excluded.email, public.user_details.email),
    name = coalesce(nullif(public.user_details.name, ''), excluded.name),
    updated_at = now();

  insert into public.organizations (legacy_user_id, owner_user_id, name, slug)
  values (
    p_user_id,
    p_user_id,
    v_name,
    'org-' || replace(p_user_id::text, '-', '')
  )
  on conflict (legacy_user_id) do update
  set
    owner_user_id = excluded.owner_user_id,
    name = coalesce(nullif(public.organizations.name, ''), excluded.name),
    updated_at = now()
  returning id into v_org_id;

  insert into public.organization_members (organization_id, user_id, role, status)
  values (v_org_id, p_user_id, 'owner', 'active')
  on conflict (organization_id, user_id) do update
  set role = 'owner', status = 'active', updated_at = now();

  insert into public.workspaces (
    organization_id,
    name,
    slug,
    created_by_user_id,
    legacy_user_id,
    is_default
  )
  values (
    v_org_id,
    'Default Workspace',
    'default',
    p_user_id,
    p_user_id,
    true
  )
  on conflict do nothing;

  select id
  into v_workspace_id
  from public.workspaces
  where organization_id = v_org_id
    and (legacy_user_id = p_user_id or slug = 'default')
    and archived_at is null
  order by is_default desc, created_at asc
  limit 1;

  if v_workspace_id is not null then
    insert into public.workspace_members (workspace_id, organization_id, user_id, role)
    values (v_workspace_id, v_org_id, p_user_id, 'owner')
    on conflict (workspace_id, user_id) do update
    set role = 'owner', updated_at = now();
  end if;
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_default_organization_workspace(new.id, new.email, new.raw_user_meta_data);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_list_hygiene on auth.users;
create trigger on_auth_user_created_list_hygiene
after insert on auth.users
for each row execute function public.handle_new_auth_user();

select public.ensure_default_organization_workspace(id, email, raw_user_meta_data)
from auth.users;

grant usage on schema public to anon, authenticated, service_role, authenticator;
grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated, service_role;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'user_details',
    'organizations',
    'organization_members',
    'workspaces',
    'workspace_members',
    'organization_invitations',
    'klaviyo_accounts',
    'klaviyo_accounts_directory',
    'emails',
    'bulk_jobs',
    'bulk_emails',
    'bulk_job_reports',
    'stripe_accounts',
    'stripe_payment_methods',
    'credit_history',
    'email_report_tbl',
    'emails_historical_performance',
    'email_usage_monthly',
    'email_usage_breakdown_monthly'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end $$;

drop policy if exists user_details_select_own on public.user_details;
create policy user_details_select_own on public.user_details
for select using (user_id = auth.uid());

drop policy if exists user_details_update_own on public.user_details;
create policy user_details_update_own on public.user_details
for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists user_details_insert_own on public.user_details;
create policy user_details_insert_own on public.user_details
for insert with check (user_id = auth.uid());

drop policy if exists organizations_select_member on public.organizations;
create policy organizations_select_member on public.organizations
for select using (public.is_organization_member(id));

drop policy if exists organizations_insert_owner on public.organizations;
create policy organizations_insert_owner on public.organizations
for insert with check (owner_user_id = auth.uid());

drop policy if exists organizations_update_admin on public.organizations;
create policy organizations_update_admin on public.organizations
for update using (public.can_manage_organization(id)) with check (public.can_manage_organization(id));

drop policy if exists organization_members_select_member on public.organization_members;
create policy organization_members_select_member on public.organization_members
for select using (public.is_organization_member(organization_id));

drop policy if exists organization_members_manage_admin on public.organization_members;
create policy organization_members_manage_admin on public.organization_members
for all using (public.can_manage_organization(organization_id)) with check (public.can_manage_organization(organization_id));

drop policy if exists workspaces_select_member on public.workspaces;
create policy workspaces_select_member on public.workspaces
for select using (public.is_organization_member(organization_id));

drop policy if exists workspaces_manage_admin on public.workspaces;
create policy workspaces_manage_admin on public.workspaces
for all using (public.can_manage_organization(organization_id)) with check (public.can_manage_organization(organization_id));

drop policy if exists workspace_members_select_org_member on public.workspace_members;
create policy workspace_members_select_org_member on public.workspace_members
for select using (public.is_organization_member(organization_id));

drop policy if exists workspace_members_manage_admin on public.workspace_members;
create policy workspace_members_manage_admin on public.workspace_members
for all using (public.can_manage_organization(organization_id)) with check (public.can_manage_organization(organization_id));

drop policy if exists organization_invitations_select_admin on public.organization_invitations;
create policy organization_invitations_select_admin on public.organization_invitations
for select using (public.can_manage_organization(organization_id));

drop policy if exists organization_invitations_manage_admin on public.organization_invitations;
create policy organization_invitations_manage_admin on public.organization_invitations
for all using (public.can_manage_organization(organization_id)) with check (public.can_manage_organization(organization_id));

drop policy if exists klaviyo_accounts_select_workspace_member on public.klaviyo_accounts;
create policy klaviyo_accounts_select_workspace_member on public.klaviyo_accounts
for select using (
  user_id = auth.uid()
  or public.is_organization_member(organization_id)
  or public.is_workspace_member(workspace_id)
);

drop policy if exists klaviyo_accounts_manage_admin on public.klaviyo_accounts;
create policy klaviyo_accounts_manage_admin on public.klaviyo_accounts
for all using (public.can_manage_organization(organization_id)) with check (public.can_manage_organization(organization_id));

drop policy if exists klaviyo_accounts_directory_select_own on public.klaviyo_accounts_directory;
create policy klaviyo_accounts_directory_select_own on public.klaviyo_accounts_directory
for select using (user_id = auth.uid());

drop policy if exists klaviyo_accounts_directory_manage_own on public.klaviyo_accounts_directory;
create policy klaviyo_accounts_directory_manage_own on public.klaviyo_accounts_directory
for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists emails_select_workspace_member on public.emails;
create policy emails_select_workspace_member on public.emails
for select using (
  user_id = auth.uid()
  or public.is_organization_member(organization_id)
  or public.is_workspace_member(workspace_id)
);

drop policy if exists bulk_jobs_select_workspace_member on public.bulk_jobs;
create policy bulk_jobs_select_workspace_member on public.bulk_jobs
for select using (
  user_id = auth.uid()
  or public.is_organization_member(organization_id)
  or public.is_workspace_member(workspace_id)
);

drop policy if exists bulk_emails_select_workspace_member on public.bulk_emails;
create policy bulk_emails_select_workspace_member on public.bulk_emails
for select using (
  user_id = auth.uid()
  or public.is_organization_member(organization_id)
  or public.is_workspace_member(workspace_id)
);

drop policy if exists bulk_job_reports_select_workspace_member on public.bulk_job_reports;
create policy bulk_job_reports_select_workspace_member on public.bulk_job_reports
for select using (
  user_id = auth.uid()
  or public.is_organization_member(organization_id)
  or public.is_workspace_member(workspace_id)
);

drop policy if exists stripe_accounts_select_tenant on public.stripe_accounts;
create policy stripe_accounts_select_tenant on public.stripe_accounts
for select using (
  user_id = auth.uid()
  or public.is_organization_member(organization_id)
  or public.is_workspace_member(workspace_id)
);

drop policy if exists stripe_payment_methods_select_tenant on public.stripe_payment_methods;
create policy stripe_payment_methods_select_tenant on public.stripe_payment_methods
for select using (
  user_id = auth.uid()
  or public.is_organization_member(organization_id)
  or public.is_workspace_member(workspace_id)
);

drop policy if exists credit_history_select_tenant on public.credit_history;
create policy credit_history_select_tenant on public.credit_history
for select using (
  user_id = auth.uid()
  or public.is_organization_member(organization_id)
  or public.is_workspace_member(workspace_id)
);

drop policy if exists email_report_tbl_select_tenant on public.email_report_tbl;
create policy email_report_tbl_select_tenant on public.email_report_tbl
for select using (
  user_id = auth.uid()
  or public.is_organization_member(organization_id)
  or public.is_workspace_member(workspace_id)
);

drop policy if exists emails_historical_performance_select_tenant on public.emails_historical_performance;
create policy emails_historical_performance_select_tenant on public.emails_historical_performance
for select using (
  user_id = auth.uid()
  or public.is_organization_member(organization_id)
  or public.is_workspace_member(workspace_id)
);

drop policy if exists email_usage_monthly_select_tenant on public.email_usage_monthly;
create policy email_usage_monthly_select_tenant on public.email_usage_monthly
for select using (
  user_id = auth.uid()
  or public.is_organization_member(organization_id)
  or public.is_workspace_member(workspace_id)
);

drop policy if exists email_usage_breakdown_monthly_select_tenant on public.email_usage_breakdown_monthly;
create policy email_usage_breakdown_monthly_select_tenant on public.email_usage_breakdown_monthly
for select using (
  user_id = auth.uid()
  or public.is_organization_member(organization_id)
  or public.is_workspace_member(workspace_id)
);

commit;
