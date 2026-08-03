-- Runtime hardening shared by List Hygiene v2, core, and reports.
-- This migration is additive and keeps legacy user-scoped rows readable.

begin;

alter table if exists public.credit_history
  add column if not exists idempotency_key text,
  add column if not exists credits_delta integer,
  add column if not exists credits_remaining integer,
  add column if not exists source text;

alter table if exists public.stripe_accounts
  add column if not exists trial_plan integer not null default 0,
  add column if not exists trial_remaining integer not null default 0,
  add column if not exists trial_used integer not null default 0,
  add column if not exists overage_remaining integer not null default 0,
  add column if not exists overage_used integer not null default 0,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.klaviyo_accounts
  add column if not exists external_account_id text,
  add column if not exists full_mailbox_retries integer not null default 0,
  add column if not exists greylisted_retries integer not null default 0,
  add column if not exists unexpected_error_retries integer not null default 0,
  add column if not exists mail_server_temporary_error_retries integer not null default 0;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'klaviyo_accounts'
      and column_name = 'exception_occurred_retries'
  ) then
    execute '
      update public.klaviyo_accounts
      set unexpected_error_retries = exception_occurred_retries
      where unexpected_error_retries = 0
        and exception_occurred_retries is not null
    ';
  end if;
end $$;

create unique index if not exists credit_history_idempotency_key_unique
  on public.credit_history (idempotency_key)
  where idempotency_key is not null;

create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  status text not null default 'processing'
    check (status in ('processing', 'processed', 'failed')),
  attempts integer not null default 1,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table public.stripe_webhook_events enable row level security;
revoke all on public.stripe_webhook_events from anon, authenticated;
grant all on public.stripe_webhook_events to service_role;

-- Normalize old values before enforcing the option sets exposed by the UI.
update public.klaviyo_accounts
set full_mailbox_retries = case
  when full_mailbox_retries in (0, 6, 12, 24, 36) then full_mailbox_retries
  else 0
end,
greylisted_retries = case
  when greylisted_retries in (0, 3, 6) then greylisted_retries
  else 0
end,
unexpected_error_retries = case
  when unexpected_error_retries in (0, 3, 6) then unexpected_error_retries
  else 0
end,
mail_server_temporary_error_retries = case
  when mail_server_temporary_error_retries in (0, 3, 6) then mail_server_temporary_error_retries
  else 0
end;

alter table public.klaviyo_accounts
  drop constraint if exists klaviyo_accounts_full_mailbox_retries_check,
  drop constraint if exists klaviyo_accounts_greylisted_retries_check,
  drop constraint if exists klaviyo_accounts_unexpected_error_retries_check,
  drop constraint if exists klaviyo_accounts_temporary_error_retries_check;

alter table public.klaviyo_accounts
  add constraint klaviyo_accounts_full_mailbox_retries_check
    check (full_mailbox_retries in (0, 6, 12, 24, 36)),
  add constraint klaviyo_accounts_greylisted_retries_check
    check (greylisted_retries in (0, 3, 6)),
  add constraint klaviyo_accounts_unexpected_error_retries_check
    check (unexpected_error_retries in (0, 3, 6)),
  add constraint klaviyo_accounts_temporary_error_retries_check
    check (mail_server_temporary_error_retries in (0, 3, 6));

update public.klaviyo_accounts
set external_account_id = account_details -> 0 ->> 'id'
where external_account_id is null
  and nullif(account_details -> 0 ->> 'id', '') is not null;

-- Preserve the oldest active connection if historical duplicates exist. The
-- others remain in the database as disconnected audit records.
with duplicate_connections as (
  select id,
    row_number() over (
      partition by external_account_id
      order by created_at asc, id asc
    ) as duplicate_rank
  from public.klaviyo_accounts
  where active = true and external_account_id is not null
)
update public.klaviyo_accounts account
set active = false, updated_at = now()
from duplicate_connections duplicate
where account.id = duplicate.id and duplicate.duplicate_rank > 1;

