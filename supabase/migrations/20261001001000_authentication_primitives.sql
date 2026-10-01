begin;
set local lock_timeout = '3s';
create or replace function public.current_session_is_active()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.sessions s join auth.users u on u.id = s.user_id
    where s.id::text = auth.jwt()->>'session_id' and s.user_id = auth.uid()
      and (s.not_after is null or s.not_after > now())
      and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until <= now())
      and not coalesce(u.is_anonymous, false)
  );
$$;
revoke all on function public.current_session_is_active() from public, anon;
grant execute on function public.current_session_is_active() to authenticated, service_role;

create table public.auth_rate_limits (
  bucket_key text primary key,
  attempts integer not null,
  window_started_at timestamptz not null
);
create table public.auth_password_grants (
  token_hash text primary key,
  user_id uuid not null,
  session_id uuid not null,
  purpose text not null check (purpose in ('recovery', 'invite')),
  next_path text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  unique (session_id, purpose)
);
create index auth_rate_limits_window_idx on public.auth_rate_limits(window_started_at);
create index auth_password_grants_expiry_idx on public.auth_password_grants(expires_at);
alter table public.auth_rate_limits enable row level security;
alter table public.auth_password_grants enable row level security;
revoke all on public.auth_rate_limits, public.auth_password_grants from public, anon, authenticated;
grant all on public.auth_rate_limits, public.auth_password_grants to service_role;

create function public.consume_auth_rate_limit(p_key text, p_limit integer, p_seconds integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.auth_rate_limits%rowtype;
begin
  if p_limit < 1 or p_seconds < 1 or length(p_key) <> 64 then raise exception 'Invalid rate limit'; end if;
  -- Bound retention without exposing recipient identifiers.
  delete from public.auth_rate_limits where bucket_key in (select bucket_key from public.auth_rate_limits where window_started_at < now()-interval '2 days' limit 100);
  delete from public.auth_password_grants where token_hash in (select token_hash from public.auth_password_grants where expires_at < now()-interval '1 day' limit 100);
  insert into public.auth_rate_limits values (p_key, 1, clock_timestamp())
  on conflict (bucket_key) do update set
    attempts = case when auth_rate_limits.window_started_at <= clock_timestamp() - make_interval(secs => p_seconds) then 1 else least(auth_rate_limits.attempts::bigint + 1, 2147483647)::integer end,
    window_started_at = case when auth_rate_limits.window_started_at <= clock_timestamp() - make_interval(secs => p_seconds) then clock_timestamp() else auth_rate_limits.window_started_at end
  returning * into r;
  return jsonb_build_object('allowed', r.attempts <= p_limit, 'retry_after', greatest(1, ceil(extract(epoch from r.window_started_at + make_interval(secs => p_seconds) - clock_timestamp()))::integer));
end; $$;
revoke all on function public.consume_auth_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_auth_rate_limit(text, integer, integer) to service_role;

create function public.claim_auth_password_grant(p_hash text, p_user_id uuid, p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g public.auth_password_grants%rowtype;
begin
  if not exists (select 1 from auth.sessions s join auth.users u on u.id=s.user_id where s.id=p_session_id and s.user_id=p_user_id and (s.not_after is null or s.not_after>now()) and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now())) then return null; end if;
  update public.auth_password_grants set consumed_at=now()
  where token_hash=p_hash and user_id=p_user_id and session_id=p_session_id and consumed_at is null and expires_at>now()
  returning * into g;
  if not found then return null; end if;
  return jsonb_build_object('next_path', g.next_path, 'purpose', g.purpose);
end; $$;
revoke all on function public.claim_auth_password_grant(text,uuid,uuid) from public, anon, authenticated;
grant execute on function public.claim_auth_password_grant(text,uuid,uuid) to service_role;
commit;
