-- Only for the isolated PostgreSQL rehearsal, never a Supabase migration.
do $$ begin
  if current_database() not like 'lh_rehearsal%' then
    raise exception 'This fixture requires an lh_rehearsal database';
  end if;
end $$;
do $$ declare role_name text; begin
  foreach role_name in array array['anon', 'authenticated', 'service_role', 'authenticator', 'supabase_admin'] loop
    if not exists (select 1 from pg_roles where rolname = role_name) then
      execute format('create role %I', role_name);
    end if;
  end loop;
  alter role service_role bypassrls;
end $$;
create schema auth;
create schema extensions;
create extension if not exists pgcrypto with schema extensions;
create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  email_confirmed_at timestamptz,
  banned_until timestamptz,
  is_anonymous boolean default false,
  last_sign_in_at timestamptz
);
create table auth.sessions(id uuid primary key,user_id uuid not null,not_after timestamptz);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to service_role;
drop schema public;
