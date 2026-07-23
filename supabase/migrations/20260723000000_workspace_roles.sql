-- Workspace role hardening for List Hygiene v2.
--
-- Safe for existing data: this normalizes current workspace_members rows so
-- each workspace has one owner, then enforces that rule for future writes.

begin;

create extension if not exists pgcrypto;

insert into public.workspace_members (
  workspace_id,
  organization_id,
  user_id,
  role
)
select
  w.id,
  w.organization_id,
  coalesce(w.created_by_user_id, fallback_member.user_id),
  'owner'
from public.workspaces w
left join lateral (
  select om.user_id
  from public.organization_members om
  where om.organization_id = w.organization_id
    and om.status = 'active'
  order by
    case om.role when 'owner' then 1 when 'admin' then 2 else 3 end,
    om.created_at asc,
    om.id asc
  limit 1
) fallback_member on true
where not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = w.id
  )
  and coalesce(w.created_by_user_id, fallback_member.user_id) is not null
on conflict (workspace_id, user_id) do update
set
  role = 'owner',
  updated_at = now();

with ranked_members as (
  select
    wm.id,
    wm.role,
    row_number() over (
      partition by wm.workspace_id
      order by
        case when wm.user_id = w.created_by_user_id then 0 else 1 end,
        case wm.role when 'owner' then 1 when 'admin' then 2 else 3 end,
        wm.created_at asc,
        wm.id asc
    ) as owner_rank
  from public.workspace_members wm
  join public.workspaces w on w.id = wm.workspace_id
),
target_roles as (
  select
    id,
    case
      when owner_rank = 1 then 'owner'
      when role = 'owner' then 'admin'
      else role
    end as role
  from ranked_members
  where owner_rank = 1
    or role = 'owner'
)
update public.workspace_members wm
set role = target_roles.role,
    updated_at = now()
from target_roles
where target_roles.id = wm.id
  and wm.role is distinct from target_roles.role;

create unique index if not exists workspace_members_one_owner_per_workspace_idx
  on public.workspace_members (workspace_id)
  where role = 'owner';

create index if not exists workspace_members_workspace_role_idx
  on public.workspace_members (workspace_id, role);

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

create or replace function public.workspace_role(p_workspace_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select wm.role
  from public.workspace_members wm
  join public.organization_members om
    on om.organization_id = wm.organization_id
   and om.user_id = wm.user_id
   and om.status = 'active'
  where wm.workspace_id = p_workspace_id
    and wm.user_id = auth.uid()
  limit 1;
$$;

create or replace function public.can_manage_workspace(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.workspace_role(p_workspace_id) in ('owner', 'admin'), false);
$$;

create or replace function public.can_own_workspace(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.workspace_role(p_workspace_id) = 'owner', false);
$$;

create or replace function public.recalculate_organization_member_role(
  p_organization_id uuid,
  p_user_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
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
      status = 'active',
      updated_at = now()
  where organization_id = p_organization_id
    and user_id = p_user_id;

  return v_role;
end;
$$;

create or replace function public.transfer_workspace_ownership(
  p_workspace_id uuid,
  p_current_owner_user_id uuid,
  p_new_owner_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organization_id uuid;
begin
  if p_current_owner_user_id = p_new_owner_user_id then
    raise exception 'Choose a different workspace admin as the new owner';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_workspace_id::text));

  select organization_id
  into v_organization_id
  from public.workspaces
  where id = p_workspace_id
    and archived_at is null;

  if v_organization_id is null then
    raise exception 'Workspace not found';
  end if;

  if not exists (
    select 1
    from public.workspace_members wm
    join public.organization_members om
      on om.organization_id = wm.organization_id
     and om.user_id = wm.user_id
     and om.status = 'active'
    where wm.workspace_id = p_workspace_id
      and wm.user_id = p_current_owner_user_id
      and wm.role = 'owner'
  ) then
    raise exception 'Only the current workspace owner can transfer ownership';
  end if;

  if not exists (
    select 1
    from public.workspace_members wm
    join public.organization_members om
      on om.organization_id = wm.organization_id
     and om.user_id = wm.user_id
     and om.status = 'active'
    where wm.workspace_id = p_workspace_id
      and wm.user_id = p_new_owner_user_id
      and wm.role = 'admin'
  ) then
    raise exception 'Ownership can only be transferred to an active workspace admin';
  end if;

  update public.workspace_members
  set role = 'admin',
      updated_at = now()
  where workspace_id = p_workspace_id
    and user_id = p_current_owner_user_id
    and role = 'owner';

  update public.workspace_members
  set role = 'owner',
      updated_at = now()
  where workspace_id = p_workspace_id
    and user_id = p_new_owner_user_id
    and role = 'admin';

  perform public.recalculate_organization_member_role(
    v_organization_id,
    p_current_owner_user_id
  );
  perform public.recalculate_organization_member_role(
    v_organization_id,
    p_new_owner_user_id
  );
end;
$$;

revoke all on function public.transfer_workspace_ownership(uuid, uuid, uuid) from public;
revoke all on function public.transfer_workspace_ownership(uuid, uuid, uuid) from anon;
revoke all on function public.transfer_workspace_ownership(uuid, uuid, uuid) from authenticated;
grant execute on function public.transfer_workspace_ownership(uuid, uuid, uuid) to service_role;

drop policy if exists organization_invitations_select_admin on public.organization_invitations;
create policy organization_invitations_select_admin on public.organization_invitations
for select using (
  public.is_organization_member(organization_id)
);

drop policy if exists workspaces_manage_admin on public.workspaces;
create policy workspaces_manage_admin on public.workspaces
for all using (
  public.can_manage_organization(organization_id)
  or public.can_manage_workspace(id)
) with check (
  public.can_manage_organization(organization_id)
  or public.can_manage_workspace(id)
);

drop policy if exists workspace_members_manage_admin on public.workspace_members;
create policy workspace_members_manage_admin on public.workspace_members
for all using (
  public.can_manage_workspace(workspace_id)
) with check (
  public.can_manage_workspace(workspace_id)
);

commit;
