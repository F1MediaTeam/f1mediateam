-- Nestable subfolders for the admin document library (2026-07-23)
--
-- The top-level folders (one per client, plus the shared F1 Media Team folder)
-- stay implicit — they're the client rows and the null-client scope. This adds
-- user-created subfolders beneath them, to any depth, with editable names.

create table if not exists document_folders (
  id         uuid primary key default gen_random_uuid(),
  -- which top-level scope this tree hangs under: null = F1 Media Team folder.
  client_id  uuid references clients(id) on delete cascade,
  -- null = a folder sitting directly under the scope root.
  parent_id  uuid references document_folders(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);

create index if not exists document_folders_scope_idx on document_folders (client_id, parent_id);

alter table document_folders enable row level security;

drop policy if exists document_folders_admin_all on document_folders;
create policy document_folders_admin_all on document_folders
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- A document can now live in a subfolder. Null = the scope root, so every
-- existing document stays exactly where it is. On folder delete the document
-- falls back to the root rather than being destroyed.
alter table documents
  add column if not exists folder_id uuid references document_folders(id) on delete set null;

create index if not exists documents_folder_idx on documents (folder_id);
