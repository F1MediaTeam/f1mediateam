-- Allow admin-only ("F1 Media internal") calendar events that aren't tied to a
-- client. RLS already lets admins insert/read any row and only lets a client
-- read rows matching their own client_id, so a NULL client_id is invisible to
-- clients and fully visible to admins — we just need to drop the NOT NULL.
alter table public.calendar_events alter column client_id drop not null;

-- =============================================================
-- Merged from 0003_profile_bootstrap.sql — the Supabase migration
-- history keys on the numeric version prefix, so two 0003 files
-- can never both be recorded. Contents are fully idempotent.
-- =============================================================
-- Auto-create a public.profiles row whenever a new auth.users is inserted.
-- The first user ever signed up becomes admin; subsequent users default
-- to client with no client_id and must be assigned by the admin.

create or replace function public.tg_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_count int;
  full_name_meta text;
begin
  select count(*) into admin_count from public.profiles where role = 'admin';

  -- Try to read a display name out of the auth metadata.
  full_name_meta := coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    null
  );

  insert into public.profiles (id, role, client_id, email, full_name)
  values (
    new.id,
    case when admin_count = 0 then 'admin'::public.user_role else 'client'::public.user_role end,
    null,
    new.email,
    full_name_meta
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.tg_handle_new_user();

-- The client_must_have_client_id check on profiles allows admin rows without
-- a client_id but requires client rows to have one. New signups will be
-- "client" role but without client_id, which violates that constraint.
-- Loosen the check so unassigned clients can exist until an admin assigns them.
alter table public.profiles drop constraint if exists client_must_have_client_id;
