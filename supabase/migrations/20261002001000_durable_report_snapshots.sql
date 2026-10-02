begin;

-- Replace only legacy primary keys. Never cascade or rewrite customer rows.
do $$
declare t text; pk record;
begin
  foreach t in array array['email_report_tbl','email_usage_monthly','email_usage_breakdown_monthly'] loop
    select c.conname, array_agg(a.attname order by k.ordinality) cols into pk
    from pg_constraint c cross join lateral unnest(c.conkey) with ordinality k(attnum,ordinality)
    join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum
    where c.conrelid=('public.'||t)::regclass and c.contype='p' group by c.conname;
    if pk.cols is null then raise exception 'Missing report primary key: %',t; end if;
    if 'user_id'=any(pk.cols) then
      execute format('alter table public.%I add column report_id uuid not null default gen_random_uuid()',t);
      execute format('alter table public.%I drop constraint %I',t,pk.conname);
      execute format('alter table public.%I add primary key(report_id)',t);
    end if;
  end loop;
end $$;

-- These indexes abort the migration if existing workspace snapshots are ambiguous.
create unique index report_current_scope on public.email_report_tbl(organization_id,workspace_id) where organization_id is not null and workspace_id is not null;
create unique index report_historical_scope on public.emails_historical_performance(organization_id,workspace_id,order_id) where organization_id is not null and workspace_id is not null;
create unique index report_monthly_scope on public.email_usage_monthly(organization_id,workspace_id,month_start) where organization_id is not null and workspace_id is not null;
create unique index report_breakdown_scope on public.email_usage_breakdown_monthly(organization_id,workspace_id,month_start,metric,key) where organization_id is not null and workspace_id is not null;

create table public.report_refresh_state (
  id text primary key,
  scope_key text not null unique,
  user_id uuid not null,
  organization_id uuid,
  workspace_id uuid,
  period_key text not null default to_char(now(),'YYYY-MM'),
  generation bigint not null default 1,
  historical_generation bigint not null default 0,
  monthly_generation bigint not null default 0,
  breakdown_generation bigint not null default 0,
  pending boolean generated always as (least(historical_generation,monthly_generation,breakdown_generation)<generation) stored,
  updated_at timestamptz not null default now(),
  check ((organization_id is null)=(workspace_id is null))
);
alter table public.report_refresh_state enable row level security;
revoke all on public.report_refresh_state from public,anon,authenticated;
grant all on public.report_refresh_state to service_role;

create function public.request_report_refresh(p_user uuid,p_org uuid,p_workspace uuid,p_force boolean default false)
returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare k text; g bigint;
begin
  if p_user is null or (p_org is null)<>(p_workspace is null) then raise exception 'Invalid report scope'; end if;
  k:=case when p_workspace is not null then 'workspace:'||p_org||':'||p_workspace else 'user:'||p_user end;
  insert into report_refresh_state(id,scope_key,user_id,organization_id,workspace_id)
  values(k,k,p_user,p_org,p_workspace)
  on conflict(id) do update set generation=report_refresh_state.generation+case when p_force or report_refresh_state.period_key<>to_char(now(),'YYYY-MM') then 1 else 0 end,
    period_key=to_char(now(),'YYYY-MM'), updated_at=case when p_force then now() else report_refresh_state.updated_at end
  returning generation into g;
  return g;
end $$;

create function public.mark_email_report_dirty() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if TG_OP<>'INSERT' then
    perform request_report_refresh(old.user_id,old.organization_id,old.workspace_id,true);
  end if;
  if TG_OP<>'DELETE' and (TG_OP='INSERT' or
    (new.user_id,new.organization_id,new.workspace_id) is distinct from (old.user_id,old.organization_id,old.workspace_id)) then
    perform request_report_refresh(new.user_id,new.organization_id,new.workspace_id,true);
  end if;
  return null;
end $$;
create trigger durable_report_refresh after insert or update or delete on public.emails for each row execute function public.mark_email_report_dirty();

