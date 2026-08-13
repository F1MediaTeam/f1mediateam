-- F1 Pulse — the Search Console Index Inspector.
--
-- Ranking is downstream of being indexed. A page Google has not accepted into
-- its index cannot rank for anything, no matter how good it is, and nothing
-- else in Pulse can see that state: the crawler reports what the page says
-- about itself, and Search Console's performance data only ever describes
-- pages that already made it in. This closes that gap.
--
-- Two decisions worth recording, both taken from the master script's own rules
-- rather than invented here:
--
-- 1. NAMING. The addendum calls these inspection_runs / index_verdicts. Every
--    other table in this system is pulse_*, and the addendum says to conform
--    to repo conventions, so they are pulse_index_runs / pulse_index_verdicts.
--
-- 2. NO page_performance TABLE. The addendum specifies one. We already store
--    per-page Search Console data in pulse_search_terms (dimension = 'page'),
--    kept current by the nightly forward-fill. A second copy would drift from
--    the first the day either job failed, which is exactly the reasoning that
--    made collectors/search.ts deliberately collect nothing. Deadweight pages
--    are therefore computed by joining verdicts against pulse_search_terms.

-- =========================================================
-- pulse_sites — how to address the property, and whether it works
-- =========================================================

alter table public.pulse_sites
  -- Search Console addresses a property one of two ways and they are not
  -- interchangeable: 'sc-domain:example.com' for a domain property, or the
  -- exact URL prefix 'https://www.example.com/' including the trailing slash.
  -- Guessing wrong returns 403, not 404, which reads like a permissions
  -- problem and sends you looking in the wrong place.
  add column if not exists gsc_property text,
  -- Set by a successful verification call, not by saving the field — the only
  -- proof that matters is that Google answered.
  add column if not exists gsc_connected boolean not null default false;

comment on column public.pulse_sites.gsc_property is
  'Search Console property id: "sc-domain:example.com" or "https://www.example.com/" (exact, trailing slash included).';

-- =========================================================
-- pulse_index_runs — one row per inspection pass
-- =========================================================

create table if not exists public.pulse_index_runs (
  id             uuid primary key default gen_random_uuid(),
  site_id        uuid not null references public.pulse_sites(id) on delete cascade,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  status         text not null default 'running'
                   check (status in ('running', 'done', 'quota_paused', 'failed')),
  urls_total     integer not null default 0,
  urls_inspected integer not null default 0,
  -- Counts per bucket for this run, so the trend can be drawn without
  -- re-aggregating tens of thousands of verdict rows.
  buckets        jsonb not null default '{}'::jsonb,
  mocked         boolean not null default false,
  error          text
);

create index if not exists pulse_index_runs_site_idx
  on public.pulse_index_runs (site_id, started_at desc);

-- =========================================================
-- pulse_index_verdicts — one row per URL per run
-- =========================================================

create table if not exists public.pulse_index_verdicts (
  id            bigserial primary key,
  run_id        uuid not null references public.pulse_index_runs(id) on delete cascade,
  site_id       uuid not null references public.pulse_sites(id) on delete cascade,
  url           text not null,
  -- The eight buckets from the standalone inspector, kept verbatim so its
  -- reporting language and this one stay interchangeable.
  bucket        text not null check (bucket in (
                  'indexed', 'rejected', 'not_crawled', 'canonical_override',
                  'blocked', 'redirect', 'error', 'unknown')),
  -- Google's own wording, preserved rather than collapsed into the bucket —
  -- "Crawled - currently not indexed" and "Discovered - currently not indexed"
  -- share a bucket but mean different things to whoever fixes it.
  coverage_state   text,
  indexing_state   text,
  robots_state     text,
  page_fetch_state text,
  last_crawl_time  timestamptz,
  -- When Google picked a different canonical, this is the one it chose.
  google_canonical text,
  user_canonical   text,
  checked_at    timestamptz not null default now(),
  unique (run_id, url)
);

create index if not exists pulse_index_verdicts_site_idx
  on public.pulse_index_verdicts (site_id, checked_at desc);
create index if not exists pulse_index_verdicts_bucket_idx
  on public.pulse_index_verdicts (site_id, bucket);
-- Comparing a run against the one before it is the whole point of tracking
-- this over time, and it is always keyed by url.
create index if not exists pulse_index_verdicts_url_idx
  on public.pulse_index_verdicts (site_id, url, checked_at desc);

-- =========================================================
-- Feed events
-- =========================================================

alter table public.pulse_feed_events
  drop constraint if exists pulse_feed_events_kind_check;

alter table public.pulse_feed_events
  add constraint pulse_feed_events_kind_check check (kind in (
    'rank_up', 'rank_down', 'backlink_new', 'backlink_lost',
    'crawl_issues', 'bot_block_change', 'site_down', 'site_recovered',
    'tag_missing', 'tag_detected', 'conversion_milestone', 'milestone',
    'tag_origin_rejected', 'opportunity_new', 'cannibalization_found',
    'review_new', 'competitor_new_content', 'competitor_move', 'prospect_won',
    -- index inspector
    'index_run_completed', 'pages_fixed', 'pages_regressed'
  ));

-- =========================================================
-- RLS — default deny, matching every other pulse table
-- =========================================================
do $$
declare t text;
begin
  foreach t in array array['pulse_index_runs', 'pulse_index_verdicts']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_read', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_admin())',
      t || '_admin_read', t
    );
  end loop;
end $$;
