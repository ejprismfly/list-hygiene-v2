begin;

create or replace function public.ensure_default_organization_workspace(
  p_user_id uuid,
  p_email text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
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
  on conflict (legacy_user_id) do update
  set
    owner_user_id = excluded.owner_user_id,
    name = coalesce(nullif(public.organizations.name, ''), excluded.name),
    updated_at = now()
  returning id into v_org_id;

  insert into public.organization_members (organization_id, user_id, role, status)
  values (v_org_id, p_user_id, 'owner', 'active')
  on conflict (organization_id, user_id) do update
  set role = 'owner', status = 'active', updated_at = now();

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
    on conflict (workspace_id, user_id) do update
    set role = 'owner', updated_at = now();
  end if;
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_default_organization_workspace(
    new.id,
    new.email,
    new.raw_user_meta_data
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_list_hygiene on auth.users;
create trigger on_auth_user_created_list_hygiene
after insert on auth.users
for each row execute function public.handle_new_auth_user();

revoke all on function public.ensure_default_organization_workspace(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.ensure_default_organization_workspace(uuid, text, jsonb)
  to service_role;

commit;
