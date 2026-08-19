-- F1 Pulse — Keyword Lab.
--
-- Keyword research and arbitrary-keyword rank tracking, powered by the
-- Anthropic key the portal already holds rather than a SERP subscription.
--
-- Deliberately extends pulse_keywords and pulse_rank_checks instead of adding
-- a parallel set of tables. A second keyword list would drift from the first
-- the day either one was edited, and anything tracked here should appear on
-- the Rankings tab automatically — it is the same fact about the same site.
--
-- Two kinds of number live here and they are NOT the same:
--
--   measured   the rank check. Claude actually searches and reads the
--              results, so the position is observed.
--   ai_estimated  volume, difficulty and cost-per-click. Claude does not have
--              Google's volume data; these are plausible figures for
--              directional research and must never be presented as measured.
--
-- The distinction is a column, not a convention, so a panel cannot forget it.

-- =========================================================
-- Research metrics on the keyword itself
-- =========================================================

alter table public.pulse_keywords
  add column if not exists volume integer,
  add column if not exists intent text check (intent in ('T', 'C', 'I', 'N')),
  add column if not exists kd integer check (kd between 0 and 100),
  add column if not exists cpc numeric(10, 2),
  -- The page this keyword is supposed to rank. Blank means the homepage.
  add column if not exists target_url text,
  -- When the estimates above were last produced, so stale research is visible
  -- rather than silently ageing.
  add column if not exists researched_at timestamptz,
  add column if not exists metrics_source text not null default 'ai_estimated'
    check (metrics_source in ('ai_estimated', 'vendor', 'measured'));

comment on column public.pulse_keywords.volume is
  'Estimated monthly searches. AI-modelled unless metrics_source says otherwise — not Google data.';
comment on column public.pulse_keywords.metrics_source is
  'Where volume/kd/cpc came from. ai_estimated is a plausible guess, not a measurement.';

-- =========================================================
-- What a rank check actually saw
-- =========================================================

alter table public.pulse_rank_checks
  -- exact  the target page itself ranks
  -- domain another page on the same domain ranks
  -- none   the domain does not appear in the results read
  add column if not exists match_type text check (match_type in ('exact', 'domain', 'none')),
  -- The results the position was read from. Stored so a client can be shown
  -- who actually outranks them, and so a surprising position can be audited
  -- rather than taken on trust.
  add column if not exists top_results jsonb not null default '[]'::jsonb,
  add column if not exists source text not null default 'vendor'
    check (source in ('vendor', 'ai_search', 'gsc'));

comment on column public.pulse_rank_checks.source is
  'ai_search = read from live web search at check time, non-localised desktop. Directional for "near me" terms.';

-- =========================================================
-- Spend ledger
-- =========================================================

-- Every paid call is recorded before its result is used, so "what has this
-- cost" is answerable from the database rather than from an invoice weeks
-- later. This is what makes a monthly ceiling enforceable instead of
-- aspirational.
create table if not exists public.pulse_ai_spend (
  id            bigserial primary key,
  occurred_at   timestamptz not null default now(),
  feature       text not null,
  model         text not null,
  input_tokens  integer not null default 0,
  output_tokens integer not null default 0,
  web_searches  integer not null default 0,
  -- Priced at published rates at the time of the call. An estimate of the
  -- bill, not the bill itself.
  est_cost_usd  numeric(10, 5) not null default 0,
  site_id       uuid references public.pulse_sites(id) on delete set null,
  detail        jsonb not null default '{}'::jsonb
);

create index if not exists pulse_ai_spend_month_idx
  on public.pulse_ai_spend (occurred_at desc);
create index if not exists pulse_ai_spend_feature_idx
  on public.pulse_ai_spend (feature, occurred_at desc);

-- =========================================================
-- RLS — default deny, matching every other pulse table
-- =========================================================
alter table public.pulse_ai_spend enable row level security;
drop policy if exists pulse_ai_spend_admin_read on public.pulse_ai_spend;
create policy pulse_ai_spend_admin_read on public.pulse_ai_spend
  for select to authenticated using (public.is_admin());
