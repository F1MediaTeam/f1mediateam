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
