begin;
create table public.processing_release_cutoff(id boolean primary key default true check(id), released_at timestamptz not null default now());
insert into public.processing_release_cutoff(released_at) values(coalesce(nullif(current_setting('list_hygiene.processing_release_cutoff',true),'')::timestamptz,now()));
create table public.integration_scan_checkpoints (
 account_id uuid not null, scope_key text not null, successful_through timestamptz not null,
 primary key(account_id,scope_key)
);
insert into public.integration_scan_checkpoints(account_id,scope_key,successful_through)
select a.id,coalesce(a.selected_segment->>'id','all'),c.released_at from public.klaviyo_accounts a cross join public.processing_release_cutoff c;
create function public.get_scan_checkpoint(p_account uuid,p_scope text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare result timestamptz;
begin
 insert into integration_scan_checkpoints(account_id,scope_key,successful_through)
 select a.id,p_scope,greatest(a.created_at,c.released_at) from klaviyo_accounts a cross join processing_release_cutoff c where a.id=p_account and a.active
 on conflict do nothing;
 select successful_through into result from integration_scan_checkpoints where account_id=p_account and scope_key=p_scope;
 if result is null then raise exception 'Missing active scan account'; end if;
 return jsonb_build_object('through',result,'floor',(select released_at from processing_release_cutoff));
end $$;
create function public.commit_scan_checkpoint(p_account uuid,p_scope text,p_through timestamptz) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update integration_scan_checkpoints set successful_through=greatest(successful_through,p_through)
 where account_id=p_account and scope_key=p_scope and exists(select 1 from klaviyo_accounts a where a.id=p_account and a.active and coalesce(a.selected_segment->>'id','all')=p_scope);
 if not found then raise exception 'Scan account scope changed'; end if; return true;
end $$;
-- Abort rather than discard duplicate customer rows.
alter table public.bulk_emails add column source_profile_id text;
update public.bulk_emails set source_profile_id=profile_id;
create function public.preserve_bulk_source_profile() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if TG_OP='INSERT' then new.source_profile_id:=coalesce(new.source_profile_id,new.profile_id);
 elsif new.source_profile_id is distinct from old.source_profile_id then raise exception 'Bulk source identity is immutable'; end if;
 return new;
end $$;
create trigger preserve_bulk_source_profile before insert or update on public.bulk_emails for each row execute function public.preserve_bulk_source_profile();
alter table public.bulk_emails alter column source_profile_id set not null;
create unique index bulk_email_profile_identity on public.bulk_emails(bulk_job_id,source_profile_id);
create table public.bulk_report_refresh_state (
 bulk_job_id uuid primary key, generation bigint not null default 1, completed_generation bigint not null default 0
);
create function public.mark_bulk_report_dirty() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into bulk_report_refresh_state(bulk_job_id) values(case when TG_OP='DELETE' then old.bulk_job_id else new.bulk_job_id end)
 on conflict(bulk_job_id) do update set generation=bulk_report_refresh_state.generation+1;
 return null;
end $$;
create trigger durable_bulk_report_refresh after insert or update or delete on public.bulk_emails for each row execute function public.mark_bulk_report_dirty();
create function public.reconcile_bulk_job(p_job uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare j bulk_jobs; n integer; total integer; pending integer; g bigint; done bigint;
begin
 select * into j from bulk_jobs where id=p_job for update;
 if not found then raise exception 'Missing bulk job'; end if;
 select count(distinct source_profile_id),count(distinct source_profile_id) filter(where tagged),count(*) filter(where not coalesce(tagged,false)) into total,n,pending from bulk_emails where bulk_job_id=p_job;
 if total>j.profile_count then raise exception 'Bulk profile count exceeds invoice snapshot'; end if;
 update bulk_jobs set processed_count=n,
 status=case when total=j.profile_count and pending=0 then 'completed' else status end,
 completed_at=case when total=j.profile_count and pending=0 then coalesce(completed_at,now()) else completed_at end where id=p_job;
 insert into bulk_report_refresh_state(bulk_job_id) values(p_job) on conflict do nothing;
 select generation,completed_generation into g,done from bulk_report_refresh_state where bulk_job_id=p_job;
 return jsonb_build_object('newCount',n,'profileCount',j.profile_count,'isComplete',total=j.profile_count and pending=0,'generation',g,'reportsPending',g>done);
end $$;
create function public.request_bulk_report_refresh(p_job uuid) returns bigint
language plpgsql security definer set search_path=public,pg_temp as $$
declare g bigint;
begin
 if not exists(select 1 from bulk_jobs where id=p_job) then raise exception 'Missing bulk job'; end if;
 insert into bulk_report_refresh_state(bulk_job_id) values(p_job) on conflict(bulk_job_id) do update set generation=bulk_report_refresh_state.generation+1 returning generation into g;
 return g;
end $$;
create function public.get_pending_bulk_report_jobs() returns table(bulk_job_id uuid)
language sql security definer set search_path=public,pg_temp as $$
 select s.bulk_job_id from bulk_report_refresh_state s join bulk_jobs j on j.id=s.bulk_job_id
 where s.generation>s.completed_generation and j.status in ('processing','completed')
 order by s.bulk_job_id;
$$;
create function public.save_bulk_report_bundle(p_job uuid,p_generation bigint,p_rows jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare j bulk_jobs; done bigint; g bigint; v integer;
begin
 select * into j from bulk_jobs where id=p_job for update;
 if not found then raise exception 'Missing bulk job'; end if;
 select completed_generation,generation into done,g from bulk_report_refresh_state where bulk_job_id=p_job for update;
 if done is null or p_generation>g then raise exception 'Invalid bulk report generation'; end if;
 if p_generation<=done then return '[]'::jsonb; end if;
 if jsonb_array_length(p_rows)<>8 or (select count(distinct r->>'report_type') from jsonb_array_elements(p_rows) r)<>8 or exists(select 1 from jsonb_array_elements(p_rows) r where r->>'report_type' not in ('summary','status_breakdown','detailed_breakdown','actionable_lists','domain_analysis','retry_analysis','cost_breakdown','timeline')) then raise exception 'Incomplete report bundle'; end if;
 select coalesce(max(version),0)+1 into v from bulk_job_reports where bulk_job_id=p_job;
 insert into bulk_job_reports(bulk_job_id,organization_id,workspace_id,report_type,version,data)
 select p_job,j.organization_id,j.workspace_id,r->>'report_type',v,r->'data' from jsonb_array_elements(p_rows) r;
 update bulk_report_refresh_state set completed_generation=p_generation where bulk_job_id=p_job;
 return (select jsonb_agg(jsonb_build_object('type',r->>'report_type','version',v)) from jsonb_array_elements(p_rows) r);
end $$;
do $$ declare t text; f regprocedure; begin
 foreach t in array array['processing_release_cutoff','integration_scan_checkpoints','bulk_report_refresh_state'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
 for f in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname in ('get_scan_checkpoint','commit_scan_checkpoint','mark_bulk_report_dirty','preserve_bulk_source_profile','reconcile_bulk_job','get_pending_bulk_report_jobs','request_bulk_report_refresh','save_bulk_report_bundle') loop
 execute format('revoke all on function %s from public,anon,authenticated',f);
 execute format('grant execute on function %s to service_role',f);
 end loop;
end $$;
commit;
