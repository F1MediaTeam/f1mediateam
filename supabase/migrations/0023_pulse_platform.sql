-- F1 Pulse — first-party analytics platform (2026-08-11)
--
-- Everything here is prefixed `pulse_` and hangs off the existing clients
-- table. Pulse never duplicates a client record; a client can have more than
-- one site, so pulse_sites is the join between a customer and a domain.
--
-- NOT created here, deliberately: pulse_gsc_daily and pulse_ga4_daily. The
-- portal already syncs Search Console and GA4 into metric_snapshots nightly
-- (7,500+ rows, current), and query/page breakdowns are fetched on demand from
-- gsc.ts. Adding parallel tables would mean two sources of truth for the same
-- numbers and a second sync to keep alive.
--
-- SECURITY MODEL. Every table is RLS default-deny: RLS is enabled and the only
-- policy is an admin SELECT. There are deliberately no INSERT/UPDATE/DELETE
-- policies — all writes go through server code holding the service-role key,
-- which bypasses RLS. Every policy is `to authenticated`, so the anon key can
-- neither read nor write anything, which is what the ingest endpoint depends
-- on: the browser tag never talks to Postgres, only to our own route.

-- =========================================================
-- site keys
-- =========================================================
-- 'f1_' + 20 hex characters. Hex rather than base64 so a key can be read down
-- a phone line and pasted into a footer without ambiguity between similar
-- glyphs, and so it survives being URL- or HTML-encoded unchanged.

create or replace function public.pulse_new_site_key()
returns text
language sql
volatile
as $$
  select 'f1_' || substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 20);
$$;

-- =========================================================
-- pulse_sites — one row per domain we measure
-- =========================================================
create table if not exists public.pulse_sites (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references public.clients(id) on delete cascade,
  domain            text not null,
  site_key          text not null unique default public.pulse_new_site_key(),
  -- pending: key issued, no beacon yet. live: receiving beacons.
  -- tag_missing: site responds but the tag is gone. down: site unreachable.
  status            text not null default 'pending'
                      check (status in ('pending', 'live', 'tag_missing', 'down')),
  sitemap_url       text,
  -- paths never crawled, e.g. {/designer/} on the DecoNetwork stores
  crawl_exclusions  text[] not null default '{}',
  -- extra hosts allowed to send beacons. apex + www are accepted implicitly,
  -- so this stays empty unless a site serves pages from another subdomain.
  allowed_origins   text[] not null default '{}',
  crawl_page_cap    integer not null default 2000,
  last_beacon_at    timestamptz,
  last_crawled_at   timestamptz,
  created_at        timestamptz not null default now(),
  unique (client_id, domain)
);

create index if not exists pulse_sites_client_idx on public.pulse_sites (client_id);
create index if not exists pulse_sites_status_idx on public.pulse_sites (status);

comment on column public.pulse_sites.site_key is
  'Public identifier pasted into the client footer. Not a secret — it identifies, it does not authorise. Origin checking is what prevents a stolen key being used elsewhere.';

-- =========================================================
-- pulse_pageviews — the core event stream
-- =========================================================
-- visitor_hash / session_hash come from a daily-rotating salt (see the ingest
-- route). No IP is stored: it is used transiently for country lookup and as
-- hash input, then discarded. There is deliberately no ip column — the
-- absence is the guarantee.

create table if not exists public.pulse_pageviews (
  id              bigserial primary key,
  site_id         uuid not null references public.pulse_sites(id) on delete cascade,
  ts              timestamptz not null default now(),
  path            text not null,
  referrer        text,
  referrer_domain text,
  utm_source      text,
  utm_medium      text,
  utm_campaign    text,
  device_type     text check (device_type is null or device_type in ('desktop', 'mobile', 'tablet')),
  country         text,
  visitor_hash    text not null,
  session_hash    text not null,
  engagement_ms   integer
);

create index if not exists pulse_pageviews_site_ts_idx on public.pulse_pageviews (site_id, ts desc);
create index if not exists pulse_pageviews_session_idx on public.pulse_pageviews (site_id, session_hash);

-- =========================================================
-- pulse_web_vitals — Core Web Vitals from real browsers
-- =========================================================
create table if not exists public.pulse_web_vitals (
  id      bigserial primary key,
  site_id uuid not null references public.pulse_sites(id) on delete cascade,
  ts      timestamptz not null default now(),
  path    text not null,
  metric  text not null check (metric in ('LCP', 'CLS', 'INP', 'TTFB', 'FCP')),
  value   double precision not null,
  device_type text
);

create index if not exists pulse_web_vitals_site_ts_idx on public.pulse_web_vitals (site_id, ts desc);
create index if not exists pulse_web_vitals_metric_idx on public.pulse_web_vitals (site_id, metric, ts desc);

