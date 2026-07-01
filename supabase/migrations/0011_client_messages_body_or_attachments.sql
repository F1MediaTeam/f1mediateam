-- Allow attachment-only messages. 0009 constrained body to length > 0, which
-- blocked "image or file only" messages that the compose UI now supports.
-- Replace with a compound rule: body OR attachments must be non-empty.
alter table public.client_messages
  drop constraint if exists client_messages_body_check;

alter table public.client_messages
  drop constraint if exists client_messages_body_or_attachments_check;

alter table public.client_messages
  add constraint client_messages_body_or_attachments_check
  check (length(trim(body)) > 0 or jsonb_array_length(attachments) > 0);
