-- Preserve cached periods outside the snapshot being refreshed.
begin;
create or replace function public.save_report_snapshot(p_kind text,p_rows jsonb,p_current jsonb default null,p_generation bigint default null)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare first_row jsonb; u uuid; o uuid; w uuid; k text; g bigint; done bigint;
  table_name text; columns_sql text; allowed text[]; part jsonb; parts jsonb[]; kinds text[]; i integer; period_filter text;
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
    period_filter:=case kinds[i] when 'monthly' then ' and month_start in (select (r->>''month_start'')::date from jsonb_array_elements($3) r)' when 'breakdown' then ' and month_start in (select (r->>''month_start'')::date from jsonb_array_elements($3) r)' when 'historical' then ' and order_id in (select (r->>''order_id'')::integer from jsonb_array_elements($3) r)' else '' end;
    if w is not null then
      execute format('delete from public.%I where organization_id=$1 and workspace_id=$2%s',table_name,period_filter) using o,w,part;
    else
      execute format('delete from public.%I where user_id=$1 and organization_id is null and workspace_id is null%s',table_name,period_filter) using u,null::uuid,part;
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
commit;