-- =========================================================
-- pulse_conversions — privacy-safe lead signals
-- =========================================================
-- `target` is an outbound domain, or a form's id/name. It is never a field
-- value. The tag does not read inputs at all, so there is no path by which a
-- typed value could reach this column.

create table if not exists public.pulse_conversions (
  id           bigserial primary key,
  site_id      uuid not null references public.pulse_sites(id) on delete cascade,
  ts           timestamptz not null default now(),
  path         text not null,
  kind         text not null
                 check (kind in ('tel_click', 'mailto_click', 'outbound_click', 'form_submit')),
  target       text,
  session_hash text not null
);

create index if not exists pulse_conversions_site_ts_idx on public.pulse_conversions (site_id, ts desc);
create index if not exists pulse_conversions_kind_idx on public.pulse_conversions (site_id, kind, ts desc);

-- =========================================================
-- pulse_keywords / pulse_rank_checks — rank tracking
-- =========================================================
create table if not exists public.pulse_keywords (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null references public.pulse_sites(id) on delete cascade,
  phrase        text not null,
  location_code integer not null default 2840,          -- DataForSEO: 2840 = United States
  device        text not null default 'desktop' check (device in ('desktop', 'mobile')),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (site_id, phrase, location_code, device)
);

create index if not exists pulse_keywords_site_active_idx on public.pulse_keywords (site_id, is_active);

create table if not exists public.pulse_rank_checks (
  id            bigserial primary key,
  keyword_id    uuid not null references public.pulse_keywords(id) on delete cascade,
  checked_at    timestamptz not null default now(),
  -- null means "not in the top 100", which is different from "not checked".
  position      integer,
  ranking_url   text,
  serp_features jsonb not null default '{}'::jsonb
);

create index if not exists pulse_rank_checks_keyword_idx on public.pulse_rank_checks (keyword_id, checked_at desc);

-- =========================================================
-- pulse_backlinks
-- =========================================================
create table if not exists public.pulse_backlinks (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null references public.pulse_sites(id) on delete cascade,
  source_url    text not null,
  source_domain text not null,
  target_url    text,
  anchor        text,
  first_seen    timestamptz not null default now(),
  last_seen     timestamptz not null default now(),
  status        text not null default 'new' check (status in ('new', 'live', 'lost')),
  -- authority figures exactly as the provider returned them; nothing invented
  metrics       jsonb not null default '{}'::jsonb,
  unique (site_id, source_url)
);

create index if not exists pulse_backlinks_site_status_idx on public.pulse_backlinks (site_id, status);
create index if not exists pulse_backlinks_site_seen_idx on public.pulse_backlinks (site_id, last_seen desc);

-- =========================================================
-- crawler
-- =========================================================
create table if not exists public.pulse_crawls (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null references public.pulse_sites(id) on delete cascade,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  status        text not null default 'running'
                  check (status in ('running', 'done', 'failed', 'cancelled')),
  pages_crawled integer not null default 0,
  error         text
);

create index if not exists pulse_crawls_site_idx on public.pulse_crawls (site_id, started_at desc);
create index if not exists pulse_crawls_running_idx on public.pulse_crawls (status) where status = 'running';

create table if not exists public.pulse_crawl_pages (
  id                 bigserial primary key,
  crawl_id           uuid not null references public.pulse_crawls(id) on delete cascade,
  url                text not null,
  status_code        integer,
  title              text,
  meta_description   text,
  h1                 text,
  canonical          text,
  robots_meta        text,
  word_count         integer,
  depth              integer,
  internal_links_out integer,
  content_hash       text,
  fetched_at         timestamptz not null default now()
);

create index if not exists pulse_crawl_pages_crawl_idx on public.pulse_crawl_pages (crawl_id);
create index if not exists pulse_crawl_pages_hash_idx on public.pulse_crawl_pages (crawl_id, content_hash);

create table if not exists public.pulse_crawl_issues (
  id       bigserial primary key,
  crawl_id uuid not null references public.pulse_crawls(id) on delete cascade,
  url      text not null,
  type     text not null,
  severity text not null check (severity in ('error', 'warning', 'notice')),
  detail   jsonb not null default '{}'::jsonb
);

create index if not exists pulse_crawl_issues_crawl_idx on public.pulse_crawl_issues (crawl_id, severity);

-- The crawl frontier. Not in the original spec, and required by it: a 2,000
-- page crawl at one request per second runs ~33 minutes against a 300-second
-- function ceiling, so a crawl cannot be one call. Each invocation claims a
-- slice of this queue, processes it, and returns; a scheduled tick repeats
-- until the queue drains. A crashed run resumes rather than restarting.
create table if not exists public.pulse_crawl_queue (
  id         bigserial primary key,
  crawl_id   uuid not null references public.pulse_crawls(id) on delete cascade,
  url        text not null,
  depth      integer not null default 0,
  state      text not null default 'queued' check (state in ('queued', 'active', 'done', 'error')),
  claimed_at timestamptz,
  unique (crawl_id, url)
);

