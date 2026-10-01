-- Local schema-only rehearsal: load after the public schema snapshot.
do $$ begin
  if current_database() not like 'lh_rehearsal%' then raise exception 'Rehearsal database required'; end if;
end $$;
create trigger on_auth_user_created_list_hygiene after insert on auth.users for each row execute function public.handle_new_auth_user();
create trigger on_user_signup after insert on auth.users for each row execute function public.insert_user_details_on_signup();
