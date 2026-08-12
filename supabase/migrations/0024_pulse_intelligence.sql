-- F1 Pulse — intelligence layer (2026-08-11)
--
-- Adds AI search visibility, domain intelligence, competitor watch, on-page
-- opportunities, local reviews, and the historical search-term store that makes
-- year-over-year reporting possible.
--
-- Additive throughout: seven new tables and six new columns. Nothing existing is
-- dropped or altered in a way that changes current behaviour.

-- =========================================================
-- Columns on existing tables
-- =========================================================

-- Site Health: a 0-100 score per crawl so health can be trended rather than
-- re-counted from raw issues every time a report is built.
alter table public.pulse_crawls
  add column if not exists health_score integer;

comment on column public.pulse_crawls.health_score is
  'F1 Site Health, 0-100. 100 minus weighted issue density: errors count 3x, warnings 1x, notices 0.25x, divided by pages crawled and capped. Formula in src/lib/pulse/collectors/crawl.ts.';

-- AI Overviews ride along with the SERP check that is already being paid for,
-- so they cost nothing extra to collect.
alter table public.pulse_rank_checks
  add column if not exists ai_overview_present boolean,
  add column if not exists ai_overview_cited   boolean,
  add column if not exists ai_cited_urls       jsonb not null default '[]'::jsonb;

-- F1 Link Quality: our own bucket, computed from provider metrics. Deliberately
-- not called a toxicity score — it is not one, and it is never presented as any
-- third party's judgement.
alter table public.pulse_backlinks
  add column if not exists quality text
    check (quality is null or quality in ('high', 'medium', 'watch'));

alter table public.pulse_daily_rollups
  add column if not exists visibility_index numeric,
  add column if not exists ai_visibility    jsonb not null default '{}'::jsonb;

-- The feed's kind list is a check constraint, so new event types need it
-- rebuilt rather than simply inserted.
alter table public.pulse_feed_events drop constraint if exists pulse_feed_events_kind_check;
alter table public.pulse_feed_events add constraint pulse_feed_events_kind_check check (kind in (
  'rank_up', 'rank_down', 'backlink_new', 'backlink_lost', 'crawl_issues',
  'bot_block_change', 'site_down', 'site_recovered', 'tag_missing', 'tag_detected',
  'conversion_milestone', 'milestone',
  -- new in this migration
  'ai_mention_gained', 'ai_mention_lost', 'ai_cited_page_new',
  'competitor_move', 'review_new', 'opportunity_new'
));

-- =========================================================
-- AI search visibility
-- =========================================================
create table if not exists public.pulse_ai_prompts (
  id         uuid primary key default gen_random_uuid(),
  site_id    uuid not null references public.pulse_sites(id) on delete cascade,
  prompt     text not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  unique (site_id, prompt)
);

create index if not exists pulse_ai_prompts_site_idx on public.pulse_ai_prompts (site_id, is_active);

create table if not exists public.pulse_ai_checks (
  id               bigserial primary key,
  prompt_id        uuid not null references public.pulse_ai_prompts(id) on delete cascade,
  platform         text not null check (platform in ('openai', 'gemini', 'anthropic', 'perplexity')),
  checked_at       timestamptz not null default now(),
  mentioned        boolean not null,
  cited_urls       jsonb not null default '[]'::jsonb,
  -- a short quote showing why we scored it that way, so a surprising result can
  -- be audited instead of taken on trust
  evidence_excerpt text,
  mocked           boolean not null default false
);

create index if not exists pulse_ai_checks_prompt_idx on public.pulse_ai_checks (prompt_id, checked_at desc);
create index if not exists pulse_ai_checks_platform_idx on public.pulse_ai_checks (platform, checked_at desc);

-- =========================================================
-- Domain intelligence and competitors
-- =========================================================
-- A domain is its own entity rather than a column on pulse_sites: a competitor
-- has no site key, no tag and no client, but needs the same snapshots. One
-- competitor can also be shared by several clients without duplication.
create table if not exists public.pulse_domains (
  id      uuid primary key default gen_random_uuid(),
  domain  text not null unique,
  kind    text not null check (kind in ('client', 'competitor')),
  site_id uuid references public.pulse_sites(id) on delete cascade
);

create index if not exists pulse_domains_site_idx on public.pulse_domains (site_id);