create index if not exists pulse_crawl_queue_next_idx on public.pulse_crawl_queue (crawl_id, state, depth);

-- =========================================================
-- pulse_bot_access — the AI-bot accessibility matrix
-- =========================================================
create table if not exists public.pulse_bot_access (
  id                  bigserial primary key,
  site_id             uuid not null references public.pulse_sites(id) on delete cascade,
  checked_at          timestamptz not null default now(),
  bot                 text not null,
  allowed             boolean not null,
  blocked_sample_paths jsonb not null default '[]'::jsonb
);

create index if not exists pulse_bot_access_site_idx on public.pulse_bot_access (site_id, checked_at desc);
create index if not exists pulse_bot_access_bot_idx on public.pulse_bot_access (site_id, bot, checked_at desc);

-- =========================================================
-- pulse_feed_events — the cross-client activity feed
-- =========================================================
create table if not exists public.pulse_feed_events (
  id       bigserial primary key,
  site_id  uuid not null references public.pulse_sites(id) on delete cascade,
  ts       timestamptz not null default now(),
  kind     text not null check (kind in (
             'rank_up', 'rank_down', 'backlink_new', 'backlink_lost',
             'crawl_issues', 'bot_block_change', 'site_down', 'site_recovered',
             'tag_missing', 'tag_detected', 'conversion_milestone', 'milestone')),
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical', 'good')),
  title    text not null,
  payload  jsonb not null default '{}'::jsonb
);

create index if not exists pulse_feed_events_ts_idx on public.pulse_feed_events (ts desc);
create index if not exists pulse_feed_events_site_ts_idx on public.pulse_feed_events (site_id, ts desc);
create index if not exists pulse_feed_events_kind_idx on public.pulse_feed_events (kind, ts desc);

-- =========================================================
-- pulse_runs — every collector invocation, scheduled or manual
-- =========================================================
-- This is the only place a third-party provider may be named. Nothing
-- client-facing reads it.
create table if not exists public.pulse_runs (
  id         bigserial primary key,
  collector  text not null,
  site_id    uuid references public.pulse_sites(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok         boolean,
  error      text,
  counts     jsonb not null default '{}'::jsonb,
  mocked     boolean not null default false
);

create index if not exists pulse_runs_collector_idx on public.pulse_runs (collector, started_at desc);
create index if not exists pulse_runs_site_idx on public.pulse_runs (site_id, started_at desc);

-- =========================================================
-- pulse_daily_rollups — precomputed dashboard/report aggregates
-- =========================================================
-- A table rather than a materialized view: rollups are written incrementally
-- each night per site, and a matview would have to recompute the entire
-- history on every refresh.
create table if not exists public.pulse_daily_rollups (
  site_id        uuid not null references public.pulse_sites(id) on delete cascade,
  date           date not null,
  visitors       integer not null default 0,
  pageviews      integer not null default 0,
  sessions       integer not null default 0,
  conversions    jsonb not null default '{}'::jsonb,
  top_referrers  jsonb not null default '[]'::jsonb,
  top_pages      jsonb not null default '[]'::jsonb,
  vitals_p75     jsonb not null default '{}'::jsonb,
  computed_at    timestamptz not null default now(),
  primary key (site_id, date)
);

create index if not exists pulse_daily_rollups_date_idx on public.pulse_daily_rollups (date desc);

-- =========================================================
-- Row level security — default deny on every table
-- =========================================================
-- Enable RLS everywhere, then grant exactly one thing: admins may SELECT.
-- No INSERT/UPDATE/DELETE policy exists anywhere, so an authenticated session
-- cannot write even to its own client's rows; writes are service-role only.
-- Every policy targets `authenticated`, so the anon key gets nothing at all.

do $$
declare t text;
begin
  foreach t in array array[
    'pulse_sites', 'pulse_pageviews', 'pulse_web_vitals', 'pulse_conversions',
    'pulse_keywords', 'pulse_rank_checks', 'pulse_backlinks', 'pulse_crawls',
    'pulse_crawl_pages', 'pulse_crawl_issues', 'pulse_crawl_queue',
    'pulse_bot_access', 'pulse_feed_events', 'pulse_runs', 'pulse_daily_rollups'
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

-- =========================================================
-- Realtime
-- =========================================================
-- The supabase_realtime publication exists but currently publishes no tables,
-- so these are explicit adds. Only the three streams the dashboard subscribes
-- to — publishing the crawl tables would push thousands of rows at idle
-- browsers for no benefit.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'pulse_pageviews'
  ) then
    alter publication supabase_realtime add table public.pulse_pageviews;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'pulse_conversions'
  ) then
    alter publication supabase_realtime add table public.pulse_conversions;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'pulse_feed_events'
  ) then
    alter publication supabase_realtime add table public.pulse_feed_events;
  end if;
end $$;
