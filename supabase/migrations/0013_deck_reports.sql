-- Deck Studio history: persist each generated deck's editable content JSON
-- alongside the rendered .pptx, so past decks can be reopened, re-rendered,
-- and the NEXT deck can review the prior one's commitments ("since our last
-- meeting"). The .pptx binary stays in storage (client-attachments) — this
-- row is the editable source of truth + the meeting-timeline handle.

create table if not exists public.deck_reports (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete cascade,
  report_type   text not null default 'monthly',   -- weekly|monthly|quarterly|yearly|custom
  period_from   date,
  period_to     date,
  meeting_date  date,
  content       jsonb not null,                    -- MonthlyContent (data: URIs stripped)
  pptx_path     text,                              -- storage path of the rendered .pptx
  created_at    timestamptz not null default now()
);

create index if not exists deck_reports_client_created_idx
  on public.deck_reports (client_id, created_at desc);

-- Server routes authorize via getSession()+admin check and use the service
-- role; RLS is deny-by-default with the admin escape hatch for parity with
-- client_messages (0009).
alter table public.deck_reports enable row level security;

drop policy if exists deck_reports_admin_all on public.deck_reports;
create policy deck_reports_admin_all on public.deck_reports
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
