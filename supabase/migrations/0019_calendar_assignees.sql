-- Assignees / cc on calendar events (2026-07-25)
--
-- People (F1 Media admins and/or the client's portal users) attached to an
-- event so it appears in their in-app notification bell. Stored as an array of
-- profile ids on the event; a GIN index keeps the "events assigned to me"
-- lookup fast.

alter table public.calendar_events
  add column if not exists assignee_ids uuid[] not null default '{}';

create index if not exists calendar_events_assignees_idx
  on public.calendar_events using gin (assignee_ids);
