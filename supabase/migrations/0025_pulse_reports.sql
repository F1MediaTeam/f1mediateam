-- F1 Pulse — Report Center (2026-08-11)
--
-- Generated PDF reports, the agency profile that stamps their running header,
-- and the per-client brand terms that make the branded/non-branded split
-- correct rather than a guess.

-- =========================================================
-- pulse_agency_profile — one row, powering every report header
-- =========================================================
-- A table rather than env vars: this is content the agency edits from Settings,
-- not configuration a deploy owns. Every field is optional and an empty one
-- simply doesn't render, so the header degrades rather than showing a blank.
create table if not exists public.pulse_agency_profile (
  id           integer primary key default 1 check (id = 1),
  name         text not null default 'F1 Media Team',
  website      text,
  email        text,
  phone        text,
  address_1    text,
  address_2    text,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references public.profiles(id) on delete set null
);

insert into public.pulse_agency_profile (id, name, website)
values (1, 'F1 Media Team', 'f1mediateam.com')
on conflict (id) do nothing;

-- =========================================================
-- Brand terms — the branded vs non-branded split
-- =========================================================
-- Without these, every Search Console query counts as non-branded and a report
-- overstates how much new business SEO is producing. Stored per site as plain
-- lowercase fragments, matched as substrings against the query.
--
-- Ultimate Asset Protection is the case that proves the need: the firm trades
-- as Skabelund PLLC, so a large share of its branded searches never contain
-- the marketing name at all.
alter table public.pulse_sites
  add column if not exists brand_terms text[] not null default '{}';

comment on column public.pulse_sites.brand_terms is
  'Lowercase fragments identifying branded search queries. Substring-matched. Include trading names and partner surnames, not just the marketing name.';

-- =========================================================
-- pulse_reports — one row per generated document
-- =========================================================
create table if not exists public.pulse_reports (
  id           uuid primary key default gen_random_uuid(),
  -- nullable: a Domain Overview can be generated for a competitor, which has
  -- no site and no client.
  site_id      uuid references public.pulse_sites(id) on delete cascade,
  domain       text not null,
  template     text not null check (template in (
                 'monthly', 'domain_overview', 'rankings', 'site_audit',
                 'backlinks', 'ai_visibility', 'traffic', 'competitors')),
  range_label  text not null,
  range_from   date not null,
  range_to     date not null,
  cover_style  text not null default 'light' check (cover_style in ('light', 'dark')),
  status       text not null default 'queued'
                 check (status in ('queued', 'rendering', 'ready', 'failed')),
  storage_path text,
  -- CSV companions for tables the PDF truncated
  csv_paths    jsonb not null default '[]'::jsonb,
  file_size    bigint,
  -- true when any figure came from mock data; drives the SAMPLE watermark, and
  -- is recorded so a sample can never be mistaken for a deliverable later
  mocked       boolean not null default false,
  notes        text,
  error        text,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists pulse_reports_site_idx on public.pulse_reports (site_id, created_at desc);
create index if not exists pulse_reports_status_idx on public.pulse_reports (status) where status in ('queued', 'rendering');
create index if not exists pulse_reports_recent_idx on public.pulse_reports (created_at desc);

-- =========================================================
-- RLS — default deny, matching every other pulse table
-- =========================================================
do $$
declare t text;
begin
  foreach t in array array['pulse_reports', 'pulse_agency_profile']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_read', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_admin())',
      t || '_admin_read', t
    );
  end loop;
end $$;