create unique index if not exists klaviyo_accounts_active_external_account_unique
  on public.klaviyo_accounts (external_account_id)
  where active = true and external_account_id is not null;

create or replace function public.charge_workspace_credit(
  p_stripe_account_id text,
  p_user_id uuid,
  p_organization_id uuid,
  p_workspace_id uuid,
  p_idempotency_key text,
  p_context text default null
)
returns table(charged boolean, bucket text, remaining integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  account public.stripe_accounts%rowtype;
  next_remaining integer;
  charge_reason text;
begin
  if nullif(trim(p_idempotency_key), '') is null then
    raise exception 'An idempotency key is required.' using errcode = '22023';
  end if;

  select * into account
  from public.stripe_accounts
  where id::text = p_stripe_account_id
  for update;

  if not found then
    raise exception 'Billing account not found.' using errcode = 'P0002';
  end if;

  -- The account lock serializes charges, including concurrent deliveries with
  -- the same idempotency key.
  if exists (
    select 1 from public.credit_history
    where idempotency_key = p_idempotency_key
  ) then
    return query select false, 'duplicate'::text, null::integer;
    return;
  end if;

  if coalesce(account.trial_remaining, 0) > 0 then
    next_remaining := account.trial_remaining - 1;
    charge_reason := 'trial usage';
    update public.stripe_accounts
    set trial_remaining = next_remaining,
        trial_used = coalesce(trial_used, 0) + 1,
        updated_at = now()
    where id::text = p_stripe_account_id;
    bucket := 'trial';
  elsif coalesce(account.credits_remaining, 0) > 0 then
    next_remaining := account.credits_remaining - 1;
    charge_reason := 'usage';
    update public.stripe_accounts
    set credits_remaining = next_remaining,
        credits_used = coalesce(credits_used, 0) + 1,
        updated_at = now()
    where id::text = p_stripe_account_id;
    bucket := 'plan';
  elsif coalesce(account.overage_remaining, 0) > 0 then
    next_remaining := account.overage_remaining - 1;
    charge_reason := 'overage usage';
    update public.stripe_accounts
    set overage_remaining = next_remaining,
        overage_used = coalesce(overage_used, 0) + 1,
        updated_at = now()
    where id::text = p_stripe_account_id;
    bucket := 'overage';
  else
    raise exception 'No credits remaining on billing account.' using errcode = 'P0001';
  end if;

  insert into public.credit_history (
    user_id,
    organization_id,
    workspace_id,
    credits_delta,
    credits_remaining,
    change,
    remaining,
    reason,
    context,
    source,
    idempotency_key
  ) values (
    p_user_id,
    p_organization_id,
    p_workspace_id,
    -1,
    next_remaining,
    -1,
    next_remaining,
    charge_reason,
    p_context,
    'core',
    p_idempotency_key
  );

  charged := true;
  remaining := next_remaining;
  return next;
end;
$$;

revoke all on function public.charge_workspace_credit(text, uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.charge_workspace_credit(text, uuid, uuid, uuid, text, text)
  to service_role;

create or replace function public.can_manage_workspace(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = p_workspace_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

-- Tenant data is visible to members of the selected workspace. Legacy rows
-- without a workspace remain visible only to their original user.
drop policy if exists klaviyo_accounts_select_workspace_member on public.klaviyo_accounts;
create policy klaviyo_accounts_select_workspace_member on public.klaviyo_accounts
for select using (
  public.is_workspace_member(workspace_id)
  or (workspace_id is null and user_id = auth.uid())
);

drop policy if exists klaviyo_accounts_manage_admin on public.klaviyo_accounts;
drop policy if exists klaviyo_accounts_insert_workspace_admin on public.klaviyo_accounts;
drop policy if exists klaviyo_accounts_update_workspace_member on public.klaviyo_accounts;
drop policy if exists klaviyo_accounts_delete_workspace_admin on public.klaviyo_accounts;
create policy klaviyo_accounts_insert_workspace_admin on public.klaviyo_accounts
for insert with check (
  public.can_manage_workspace(workspace_id)
  or (workspace_id is null and user_id = auth.uid())
);
create policy klaviyo_accounts_update_workspace_member on public.klaviyo_accounts
for update using (
  public.is_workspace_member(workspace_id)
  or (workspace_id is null and user_id = auth.uid())
) with check (
  public.is_workspace_member(workspace_id)
  or (workspace_id is null and user_id = auth.uid())
);
create policy klaviyo_accounts_delete_workspace_admin on public.klaviyo_accounts
for delete using (
  public.can_manage_workspace(workspace_id)
  or (workspace_id is null and user_id = auth.uid())
);

drop policy if exists emails_select_workspace_member on public.emails;
create policy emails_select_workspace_member on public.emails
for select using (
  public.is_workspace_member(workspace_id)
  or (workspace_id is null and user_id = auth.uid())
);

drop policy if exists bulk_jobs_select_workspace_member on public.bulk_jobs;
create policy bulk_jobs_select_workspace_member on public.bulk_jobs
for select using (
  public.is_workspace_member(workspace_id)
  or (workspace_id is null and user_id = auth.uid())
);

drop policy if exists bulk_emails_select_workspace_member on public.bulk_emails;
create policy bulk_emails_select_workspace_member on public.bulk_emails
for select using (
  public.is_workspace_member(workspace_id)
  or (workspace_id is null and user_id = auth.uid())
);

drop policy if exists bulk_job_reports_select_workspace_member on public.bulk_job_reports;
create policy bulk_job_reports_select_workspace_member on public.bulk_job_reports
for select using (
  public.is_workspace_member(workspace_id)
  or (workspace_id is null and user_id = auth.uid())
);

drop policy if exists stripe_accounts_select_tenant on public.stripe_accounts;
create policy stripe_accounts_select_tenant on public.stripe_accounts
for select using (
  public.is_workspace_member(workspace_id)
  or (workspace_id is null and user_id = auth.uid())
);

drop policy if exists stripe_payment_methods_select_tenant on public.stripe_payment_methods;
create policy stripe_payment_methods_select_tenant on public.stripe_payment_methods
for select using (
  public.is_workspace_member(workspace_id)
  or (workspace_id is null and user_id = auth.uid())
);

drop policy if exists credit_history_select_tenant on public.credit_history;
create policy credit_history_select_tenant on public.credit_history
for select using (
  public.is_workspace_member(workspace_id)
  or (workspace_id is null and user_id = auth.uid())
);

drop policy if exists email_report_tbl_select_tenant on public.email_report_tbl;
create policy email_report_tbl_select_tenant on public.email_report_tbl
for select using (
  public.is_workspace_member(workspace_id)
  or (workspace_id is null and user_id = auth.uid())
);

drop policy if exists emails_historical_performance_select_tenant on public.emails_historical_performance;
create policy emails_historical_performance_select_tenant on public.emails_historical_performance
for select using (
  public.is_workspace_member(workspace_id)
  or (workspace_id is null and user_id = auth.uid())
);

drop policy if exists email_usage_monthly_select_tenant on public.email_usage_monthly;
create policy email_usage_monthly_select_tenant on public.email_usage_monthly
for select using (
  public.is_workspace_member(workspace_id)
  or (workspace_id is null and user_id = auth.uid())
);

drop policy if exists email_usage_breakdown_monthly_select_tenant on public.email_usage_breakdown_monthly;
create policy email_usage_breakdown_monthly_select_tenant on public.email_usage_breakdown_monthly
for select using (
  public.is_workspace_member(workspace_id)
  or (workspace_id is null and user_id = auth.uid())
);

-- These security-definer helpers are internal provisioning operations.
revoke all on function public.ensure_default_organization_workspace(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.ensure_default_organization_workspace(uuid, text, jsonb)
  to service_role;

commit;