-- Atomically replace a complete snapshot and acknowledge its source generation.
-- Row fields are limited to an explicit allowlist, never caller-selected SQL.
create function public.save_report_snapshot(p_kind text,p_rows jsonb,p_current jsonb default null,p_generation bigint default null)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare first_row jsonb; u uuid; o uuid; w uuid; k text; g bigint; done bigint;
  table_name text; columns_sql text; allowed text[]; part jsonb; parts jsonb[]; kinds text[]; i integer;
begin
  if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)=0 then raise exception 'Empty report snapshot'; end if;
  first_row:=p_rows->0; u:=(first_row->>'user_id')::uuid; o:=(first_row->>'organization_id')::uuid; w:=(first_row->>'workspace_id')::uuid;
  g:=request_report_refresh(u,o,w,false);
  k:=case when w is not null then 'workspace:'||o||':'||w else 'user:'||u end;
  select case p_kind when 'historical' then historical_generation when 'monthly' then monthly_generation when 'breakdown' then breakdown_generation else 0 end
    into done from report_refresh_state where id=k for update;
  if p_generation is not null and (p_generation>g or p_generation<done) then raise exception 'Stale or invalid report generation'; end if;
  parts:=array[p_rows]; kinds:=array[p_kind];
  if p_kind='historical' then
    if p_current is null or jsonb_array_length(p_rows)<>12 then raise exception 'Historical bundle requires 12 months and current snapshot'; end if;
    parts:=parts||array[jsonb_build_array(p_current)]; kinds:=kinds||array['current'];
  end if;
  for i in 1..array_length(parts,1) loop
    part:=parts[i];
    if exists(select 1 from jsonb_array_elements(part) r where
      (r->>'user_id')::uuid is distinct from u or (r->>'organization_id')::uuid is distinct from o or (r->>'workspace_id')::uuid is distinct from w) then raise exception 'Mixed report scopes'; end if;
    case kinds[i]
      when 'historical' then table_name:='emails_historical_performance'; allowed:=array['order_id','month','year','key','start','end','valid','invalid','risky','restricted'];
      when 'current' then table_name:='email_report_tbl'; allowed:=array['total_count','valid_count','invalid_count','risky_count','restricted_count','suppressed_count'];
      when 'monthly' then table_name:='email_usage_monthly'; allowed:=array['month_start','valid_count','invalid_count','risky_count','restricted_count','suppressed_count','sort_idx'];
      when 'breakdown' then table_name:='email_usage_breakdown_monthly'; allowed:=array['month_start','metric','key','count','sort_idx','color_hex'];
      else raise exception 'Invalid report kind';
    end case;
    allowed:=array['user_id','organization_id','workspace_id']||allowed;
    if exists(select 1 from jsonb_array_elements(part) r cross join lateral jsonb_object_keys(r) f where not f=any(allowed)) then raise exception 'Invalid report field'; end if;
    select string_agg(format('%I',f),',') into columns_sql from jsonb_object_keys(part->0) f;
    if w is not null then
      execute format('delete from public.%I where organization_id=$1 and workspace_id=$2',table_name) using o,w;
    else
      execute format('delete from public.%I where user_id=$1 and organization_id is null and workspace_id is null',table_name) using u;
    end if;
    execute format('insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I,$1)',table_name,columns_sql,columns_sql,table_name) using part;
  end loop;
  if p_generation is not null then
    update report_refresh_state set
      historical_generation=case when p_kind='historical' then greatest(historical_generation,p_generation) else historical_generation end,
      monthly_generation=case when p_kind='monthly' then greatest(monthly_generation,p_generation) else monthly_generation end,
      breakdown_generation=case when p_kind='breakdown' then greatest(breakdown_generation,p_generation) else breakdown_generation end
    where id=k;
  end if;
  return true;
end $$;
revoke all on function public.request_report_refresh(uuid,uuid,uuid,boolean),public.save_report_snapshot(text,jsonb,jsonb,bigint),public.mark_email_report_dirty() from public,anon,authenticated;
grant execute on function public.request_report_refresh(uuid,uuid,uuid,boolean),public.save_report_snapshot(text,jsonb,jsonb,bigint) to service_role;
-- Only active scopes are automatically rebuilt; inactive historical recovery is reviewed.
select public.request_report_refresh(user_id,organization_id,workspace_id,false) from public.klaviyo_accounts where active=true;
commit;