create table if not exists public.pulse_domain_snapshots (
  id                   bigserial primary key,
  domain_id            uuid not null references public.pulse_domains(id) on delete cascade,
  captured_at          timestamptz not null default now(),
  est_traffic          integer,
  total_keywords       integer,
  pos_distribution     jsonb not null default '{}'::jsonb,   -- {"1-3":n,"4-10":n,…}
  authority_score      integer,
  ref_domains          integer,
  top_keywords         jsonb not null default '[]'::jsonb,
  intents              jsonb not null default '{}'::jsonb,
  detected_competitors jsonb not null default '[]'::jsonb,
  mocked               boolean not null default false
);

create index if not exists pulse_domain_snapshots_domain_idx
  on public.pulse_domain_snapshots (domain_id, captured_at desc);

comment on column public.pulse_domain_snapshots.authority_score is
  'F1 Authority Score, 0-100: our own composite of provider domain rank and referring-domain scale. Documented in src/lib/pulse/collectors/domains.ts. Never presented as any third party''s score.';

create table if not exists public.pulse_competitors (
  site_id   uuid not null references public.pulse_sites(id) on delete cascade,
  domain_id uuid not null references public.pulse_domains(id) on delete cascade,
  is_active boolean not null default true,
  added_at  timestamptz not null default now(),
  primary key (site_id, domain_id)
);

-- =========================================================
-- On-page opportunities
-- =========================================================
-- Computed, never fetched — these come from crawl issues plus Search Console
-- data we already hold, so they cost nothing per run.
create table if not exists public.pulse_opportunities (
  id          bigserial primary key,
  site_id     uuid not null references public.pulse_sites(id) on delete cascade,
  computed_at timestamptz not null default now(),
  page        text not null,
  category    text not null
                check (category in ('content', 'technical', 'schema', 'links', 'cwv', 'strike_distance')),
  detail      jsonb not null default '{}'::jsonb,
  status      text not null default 'open' check (status in ('open', 'done', 'dismissed')),
  -- lets a recompute update an existing row instead of duplicating it, so
  -- "done" and "dismissed" survive the next run
  fingerprint text not null,
  unique (site_id, fingerprint)
);

create index if not exists pulse_opportunities_site_idx on public.pulse_opportunities (site_id, status, category);

-- =========================================================
-- Local presence
-- =========================================================
create table if not exists public.pulse_reviews (
  id         bigserial primary key,
  site_id    uuid not null references public.pulse_sites(id) on delete cascade,
  review_id  text not null,
  rating     integer check (rating between 1 and 5),
  author     text,
  text       text,
  reply_text text,
  created_at timestamptz not null default now(),
  unique (site_id, review_id)
);

create index if not exists pulse_reviews_site_idx on public.pulse_reviews (site_id, created_at desc);

-- =========================================================
-- Historical search terms
-- =========================================================
-- Search Console keeps 16 months and then deletes. metric_snapshots holds daily
-- totals only — it has no room for a query or a page — so year-over-year
-- reporting needs its own store, backfilled once before that history expires.
--
-- Backfilled monthly (16 rows per term, one API call per month per dimension)
-- and written daily going forward, which is why granularity is a column.
create table if not exists public.pulse_search_terms (
  id           bigserial primary key,
  site_id      uuid not null references public.pulse_sites(id) on delete cascade,
  period_start date not null,
  granularity  text not null check (granularity in ('day', 'month')),
  dimension    text not null check (dimension in ('query', 'page')),
  term         text not null,
  clicks       integer not null default 0,
  impressions  integer not null default 0,
  ctr          numeric,
  position     numeric,
  unique (site_id, period_start, granularity, dimension, term)
);

create index if not exists pulse_search_terms_lookup_idx
  on public.pulse_search_terms (site_id, dimension, period_start desc);
-- Strike-distance opportunities read exactly this slice: ranking 4-20 with
-- impressions worth chasing.
create index if not exists pulse_search_terms_strike_idx
  on public.pulse_search_terms (site_id, position)
  where position >= 4 and position <= 20;

-- =========================================================
-- RLS — default deny, matching every other pulse table
-- =========================================================
do $$
declare t text;
begin
  foreach t in array array[
    'pulse_ai_prompts', 'pulse_ai_checks', 'pulse_domains', 'pulse_domain_snapshots',
    'pulse_competitors', 'pulse_opportunities', 'pulse_reviews', 'pulse_search_terms'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_read', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_admin())',
      t || '_admin_read', t
    );
  end loop;
end $$;
