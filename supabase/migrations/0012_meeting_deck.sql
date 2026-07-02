-- Meetings: persist a customized slide deck.
--
-- `deck` is null until the admin edits the auto-generated deck; once set it
-- becomes the source of truth for /admin/meetings/[id] + /present (the live
-- buildDeck() output is the fallback). "Reset to live data" nulls it again.
-- Stored as the serializable Slide[] union from src/lib/slides.ts.

alter table public.meetings
  add column if not exists deck jsonb,
  add column if not exists deck_updated_at timestamptz;

comment on column public.meetings.deck is
  'Customized Slide[] snapshot (src/lib/slides.ts). Null = render live deck.';
