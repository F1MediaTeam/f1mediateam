-- Admin document library (2026-07-23)
--
-- Folders of stored documents — pricing sheets, tier breakdowns, signed and
-- unsigned contracts — one folder per client plus a shared F1 Media Team
-- folder (client_id null). Admin-only: nothing here is exposed in the client
-- portal.

create table if not exists documents (
  id           uuid primary key default gen_random_uuid(),
  -- null = the shared "F1 Media Team" folder; otherwise the owning client.
  client_id    uuid references clients(id) on delete cascade,
  filename     text not null,
  storage_path text not null,          -- key inside the 'documents' bucket
  mime_type    text,
  size_bytes   bigint,
  -- flipped from the UI; lets a signed copy sit beside its draft in one folder.
  signed       boolean not null default false,
  uploaded_by  uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists documents_client_idx on documents (client_id, created_at desc);

alter table documents enable row level security;

-- Admins only, both folders. Clients never query this table.
drop policy if exists documents_admin_all on documents;
create policy documents_admin_all on documents
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Private bucket for the bytes. Dedicated (not the shared client-attachments
-- bucket) so it's unambiguously admin-only — surfaced via server-signed URLs.
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

drop policy if exists documents_storage_admin on storage.objects;
create policy documents_storage_admin on storage.objects
  for all to authenticated
  using (bucket_id = 'documents' and public.is_admin())
  with check (bucket_id = 'documents' and public.is_admin());
