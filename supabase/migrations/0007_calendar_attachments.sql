-- F1 Media — Calendar event attachments
--
-- Lets clients (and admins) attach any kind of file — PDFs, spreadsheets,
-- iPhone photos, anything — to a calendar event. Files live in a private
-- Supabase Storage bucket; this table is the join + metadata index.

create table if not exists public.calendar_event_attachments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.calendar_events(id) on delete cascade,
  storage_path text not null,                -- key inside the calendar-attachments bucket
  filename text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists calendar_event_attachments_event_idx
  on public.calendar_event_attachments(event_id);

alter table public.calendar_event_attachments enable row level security;

drop policy if exists calendar_attachments_admin_all on public.calendar_event_attachments;
create policy calendar_attachments_admin_all on public.calendar_event_attachments
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists calendar_attachments_client_rw on public.calendar_event_attachments;
create policy calendar_attachments_client_rw on public.calendar_event_attachments
  for all to authenticated
  using (
    exists (
      select 1 from public.calendar_events e
      where e.id = calendar_event_attachments.event_id
        and e.client_id = public.current_client_id()
    )
  )
  with check (
    exists (
      select 1 from public.calendar_events e
      where e.id = calendar_event_attachments.event_id
        and e.client_id = public.current_client_id()
    )
  );

-- =========================================================
-- Private storage bucket for the actual file bytes.
-- Private (not public) — files are surfaced via signed URLs created
-- server-side after RLS-checking the requesting user.
-- =========================================================
insert into storage.buckets (id, name, public)
values ('calendar-attachments', 'calendar-attachments', false)
on conflict (id) do nothing;

drop policy if exists calendar_attachments_storage_admin on storage.objects;
create policy calendar_attachments_storage_admin on storage.objects
  for all to authenticated
  using (bucket_id = 'calendar-attachments' and public.is_admin())
  with check (bucket_id = 'calendar-attachments' and public.is_admin());

-- Clients can read & write objects under <client_id>/... so each tenant is
-- isolated within the same bucket.
drop policy if exists calendar_attachments_storage_client on storage.objects;
create policy calendar_attachments_storage_client on storage.objects
  for all to authenticated
  using (
    bucket_id = 'calendar-attachments'
    and (storage.foldername(name))[1] = public.current_client_id()::text
  )
  with check (
    bucket_id = 'calendar-attachments'
    and (storage.foldername(name))[1] = public.current_client_id()::text
  );

-- =============================================================
-- Merged from 0007_meetings.sql (same version-prefix collision).
-- =============================================================
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

-- =============================================================
-- Merged from 0007_semrush_reports.sql.
-- =============================================================
-- Semrush "deep pull" storage.
--
-- The existing metric_snapshots table only holds scalar time-series (one number
-- per metric per date). The full Semrush API returns LIST reports — organic /
-- paid keywords, competitors, backlinks, referring domains, anchors, etc. Each
-- such report is stored here as one row whose `rows` jsonb is the array of
-- records from that report. We keep the latest pull per (client, report_type)
-- via upsert; `meta` carries the source domain, row count, est. units, and any
-- per-report error so a partial pull still records what succeeded.

create table if not exists public.semrush_reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  report_type text not null,           -- 'organic_keywords' | 'backlinks' | 'ref_domains' | ...
  captured_at date not null default current_date,
  pulled_at timestamptz not null default now(),
  rows jsonb not null default '[]'::jsonb,
  row_count integer not null default 0,
  meta jsonb not null default '{}'::jsonb,
  unique (client_id, report_type)
);

create index if not exists semrush_reports_client_idx
  on public.semrush_reports(client_id);

alter table public.semrush_reports enable row level security;

drop policy if exists semrush_reports_admin_all on public.semrush_reports;
create policy semrush_reports_admin_all on public.semrush_reports
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists semrush_reports_client_read on public.semrush_reports;
create policy semrush_reports_client_read on public.semrush_reports
  for select to authenticated
  using (client_id = public.current_client_id());
