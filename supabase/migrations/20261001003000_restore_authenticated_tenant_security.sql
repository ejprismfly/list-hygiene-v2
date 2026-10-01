-- Apply after the compatible authentication web release; never restore anonymous grants.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';
grant usage on schema public to authenticated, service_role;

create or replace function public.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members wm
    join public.organization_members om
      on om.organization_id = wm.organization_id and om.user_id = wm.user_id
    where wm.workspace_id = p_workspace_id and wm.user_id = auth.uid()
      and om.status = 'active' and public.current_session_is_active()
      and exists (select 1 from public.workspaces w where w.id=wm.workspace_id and w.organization_id=wm.organization_id and w.archived_at is null)
  );
$$;

do $$
declare
  table_name text;
  existing_policy record;
begin
  foreach table_name in array array[
    'user_details', 'organizations', 'organization_members', 'workspaces',
    'workspace_members', 'organization_invitations', 'klaviyo_accounts',
    'klaviyo_accounts_directory', 'trial_credit_redemptions', 'emails',
    'bulk_jobs', 'bulk_emails', 'bulk_job_reports', 'stripe_accounts',
    'stripe_payment_methods', 'credit_history', 'email_report_tbl',
    'emails_historical_performance', 'email_usage_monthly',
    'email_usage_breakdown_monthly', 'email_usage_breakdown_colors', 'stripe_webhook_events'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    -- Existing permissive policies combine with OR, so replace this known surface.
    for existing_policy in
      select policyname from pg_policies where schemaname = 'public' and tablename = table_name
    loop
      execute format('drop policy %I on public.%I', existing_policy.policyname, table_name);
    end loop;
    execute format('revoke all on public.%I from public, anon, authenticated', table_name);
    execute format('grant all on public.%I to service_role', table_name);
    if table_name not in ('stripe_webhook_events', 'klaviyo_accounts') then
      execute format('grant select on public.%I to authenticated', table_name);
    end if;
  end loop;
end;
$$;

-- Authentication tokens are server-only, even for workspace members.
do $$
declare readable_columns text;
begin
  select string_agg(quote_ident(column_name), ', ') into readable_columns
  from information_schema.columns
  where table_schema = 'public' and table_name = 'klaviyo_accounts'
    and column_name = any(array['id', 'created_at', 'user_id', 'organization_id',
      'workspace_id', 'created_by_user_id', 'billing_user_id', 'account_details',
      'active', 'segments', 'selected_segment', 'fix_typos', 'full_mailbox_retries',
      'mail_error_retries', 'greylisted_retries', 'exception_occurred_retries',
      'unexpected_error_retries', 'mail_server_temporary_error_retries',
      'connection_name', 'token_expires_in', 'token_scope', 'external_account_id']);
  execute format('grant select (%s) on public.klaviyo_accounts to authenticated', readable_columns);
end;
$$;

create policy user_details_select_own on public.user_details
  for select to authenticated using (user_id = auth.uid());
grant update (name, onboarded) on public.user_details to authenticated;
create policy user_details_update_own on public.user_details
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy organizations_select_member on public.organizations
  for select to authenticated using (public.is_organization_member(id));
create policy organization_members_select_member on public.organization_members
  for select to authenticated using (user_id = auth.uid() or public.can_manage_organization(organization_id));
create policy workspaces_select_member on public.workspaces
  for select to authenticated using (public.is_workspace_member(id));
create policy workspace_members_select_member on public.workspace_members
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy organization_invitations_select_admin on public.organization_invitations
  for select to authenticated using (
    public.can_manage_organization(organization_id)
    and not exists (select 1 from unnest(workspace_ids) wid where not public.can_manage_workspace(wid))
  );
create policy klaviyo_accounts_directory_select_own on public.klaviyo_accounts_directory
  for select to authenticated using (user_id = auth.uid());

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'klaviyo_accounts', 'trial_credit_redemptions', 'emails', 'bulk_jobs',
    'bulk_emails', 'credit_history', 'email_report_tbl', 'stripe_accounts',
    'emails_historical_performance', 'email_usage_monthly', 'email_usage_breakdown_monthly'
  ] loop
    execute format('create policy tenant_select on public.%I for select to authenticated using (
      public.is_workspace_member(workspace_id)
      or (workspace_id is null and user_id::text = auth.uid()::text))', table_name);
  end loop;
