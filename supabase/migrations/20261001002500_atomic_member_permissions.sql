begin;
set local lock_timeout='3s';
create function public.manage_workspace_member(p_workspace_id uuid,p_actor_id uuid,p_session_id uuid,p_target_id uuid,p_role text default null,p_status text default null,p_remove boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid; current_role text;
begin
  if p_role is not null and p_role not in ('admin','member') or p_status is not null and p_status not in ('active','disabled') then raise exception 'Invalid membership change' using errcode='22023'; end if;
  if not p_remove and p_role is null and p_status is null then raise exception 'No changes supplied' using errcode='22023'; end if;
  if not exists(select 1 from auth.sessions s join auth.users u on u.id=s.user_id where s.id=p_session_id and s.user_id=p_actor_id and (s.not_after is null or s.not_after>now()) and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now())) then raise exception 'Verified session required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtext(p_workspace_id::text));
  select organization_id into org from public.workspaces where id=p_workspace_id and archived_at is null for update;
  if org is null then raise exception 'Workspace unavailable' using errcode='42501'; end if;
  perform 1 from public.organization_members where organization_id=org and user_id in (p_actor_id,p_target_id) order by user_id for update;
  perform 1 from public.workspace_members wm join public.organization_members om on om.organization_id=wm.organization_id and om.user_id=wm.user_id where wm.workspace_id=p_workspace_id and wm.user_id=p_actor_id and wm.role in ('owner','admin') and om.status='active' for update of wm;
  if not found then raise exception 'Admin access required' using errcode='42501'; end if;
  select role into current_role from public.workspace_members where workspace_id=p_workspace_id and user_id=p_target_id for update;
  if current_role is null then raise exception 'Member not found' using errcode='P0002'; end if;
  if current_role='owner' then raise exception 'Transfer ownership before changing the owner' using errcode='42501'; end if;
  if p_status is not null then
    if exists(select 1 from public.workspace_members wm join public.workspaces w on w.id=wm.workspace_id where wm.organization_id=org and wm.user_id=p_target_id and wm.role='owner' and w.archived_at is null) then raise exception 'Cannot disable an owner' using errcode='42501'; end if;
    if exists(select 1 from public.workspace_members target join public.workspaces w on w.id=target.workspace_id where target.organization_id=org and target.user_id=p_target_id and w.archived_at is null and not exists(select 1 from public.workspace_members actor where actor.workspace_id=target.workspace_id and actor.user_id=p_actor_id and actor.role in ('owner','admin'))) then raise exception 'Admin access required across all affected workspaces' using errcode='42501'; end if;
  end if;
  if current_role='admin' and (p_remove or p_role='member' or p_status='disabled') and not exists(select 1 from public.workspace_members wm join public.organization_members om on om.organization_id=wm.organization_id and om.user_id=wm.user_id where wm.workspace_id=p_workspace_id and wm.user_id<>p_target_id and wm.role in ('owner','admin') and om.status='active') then raise exception 'A workspace manager is required' using errcode='22023'; end if;
  if p_status is not null then update public.organization_members set status=p_status,updated_at=now() where organization_id=org and user_id=p_target_id; end if;
  if p_remove then delete from public.workspace_members where workspace_id=p_workspace_id and user_id=p_target_id;
  elsif p_role is not null then update public.workspace_members set role=p_role,updated_at=now() where workspace_id=p_workspace_id and user_id=p_target_id; end if;
  perform public.recalculate_organization_member_role(org,p_target_id);
  return jsonb_build_object('user_id',p_target_id,'role',coalesce(p_role,current_role),'workspace_ids',array[p_workspace_id],'removed',p_remove);
end; $$;
revoke all on function public.manage_workspace_member(uuid,uuid,uuid,uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.manage_workspace_member(uuid,uuid,uuid,uuid,text,text,boolean) to service_role;
commit;
