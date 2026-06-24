-- F1 Media — Meetings / client presentation decks
--
-- Each row drives a generated slide deck shown at /admin/meetings/[id]/present.
-- The deck pulls live data (snapshots, posted content, calendar) at render
-- time; the row stores presentation-specific config (title, logo, date range,
-- notes) and acts as the persistent handle for a given client meeting.

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  title text not null,
  scheduled_at timestamptz not null default now(),
  logo_path text,                                -- storage path inside meeting-assets
  range_from date,                               -- slide data window start
  range_to date,                                 -- slide data window end
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meetings_client_id_idx on public.meetings(client_id);
create index if not exists meetings_scheduled_at_idx on public.meetings(scheduled_at desc);

alter table public.meetings enable row level security;

drop policy if exists meetings_admin_all on public.meetings;
create policy meetings_admin_all on public.meetings
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists meetings_client_read on public.meetings;
create policy meetings_client_read on public.meetings
  for select to authenticated
  using (client_id = public.current_client_id());

-- =========================================================
-- Storage bucket for uploaded meeting logos.
-- Public read so the deck can <img> the logo without signing URLs;
-- admin-only writes via RLS on storage.objects.
-- =========================================================
insert into storage.buckets (id, name, public)
values ('meeting-assets', 'meeting-assets', true)
on conflict (id) do nothing;

drop policy if exists meeting_assets_admin_write on storage.objects;
create policy meeting_assets_admin_write on storage.objects
  for all to authenticated
  using (bucket_id = 'meeting-assets' and public.is_admin())
  with check (bucket_id = 'meeting-assets' and public.is_admin());

drop policy if exists meeting_assets_public_read on storage.objects;
create policy meeting_assets_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'meeting-assets');
