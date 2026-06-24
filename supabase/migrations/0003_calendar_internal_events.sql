-- Allow admin-only ("F1 Media internal") calendar events that aren't tied to a
-- client. RLS already lets admins insert/read any row and only lets a client
-- read rows matching their own client_id, so a NULL client_id is invisible to
-- clients and fully visible to admins — we just need to drop the NOT NULL.
alter table public.calendar_events alter column client_id drop not null;
