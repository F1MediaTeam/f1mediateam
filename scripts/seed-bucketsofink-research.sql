-- Seed researched SEO Snapshot values for Buckets Of Ink (Tempe, AZ).
-- Run in Supabase SQL editor. Idempotent: existing snapshots for these
-- metrics on today's date are upserted, not duplicated.
--
-- Researched values (2026-06-24):
--   ai_visibility:  45   (strong local AI search; weak national)
--   mentions:       14   (BBB A+, Yelp 4.0*20, IG 2.1k followers, TikTok, X, FB, YouTube, ZoomInfo, etc.)
--   site_health:    65   (fast TTFB; missing schema/canonical, 5xH1, viewport blocks zoom)
--   semrush_backlinks: leave to next SEMrush sync (connector updated)

with c as (
  select id from clients
  where lower(company_name) like '%buckets of ink%'
     or 'bucketsofink.com' = any(websites)
     or 'https://bucketsofink.com' = any(websites)
     or 'https://www.bucketsofink.com' = any(websites)
  limit 1
)
insert into metric_snapshots (client_id, source, metric, value, captured_at, is_baseline, meta)
select c.id, v.source, v.metric, v.value, current_date, false, v.meta
from c, (values
  ('research', 'ai_visibility', 45::numeric, jsonb_build_object('method','live AI-search probes','queries_tested',3,'notes','Top result in Phoenix/AZ local AI summaries; weak nationally')),
  ('research', 'mentions',      14::numeric, jsonb_build_object('sources', jsonb_build_array('BBB','Yelp','Instagram','TikTok','X','Facebook','YouTube','Pinterest','Yellowpages','ZoomInfo','Chamber of Commerce','Explorium','dtfprintco','BBB review'))),
  ('research', 'site_health',   65::numeric, jsonb_build_object('method','manual audit','ttfb_ms',253,'issues', jsonb_build_array('no JSON-LD schema','no canonical tag','5 H1 tags','no gtag detected','viewport maximum-scale=1.0','1MB+ HTML')))
) as v(source, metric, value, meta)
on conflict (client_id, source, metric, captured_at)
do update set value = excluded.value, meta = excluded.meta;

-- Show what landed
select c.company_name, m.metric, m.value, m.captured_at, m.meta
from clients c
join metric_snapshots m on m.client_id = c.id
where lower(c.company_name) like '%buckets of ink%'
  and m.source = 'research'
order by m.metric;
