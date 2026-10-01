begin;
set local lock_timeout = '3s';
CREATE OR REPLACE FUNCTION public.ensure_default_organization_workspace(p_user_id uuid, p_email text, p_metadata jsonb DEFAULT '{}'::jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
    name = coalesce(nullif(public.user_details.name, ''), excluded.name);

  insert into public.organizations (legacy_user_id, owner_user_id, name, slug)
  values (
    p_user_id,
    p_user_id,
    v_name,
    'org-' || replace(p_user_id::text, '-', '')
  )
  on conflict (legacy_user_id) do nothing
  returning id into v_org_id;
  -- Existing organizations may have transferred ownership or disabled members.
  -- Provisioning must never restore a previously removed permission.
  if v_org_id is null then return; end if;

  insert into public.organization_members (organization_id, user_id, role, status)
  values (v_org_id, p_user_id, 'owner', 'active')
  on conflict (organization_id, user_id) do nothing;

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
    insert into public.workspace_members (
      workspace_id,
      organization_id,
      user_id,
      role
    )
    values (v_workspace_id, v_org_id, p_user_id, 'owner')
    on conflict (workspace_id, user_id) do nothing;
  end if;
end;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_organization_member_role(p_organization_id uuid, p_user_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_role text;
begin
  select case min(case wm.role when 'owner' then 1 when 'admin' then 2 else 3 end)
    when 1 then 'owner'
    when 2 then 'admin'
    when 3 then 'member'
    else null
  end
  into v_role
  from public.workspace_members wm
  join public.workspaces w on w.id = wm.workspace_id
  where wm.organization_id = p_organization_id
    and wm.user_id = p_user_id
    and w.archived_at is null;

  if v_role is null then
    return null;
  end if;

  update public.organization_members
  set role = v_role,
      updated_at = now()
  where organization_id = p_organization_id
    and user_id = p_user_id;

  return v_role;
end;
$$;

create function public.accept_organization_invitation(p_hash text, p_user_id uuid, p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare i public.organization_invitations%rowtype; recipient_email text; target uuid; current_status text;
begin
  select u.email into recipient_email from auth.users u join auth.sessions s on s.user_id=u.id
  where u.id=p_user_id and s.id=p_session_id and u.email_confirmed_at is not null
    and (s.not_after is null or s.not_after>now()) and (u.banned_until is null or u.banned_until<=now()) and not coalesce(u.is_anonymous,false);
  if recipient_email is null then raise exception 'Verified session required' using errcode='42501'; end if;
  select * into i from public.organization_invitations where token_hash=p_hash for update;
  if not found then raise exception 'Invitation not found' using errcode='P0002'; end if;
  if lower(trim(i.email))<>lower(trim(recipient_email)) then raise exception 'Invitation recipient mismatch' using errcode='42501'; end if;
  if i.status='accepted' and i.accepted_by_user_id=p_user_id then
    if not exists(select 1 from public.organization_members where organization_id=i.organization_id and user_id=p_user_id and status='active') then raise exception 'Membership unavailable' using errcode='42501'; end if;
    return jsonb_build_object('organization_id', i.organization_id, 'role', i.role, 'workspace_ids', coalesce((select jsonb_agg(wm.workspace_id) from public.workspace_members wm join public.organization_members om on om.organization_id=wm.organization_id and om.user_id=wm.user_id join public.workspaces w on w.id=wm.workspace_id where wm.user_id=p_user_id and om.status='active' and w.archived_at is null and wm.workspace_id=any(i.workspace_ids)), '[]'::jsonb));
  end if;
  if i.status<>'pending' or i.expires_at<=now() then raise exception 'Invitation is expired or unavailable' using errcode='22023'; end if;
  if cardinality(i.workspace_ids)=0 then raise exception 'Invitation has no workspaces' using errcode='22023'; end if;
  -- Lock membership rows so a concurrent disable or permission change is serialized.
  perform 1 from public.organization_members where organization_id=i.organization_id and user_id in (p_user_id,i.invited_by_user_id) order by user_id for update;
  select status into current_status from public.organization_members where organization_id=i.organization_id and user_id=p_user_id;
  if current_status is not null and current_status<>'active' then raise exception 'Membership is disabled' using errcode='42501'; end if;
  foreach target in array i.workspace_ids loop
    perform 1 from public.workspaces where id=target and organization_id=i.organization_id and archived_at is null for share;
    if not found then raise exception 'Workspace unavailable' using errcode='42501'; end if;
    perform 1 from public.workspace_members wm join public.organization_members om on om.organization_id=wm.organization_id and om.user_id=wm.user_id where wm.workspace_id=target and wm.organization_id=i.organization_id and wm.user_id=i.invited_by_user_id and wm.role in ('owner','admin') and om.status='active' for share of wm;
    if not found then raise exception 'Inviter access was removed' using errcode='42501'; end if;
  end loop;
  insert into public.organization_members(organization_id,user_id,role,status,invited_by_user_id)
  values(i.organization_id,p_user_id,i.role,'active',i.invited_by_user_id)
  on conflict(organization_id,user_id) do update set role=case when organization_members.role='owner' then 'owner' when organization_members.role='admin' or excluded.role='admin' then 'admin' else 'member' end;
  foreach target in array i.workspace_ids loop
    insert into public.workspace_members(organization_id,workspace_id,user_id,role) values(i.organization_id,target,p_user_id,i.role)
    on conflict(workspace_id,user_id) do update set role=case when workspace_members.role='owner' then 'owner' when workspace_members.role='admin' or excluded.role='admin' then 'admin' else 'member' end;
  end loop;
  update public.organization_invitations set status='accepted',accepted_by_user_id=p_user_id,accepted_at=now(),updated_at=now() where id=i.id;
  return jsonb_build_object('organization_id',i.organization_id,'role',i.role,'workspace_ids',i.workspace_ids);
end; $$;
revoke all on function public.accept_organization_invitation(text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.accept_organization_invitation(text,uuid,uuid) to service_role;
commit;
