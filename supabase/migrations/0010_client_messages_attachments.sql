-- Add attachment support to client_messages.
-- attachments is a JSONB array of {path, name, mime_type, size} objects.
-- Files themselves live in the client-attachments storage bucket under
-- messages/<client_id>/<message_id or uuid>/<filename>.
alter table public.client_messages
  add column if not exists attachments jsonb not null default '[]'::jsonb;
