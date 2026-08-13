-- F1 Pulse — the reports bucket, plus the two collectors that cost nothing to run.
--
-- Three things, all of which the zero-spend plan needs:
--
-- 1. The `pulse-reports` storage bucket. Migration 0025 added pulse_reports and
--    the routes that upload to it, but never created the bucket — so every
--    report render currently succeeds and then fails at upload. This is the fix.
-- 2. pulse_psi_checks — PageSpeed Insights lab scores. Free API key.
-- 3. pulse_competitor_activity — new pages competitors publish, found by
--    diffing their sitemaps. Costs our own bandwidth and nothing else.
--
-- Deliberately NOT here: pulse_serp_snapshots and pulse_competitor_positions.
-- Both are fed by paid SERP pulls that aren't funded, and a table with no
-- writer is worse than no table — it reads as a feature that exists.

-- =========================================================
-- 1. Reports bucket
-- =========================================================

-- Private bucket. Reports are client-confidential and are served through
-- short-lived signed URLs by the download route, never read directly.
insert into storage.buckets (id, name, public)
values ('pulse-reports', 'pulse-reports', false)
on conflict (id) do nothing;

drop policy if exists pulse_reports_storage_admin on storage.objects;
create policy pulse_reports_storage_admin on storage.objects
  for all to authenticated
  using (bucket_id = 'pulse-reports' and public.is_admin())
  with check (bucket_id = 'pulse-reports' and public.is_admin());

-- =========================================================
-- 2. PageSpeed Insights lab scores
-- =========================================================

-- Lab scores, not field data. These are a synthetic test from Google's own
-- machine, which is why they can differ sharply from the Core Web Vitals the
-- tag measures on real visitors — the UI has to label which is which.
create table if not exists public.pulse_psi_checks (
  id          bigserial primary key,
  site_id     uuid not null references public.pulse_sites(id) on delete cascade,
  url         text not null,
  strategy    text not null default 'mobile' check (strategy in ('mobile', 'desktop')),
  fetched_at  timestamptz not null default now(),
  -- Lighthouse category scores 0-100 plus the lab timings, as returned.
  lab_scores  jsonb not null default '{}'::jsonb,
  error       text
);

create index if not exists pulse_psi_checks_lookup_idx
  on public.pulse_psi_checks (site_id, fetched_at desc);
create index if not exists pulse_psi_checks_url_idx
  on public.pulse_psi_checks (site_id, url, strategy, fetched_at desc);

-- =========================================================
-- 3. Competitor publishing activity
-- =========================================================

-- One row per URL first seen on a competitor's sitemap. The diff is against
-- everything previously recorded for that domain, so the unique constraint is
-- what makes the collector idempotent — re-running it emits nothing new.
create table if not exists public.pulse_competitor_activity (
  id           bigserial primary key,
  domain_id    uuid not null references public.pulse_domains(id) on delete cascade,
  url          text not null,
  kind         text not null default 'new_page' check (kind in ('new_page', 'new_post')),
  title        text,
  detected_at  timestamptz not null default now(),
  -- Sitemaps carry their own lastmod; keeping it separates "they published
  -- this today" from "we noticed it today", which matters on a first run.
  published_at timestamptz,
  unique (domain_id, url)
);

create index if not exists pulse_competitor_activity_recent_idx
  on public.pulse_competitor_activity (domain_id, detected_at desc);

-- =========================================================
-- 4. New feed-event kinds
-- =========================================================

-- pulse_feed_events.kind is a closed set, so every new event type has to be
-- admitted here before anything can write one. Only the kinds that now have a
-- real writer are added — an allowed kind nothing emits is a promise the feed
-- never keeps.
--
--   tag_origin_rejected     a valid key arrived from an unregistered host
--   opportunity_new         a strike-distance keyword or fixable issue appeared
--   cannibalization_found   two of the client's own pages compete on one query
--   review_new              a new Google Business Profile review
--   competitor_new_content  a competitor published a page we hadn't seen
--   competitor_move         a competitor's estimated traffic or authority moved
--   prospect_won            a link prospect reached "won"
alter table public.pulse_feed_events
  drop constraint if exists pulse_feed_events_kind_check;

alter table public.pulse_feed_events
  add constraint pulse_feed_events_kind_check check (kind in (
    'rank_up', 'rank_down', 'backlink_new', 'backlink_lost',
    'crawl_issues', 'bot_block_change', 'site_down', 'site_recovered',
    'tag_missing', 'tag_detected', 'conversion_milestone', 'milestone',
    'tag_origin_rejected', 'opportunity_new', 'cannibalization_found',
    'review_new', 'competitor_new_content', 'competitor_move', 'prospect_won'
  ));

-- =========================================================
-- RLS — default deny, matching every other pulse table
-- =========================================================
do $$
declare t text;
begin
  foreach t in array array['pulse_psi_checks', 'pulse_competitor_activity']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_read', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_admin())',
      t || '_admin_read', t
    );
  end loop;
end $$;
