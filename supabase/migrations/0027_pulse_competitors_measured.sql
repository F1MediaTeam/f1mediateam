-- F1 Pulse — competitor tracking we perform ourselves.
--
-- pulse_domain_snapshots was designed around a data vendor: est_traffic,
-- authority_score, ref_domains, total_keywords. Every one of those is derived
-- from infrastructure we do not have and cannot build — a web-wide link index
-- and a continuous SERP scrape. They stay in the table, and they stay null,
-- until a vendor is wired.
--
-- What we can measure ourselves, by visiting a competitor's site the same
-- polite way we crawl a client's, is a different and genuinely useful set:
-- how big the site is, how fast it is growing, what it publishes and when,
-- how well built it is, how fast it loads, and whether it lets AI crawlers in.
-- Those get first-class columns here.
--
-- The `source` column is the Section 7 honesty rule made structural. A row is
-- either something we measured or something a vendor estimated, never a blend,
-- and the UI reads this column to decide how to label the figure rather than
-- relying on whoever writes the panel to remember.

alter table public.pulse_domain_snapshots
  -- 'measured'  we fetched it ourselves — sitemap, crawl, PageSpeed, robots
  -- 'estimated' a third party modelled it
  add column if not exists source text not null default 'measured'
    check (source in ('measured', 'estimated')),

  -- Pages the site publicly lists in its sitemap(s). Not "indexed by Google" —
  -- naming it that would be a claim we cannot verify without Search Console
  -- access to someone else's property, which we will never have.
  add column if not exists pages_listed integer,
  -- New URLs seen since the previous snapshot, and how many carry a sitemap
  -- lastmod inside the window. Publishing pace is the single most useful
  -- competitive signal available without a vendor.
  add column if not exists pages_new integer,
  add column if not exists published_30d integer,

  -- Lighthouse performance score for the homepage, 0-100. Free, and directly
  -- comparable with the client's own score in the same units.
  add column if not exists speed_score integer,

  -- Everything else we observed, kept together rather than exploded into
  -- columns that would need a migration every time a checker is added:
  -- title/heading samples, structured-data rate, average word count, https,
  -- bot access verdicts, and the sample size each figure came from.
  add column if not exists measured jsonb not null default '{}'::jsonb;

comment on column public.pulse_domain_snapshots.source is
  'measured = we fetched it; estimated = a third party modelled it. Never blend the two in one figure.';
comment on column public.pulse_domain_snapshots.pages_listed is
  'URLs the site lists in its own sitemap(s). NOT a count of pages indexed by Google.';

create index if not exists pulse_domain_snapshots_domain_idx
  on public.pulse_domain_snapshots (domain_id, captured_at desc);

-- No RLS changes needed: 0024 already enabled row level security on
-- pulse_domains, pulse_domain_snapshots and pulse_competitors and gave each an
-- admin read policy. Verified against production before writing this.
