-- Where a visitor is, without recording who they are.
--
-- The tag already stores country. Vercel resolves city and region at the edge
-- and hands them over in headers, so capturing them costs nothing and needs no
-- lookup service — the work has already been done by the time the request
-- arrives.
--
-- What is deliberately NOT here is an IP column, and it never will be. An IP is
-- personal data; city and region are not, which is why every analytics product
-- reports the latter and only surveillance products keep the former. The tag
-- needs no cookie banner precisely because nothing it stores identifies anyone,
-- and that property is worth more than the one question an IP would answer.
--
-- scripts/privacy-check.mjs asserts that no pulse table has a column capable of
-- holding an IP. If a future migration adds one, the build fails. That is the
-- intended behaviour, not an obstacle to route around.

alter table public.pulse_pageviews
  -- "AZ", "CA", "ON" — Vercel's x-vercel-ip-country-region.
  add column if not exists region text,
  -- "Phoenix", "Tempe" — Vercel's x-vercel-ip-city.
  add column if not exists city text;

comment on column public.pulse_pageviews.region is
  'State or province from the edge, e.g. AZ. Never derived from a stored IP — the IP is discarded.';
comment on column public.pulse_pageviews.city is
  'City from the edge, e.g. Phoenix. Coarse by design; no IP is retained to produce it.';

-- "Who is on the site right now" reads the last few minutes for one site, and
-- does it on every load of the live panel.
create index if not exists pulse_pageviews_live_idx
  on public.pulse_pageviews (site_id, ts desc);
