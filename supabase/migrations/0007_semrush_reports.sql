-- Semrush "deep pull" storage.
--
-- The existing metric_snapshots table only holds scalar time-series (one number
-- per metric per date). The full Semrush API returns LIST reports — organic /
-- paid keywords, competitors, backlinks, referring domains, anchors, etc. Each
-- such report is stored here as one row whose `rows` jsonb is the array of
-- records from that report. We keep the latest pull per (client, report_type)
-- via upsert; `meta` carries the source domain, row count, est. units, and any
-- per-report error so a partial pull still records what succeeded.

create table if not exists public.semrush_reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  report_type text not null,           -- 'organic_keywords' | 'backlinks' | 'ref_domains' | ...
  captured_at date not null default current_date,
  pulled_at timestamptz not null default now(),
  rows jsonb not null default '[]'::jsonb,
  row_count integer not null default 0,
  meta jsonb not null default '{}'::jsonb,
  unique (client_id, report_type)
);

create index if not exists semrush_reports_client_idx
  on public.semrush_reports(client_id);

alter table public.semrush_reports enable row level security;

drop policy if exists semrush_reports_admin_all on public.semrush_reports;
create policy semrush_reports_admin_all on public.semrush_reports
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists semrush_reports_client_read on public.semrush_reports;
create policy semrush_reports_client_read on public.semrush_reports
  for select to authenticated
  using (client_id = public.current_client_id());
