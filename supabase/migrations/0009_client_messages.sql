-- Two-way messaging between a client-portal user and the F1 Media admin.
-- Rows are keyed to the client company (client_id) so any customer-side user
-- on the same account sees the same thread. read_at is stamped when the
-- opposite-role reader first opens the thread; unread counts are derived off
-- (from_role, read_at is null).
create table if not exists public.client_messages (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete cascade,
  from_user_id  uuid references public.profiles(id) on delete set null,
  from_role     text not null check (from_role in ('client', 'admin')),
  body          text not null check (length(trim(body)) > 0),
  created_at    timestamptz not null default now(),
  read_at       timestamptz
);

create index if not exists client_messages_client_id_created_at_idx
  on public.client_messages (client_id, created_at desc);
create index if not exists client_messages_unread_idx
  on public.client_messages (client_id, from_role) where read_at is null;

-- Server actions do their own auth via requireClient / requireAdmin and go
-- through the service role, so RLS just needs a deny-by-default with admin
-- escape hatch for defense in depth. Nothing on the PostgREST surface should
-- read/write this table without going through a server action.
alter table public.client_messages enable row level security;

drop policy if exists client_messages_admin_all on public.client_messages;
create policy client_messages_admin_all on public.client_messages
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
