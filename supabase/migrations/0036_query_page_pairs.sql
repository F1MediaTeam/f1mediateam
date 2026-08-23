-- Which page Google actually ranks for each search.
--
-- Search Console is asked for queries and for pages separately today, which
-- loses the join between them — and that join is where the useful question
-- lives. The Keyword Lab can already say which page *should* win a keyword,
-- because somebody assigned it. It cannot say which page *is* winning.
--
-- When those disagree, that gap is usually the actual problem: a dedicated
-- service page was written, and Google kept ranking the homepage for the term
-- anyway. Nothing in the app surfaces that today because nothing stores it.
--
-- Stored in pulse_search_terms rather than a new table. A pair is still a
-- search term with metrics attached; what makes it different is that the page
-- is filled in, and the dimension says so.

alter table public.pulse_search_terms
  drop constraint if exists pulse_search_terms_dimension_check;

alter table public.pulse_search_terms
  add constraint pulse_search_terms_dimension_check
  check (dimension in ('query', 'page', 'gbp_keyword', 'query_page'));

-- Null for every existing row and for every dimension except query_page, where
-- `term` holds the search and this holds the URL that ranked for it.
alter table public.pulse_search_terms
  add column if not exists page text;

comment on column public.pulse_search_terms.page is
  'For dimension=query_page, the URL Google actually ranked for `term`. Null otherwise.';

-- The lookup is always "the pages for these queries, on this site, recently".
create index if not exists pulse_search_terms_query_page_idx
  on public.pulse_search_terms (site_id, dimension, period_start desc)
  where dimension = 'query_page';
