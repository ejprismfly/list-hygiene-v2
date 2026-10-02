begin;
alter table public.stripe_accounts add column last_invoice_created bigint;
alter table public.stripe_webhook_events add column lease_token uuid, add column lease_until timestamptz;
create table public.billing_invoice_effects (
 invoice_id text primary key, stripe_account_id bigint not null, subscription_id text not null,
 old_subscription_id text, cancellation_done boolean not null default false,
 ignored boolean not null default false, created_at timestamptz not null default now()
);
alter table public.billing_invoice_effects enable row level security;
revoke all on public.billing_invoice_effects from public,anon,authenticated;
grant all on public.billing_invoice_effects to service_role;
create function public.claim_billing_event(p_event text,p_type text,p_lease uuid) returns text
language plpgsql security definer set search_path=public,pg_temp as $$
declare e stripe_webhook_events;
begin
 insert into stripe_webhook_events(event_id,event_type,status,lease_token,lease_until)
 values(p_event,p_type,'processing',p_lease,now()+interval '10 minutes') on conflict do nothing;
 select * into e from stripe_webhook_events where event_id=p_event for update;
 if e.status='processed' then return 'processed'; end if;
 if e.lease_token=p_lease then return 'claimed'; end if;
 if e.status='processing' and coalesce(e.lease_until,e.updated_at+interval '10 minutes')>now() then return 'busy'; end if;
 update stripe_webhook_events set status='processing',attempts=attempts+1,lease_token=p_lease,lease_until=now()+interval '10 minutes',error_message=null,updated_at=now() where event_id=p_event;
 return 'claimed';
end $$;
create function public.finish_billing_event(p_event text,p_lease uuid,p_error text default null) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update stripe_webhook_events set status=case when p_error is null then 'processed' else 'failed' end,
 error_message=left(p_error,1000),processed_at=case when p_error is null then now() else null end,
 updated_at=now(),lease_until=null where event_id=p_event and lease_token=p_lease and status='processing';
 return found;
end $$;
create function public.assert_billing_lease(p_event text,p_lease uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform 1 from stripe_webhook_events where event_id=p_event and lease_token=p_lease and status='processing' and lease_until>now() for update;
 if not found then raise exception 'Billing event lease lost'; end if;
end $$;
create function public.apply_billing_invoice(p_event text,p_lease uuid,p_invoice text,p_invoice_created bigint,p_account bigint,p_customer text,p_subscription text,p_reason text,p_period_end timestamptz,p_product text,p_credits integer,p_old_credits integer,p_overage integer)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a stripe_accounts; e billing_invoice_effects; old_sub text; rem integer; used integer; turnover integer; reason text;
begin
 perform assert_billing_lease(p_event,p_lease);
 select * into a from stripe_accounts where id=p_account and customer_id=p_customer for update;
 if not found then raise exception 'Billing account/customer mismatch'; end if;
 select * into e from billing_invoice_effects where invoice_id=p_invoice;
 if found then
   if e.stripe_account_id<>p_account or e.subscription_id<>p_subscription then raise exception 'Invoice effect mismatch'; end if;
   return to_jsonb(e);
 end if;
 if p_invoice='' or p_credits<0 or p_overage<0 or p_reason not in ('subscription_create','subscription_cycle','subscription_update') then raise exception 'Invalid invoice effect'; end if;
 old_sub:=case when a.subscription_id is distinct from p_subscription then a.subscription_id else null end;
 -- Late invoices cannot replace a newer billing period or revive a canceled subscription.
 if (a.last_invoice_created is not null and p_invoice_created<a.last_invoice_created) or (a.reset_date is not null and p_period_end<a.reset_date) or (p_reason='subscription_cycle' and a.subscription_id is distinct from p_subscription and a.reset_date is not null) then
   insert into billing_invoice_effects(invoice_id,stripe_account_id,subscription_id,ignored,cancellation_done) values(p_invoice,p_account,p_subscription,true,true) returning * into e;
   return to_jsonb(e);
 end if;
 rem:=coalesce(a.credits_remaining,0); used:=coalesce(a.credits_used,0); turnover:=0;
 if p_reason='subscription_cycle' then
   insert into credit_history(user_id,organization_id,workspace_id,change,remaining,reason,context) values(a.user_id,a.organization_id,a.workspace_id,-rem,0,'reset',p_invoice);
   rem:=p_credits;used:=0;reason:='renew';
 elsif a.subscription_id is null then rem:=p_credits;used:=0;reason:='new';turnover:=coalesce(a.credits_turnover,0);
 elsif p_credits>p_old_credits then rem:=rem+p_credits;reason:='upgrade';turnover:=coalesce(a.credits_plan,0)+coalesce(a.credits_turnover,0);
 end if;
 update stripe_accounts set last_invoice_created=p_invoice_created,plan_id=p_product,subscription_id=p_subscription,active=true,reset_date=p_period_end,
 credits_plan=p_credits,credits_remaining=rem,credits_used=used,credits_turnover=turnover,
 overage_plan=p_overage,overage_remaining=p_overage,overage_used=0 where id=a.id;
 if reason is not null then insert into credit_history(user_id,organization_id,workspace_id,change,remaining,reason,context) values(a.user_id,a.organization_id,a.workspace_id,p_credits,rem,reason,p_invoice); end if;
 insert into billing_invoice_effects(invoice_id,stripe_account_id,subscription_id,old_subscription_id,cancellation_done) values(p_invoice,a.id,p_subscription,old_sub,old_sub is null) returning * into e;
 return to_jsonb(e);
end $$;
create function public.finish_invoice_cancellation(p_event text,p_lease uuid,p_invoice text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin perform assert_billing_lease(p_event,p_lease); update billing_invoice_effects set cancellation_done=true where invoice_id=p_invoice; end $$;
create function public.apply_subscription_deletion(p_event text,p_lease uuid,p_customer text,p_subscription text,p_account bigint default null) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;
begin
 perform assert_billing_lease(p_event,p_lease);
 update stripe_accounts set active=false,subscription_id=null,credits_plan=0,credits_remaining=0,credits_turnover=0,overage_plan=0,overage_remaining=0,overage_used=0
 where customer_id=p_customer and subscription_id=p_subscription and (p_account is null or id=p_account);
 get diagnostics n=row_count;return n;
end $$;
create function public.replace_payment_method_cache(p_customer text,p_rows jsonb) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if exists(select 1 from jsonb_array_elements(p_rows) r where r->>'customer_id' is distinct from p_customer) then raise exception 'Mixed payment customers'; end if;
 delete from stripe_payment_methods where customer_id=p_customer;
 insert into stripe_payment_methods(customer_id,user_id,organization_id,workspace_id,billing_scope,payment_id,type,brand,last4,exp_month,exp_year,active,is_expired,is_default)
 select customer_id,user_id,organization_id,workspace_id,billing_scope,payment_id,type,brand,last4,exp_month,exp_year,active,is_expired,is_default from jsonb_populate_recordset(null::stripe_payment_methods,p_rows);
end $$;
do $$ declare f regprocedure; begin
 for f in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname in ('claim_billing_event','finish_billing_event','assert_billing_lease','apply_billing_invoice','finish_invoice_cancellation','apply_subscription_deletion','replace_payment_method_cache') loop
 execute format('revoke all on function %s from public,anon,authenticated',f);
 execute format('grant execute on function %s to service_role',f);
 end loop;
end $$;
commit;
