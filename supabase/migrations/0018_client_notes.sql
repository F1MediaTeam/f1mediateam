-- Private internal notes on a client (2026-07-23)
--
-- Admin-only free-text scratchpad per client: call notes, account context,
-- renewal reminders. Never surfaced in the client portal — the portal never
-- selects this column, and clients_admin_all keeps writes admin-only.

alter table public.clients
  add column if not exists internal_notes text;

comment on column public.clients.internal_notes is
  'Admin-only internal notes. Not shown anywhere in the client portal.';
