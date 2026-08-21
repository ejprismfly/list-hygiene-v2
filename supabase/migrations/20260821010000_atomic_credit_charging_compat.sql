-- Add atomic, idempotent credit charging without changing existing balances.
-- Existing history is retained and receives derived compatibility fields only.

begin;

alter table public.credit_history
  add column if not exists idempotency_key text,
  add column if not exists credits_delta integer,
  add column if not exists credits_remaining integer,
  add column if not exists source text;

alter table public.stripe_accounts
  add column if not exists updated_at timestamptz not null default now();

update public.credit_history
set
  credits_delta = coalesce(credits_delta, change),
  credits_remaining = coalesce(credits_remaining, remaining)
where (credits_delta is null and change is not null)
   or (credits_remaining is null and remaining is not null);

create unique index if not exists credit_history_idempotency_key_unique
  on public.credit_history (idempotency_key)
  where idempotency_key is not null;

create or replace function public.charge_workspace_credit(
  p_stripe_account_id text,
  p_user_id uuid,
  p_organization_id uuid,
  p_workspace_id uuid,
  p_idempotency_key text,
  p_context text,
  p_klaviyo_account_id uuid
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

  if exists (
    select 1
    from public.credit_history
    where idempotency_key = p_idempotency_key
  ) then
    return query select false, 'duplicate'::text, null::integer;
    return;
  end if;

  if coalesce(account.trial_remaining, 0) > 0 then
    next_remaining := account.trial_remaining - 1;
    charge_reason := 'trial usage';

    update public.stripe_accounts
    set
      trial_remaining = next_remaining,
      trial_used = coalesce(trial_used, 0) + 1,
      updated_at = now()
    where id::text = p_stripe_account_id;

    bucket := 'trial';
  elsif coalesce(account.credits_remaining, 0) > 0 then
    next_remaining := account.credits_remaining - 1;
    charge_reason := 'usage';

    update public.stripe_accounts
    set
      credits_remaining = next_remaining,
      credits_used = coalesce(credits_used, 0) + 1,
      updated_at = now()
    where id::text = p_stripe_account_id;

    bucket := 'plan';
  elsif coalesce(account.overage_remaining, 0) > 0 then
    next_remaining := account.overage_remaining - 1;
    charge_reason := 'overage usage';

    update public.stripe_accounts
    set
      overage_remaining = next_remaining,
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
    klaviyo_account_id,
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
    p_klaviyo_account_id,
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

-- Keep the currently deployed core compatible while the new build rolls out.
create or replace function public.charge_workspace_credit(
  p_stripe_account_id text,
  p_user_id uuid,
  p_organization_id uuid,
  p_workspace_id uuid,
  p_idempotency_key text,
  p_context text
)
returns table(charged boolean, bucket text, remaining integer)
language sql
security definer
set search_path = public
as $$
  select *
  from public.charge_workspace_credit(
    p_stripe_account_id,
    p_user_id,
    p_organization_id,
    p_workspace_id,
    p_idempotency_key,
    p_context,
    null::uuid
  );
$$;

revoke all on function public.charge_workspace_credit(
  text, uuid, uuid, uuid, text, text, uuid
) from public, anon, authenticated;
revoke all on function public.charge_workspace_credit(
  text, uuid, uuid, uuid, text, text
) from public, anon, authenticated;

grant execute on function public.charge_workspace_credit(
  text, uuid, uuid, uuid, text, text, uuid
) to service_role;
grant execute on function public.charge_workspace_credit(
  text, uuid, uuid, uuid, text, text
) to service_role;

notify pgrst, 'reload schema';

commit;