end;
$$;
create policy bulk_job_reports_select_member on public.bulk_job_reports
  for select to authenticated using (
    public.is_workspace_member(workspace_id)
    or (workspace_id is null and exists (
      select 1 from public.bulk_jobs j where j.id = bulk_job_id and j.user_id::text = auth.uid()::text
    ))
  );
create policy stripe_payment_methods_select_admin on public.stripe_payment_methods
  for select to authenticated using (
    public.can_manage_workspace(workspace_id)
    or (workspace_id is null and user_id = auth.uid())
  );
create policy report_colors_select on public.email_usage_breakdown_colors
  for select to authenticated using (true);

revoke all on all sequences in schema public from anon, authenticated;
grant usage, select on all sequences in schema public to service_role;
revoke create on schema public from public, anon, authenticated;

-- Parameterized internal operations must not be callable as a different user.
revoke all on function public.transfer_workspace_ownership(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.recalculate_organization_member_role(uuid, uuid) from public, anon, authenticated;
grant execute on function public.transfer_workspace_ownership(uuid, uuid, uuid) to service_role;
grant execute on function public.recalculate_organization_member_role(uuid, uuid) to service_role;

do $$
declare owner_role text;
begin
  foreach owner_role in array array['postgres', 'supabase_admin'] loop
    if exists (select 1 from pg_roles where rolname = owner_role)
       and pg_has_role(current_user, owner_role, 'MEMBER') then
      execute format('alter default privileges for role %I in schema public revoke all on tables from public, anon, authenticated', owner_role);
      execute format('alter default privileges for role %I in schema public revoke all on sequences from public, anon, authenticated', owner_role);
      execute format('alter default privileges for role %I in schema public revoke execute on functions from public, anon, authenticated', owner_role);
    end if;
  end loop;
end;
$$;

-- A revoked session must lose direct PostgREST access as well as app access.
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname='public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
    execute format('revoke all on public.%I from public, anon', t.tablename);
    execute format('create policy active_verified_session on public.%I as restrictive for all to authenticated using (public.current_session_is_active()) with check (public.current_session_is_active())', t.tablename);
  end loop;
end $$;
-- Restrict every application RPC by default; extension-owned functions are excluded.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.signature);
    execute format('grant execute on function %s to service_role', f.signature);
  end loop;
end $$;
grant execute on function public.current_session_is_active(), public.is_workspace_member(uuid),
  public.is_organization_member(uuid), public.organization_role(uuid), public.workspace_role(uuid),
  public.can_manage_organization(uuid), public.can_manage_workspace(uuid), public.can_own_workspace(uuid)
  to authenticated;
create or replace function public.workspace_role(p_workspace_id uuid)
returns text language sql stable security definer set search_path='' as $$
  select wm.role from public.workspace_members wm
  join public.organization_members om on om.organization_id=wm.organization_id and om.user_id=wm.user_id
  join public.workspaces w on w.id=wm.workspace_id and w.organization_id=wm.organization_id
  where wm.workspace_id=p_workspace_id and wm.user_id=auth.uid()
    and om.status='active' and w.archived_at is null and public.current_session_is_active() limit 1;
$$;
create or replace function public.organization_role(p_organization_id uuid)
returns text language sql stable security definer set search_path='' as $$
  select role from public.organization_members where organization_id=p_organization_id
    and user_id=auth.uid() and status='active' and public.current_session_is_active() limit 1;
$$;
notify pgrst, 'reload schema';
commit;
