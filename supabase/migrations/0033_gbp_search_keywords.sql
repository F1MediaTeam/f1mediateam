-- The searches that find a business on Google Maps.
--
-- Search Console reports web search. It does not report Maps, and for a local
-- service business — a sign shop, an apparel printer — a large share of the
-- demand arrives through the map pack and never appears in Search Console at
-- all. Google Business Profile reports those terms directly, on the OAuth
-- scope the portal already holds, at no cost.
--
-- Stored in pulse_search_terms rather than a new table: same shape, same
-- questions asked of it, and the Rankings panel can show web and local
-- together instead of two lists that have to be reconciled by eye. The
-- dimension column is what keeps them apart.

alter table public.pulse_search_terms
  drop constraint if exists pulse_search_terms_dimension_check;

alter table public.pulse_search_terms
  add constraint pulse_search_terms_dimension_check
  check (dimension in ('query', 'page', 'gbp_keyword'));

-- Google withholds exact counts for low-volume search terms and returns a
-- ceiling instead — "fewer than 15" rather than 11. Recording which is which
-- matters: summing thresholds as if they were counts would overstate local
-- demand, and quietly.
alter table public.pulse_search_terms
  add column if not exists below_threshold boolean not null default false;

comment on column public.pulse_search_terms.below_threshold is
  'True when Google returned a privacy ceiling instead of a count. impressions then means "fewer than this", not "this many".';

comment on column public.pulse_search_terms.dimension is
  'query = Search Console web search. page = landing page. gbp_keyword = Business Profile, i.e. Maps and local search.';
