-- The legacy profile trigger and the workspace provisioning trigger both run
-- on auth.users inserts. Keep the legacy trigger compatible with either order.
begin;

create or replace function public.insert_user_details_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_details (user_id, email, created_at)
  values (new.id, new.email, now())
  on conflict (user_id) do nothing;

  return new;
end;
$$;

commit;
