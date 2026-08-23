-- Repeating calendar events.
--
-- Stored as a rule on the original row, not as hundreds of copies. A weekly
-- standup materialised into rows is a decision you cannot take back: changing
-- the time means finding and rewriting every future copy, and "every Monday
-- forever" has no natural end to stop generating at.
--
-- The cost of a rule is that a query filtering on starts_at no longer finds
-- future occurrences — the row sits at the first one. Expansion therefore
-- happens when the calendar is read, in src/lib/calendar-recurrence.ts.

alter table public.calendar_events
  -- null means it happens once, which is the overwhelming majority.
  add column if not exists recurrence text
    check (recurrence in ('daily', 'weekly', 'biweekly', 'monthly')),

  -- Null means no end date. Expansion is still bounded by the window being
  -- rendered, so this is a real stopping point rather than a safety valve.
  add column if not exists recurrence_until date,

  -- Occurrences that were cancelled individually, as Phoenix calendar dates.
  --
  -- This is how "delete just this one" works without a second table and
  -- without the parent/child bookkeeping that comes with it. Editing a single
  -- occurrence is the same move: skip that date, add a one-off in its place.
  add column if not exists recurrence_skips date[] not null default '{}';

comment on column public.calendar_events.recurrence is
  'How often this repeats. Null for a one-off. Expanded at read time, never materialised into rows.';
comment on column public.calendar_events.recurrence_skips is
  'Phoenix dates on which this occurrence was cancelled.';

-- Finding the repeating events for a window means asking for all of them that
-- could still be running, which is a different question from the date-range
-- scan the calendar does for one-offs.
create index if not exists calendar_events_recurring_idx
  on public.calendar_events (recurrence, starts_at)
  where recurrence is not null;
