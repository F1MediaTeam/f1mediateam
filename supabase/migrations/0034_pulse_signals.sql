-- What real visitors run into.
--
-- Everything Pulse knows about a client's site today comes from crawling it or
-- from Google. Both miss the same thing: what actually happens to the people
-- on it. A crawler follows links from the sitemap and finds every page that
-- exists — it will never find the dead URL a customer reached from an old
-- Facebook post, and it cannot see the checkout throwing an error on iPhone.
--
-- The tag is already on these sites and already survives the page unloading.
-- It just was not being asked.
--
-- Five signals, each chosen because it is something a client would pay to be
-- told and cannot find out on their own:
--
--   js_error     their site is broken, with the file and line
--   not_found    a real person hit a dead page, and where they came from
--   rage_click   somebody clicked the same spot repeatedly, so it looks
--                clickable and is not
--   scroll_depth how far down a page people actually get
--   slow_page    a page that was slow for a real visitor on a real device,
--                not for a test runner in a datacentre

create table if not exists public.pulse_signals (
  id           bigserial primary key,
  site_id      uuid not null references public.pulse_sites(id) on delete cascade,
  ts           timestamptz not null default now(),
  kind         text not null check (kind in
                 ('js_error', 'not_found', 'rage_click', 'scroll_depth', 'slow_page')),
  path         text not null,
  -- Error message, referring page, or element description. Always truncated,
  -- never anything a visitor typed. Query strings are stripped from any URL
  -- that lands here: a stack trace can carry ?email=... through, and that is
  -- exactly the kind of accident this column would otherwise make permanent.
  detail       text,
  -- Scroll percentage, milliseconds, or a click count, depending on kind.
  value        numeric,
  session_hash text
);

create index if not exists pulse_signals_site_kind_idx
  on public.pulse_signals (site_id, kind, ts desc);
create index if not exists pulse_signals_path_idx
  on public.pulse_signals (site_id, kind, path);

-- Default deny, matching every other pulse table.
alter table public.pulse_signals enable row level security;

drop policy if exists pulse_signals_admin_read on public.pulse_signals;
create policy pulse_signals_admin_read on public.pulse_signals
  for select to authenticated using (public.is_admin());

comment on table public.pulse_signals is
  'What real visitors hit: broken scripts, dead pages, dead clicks, how far they scroll, and what was slow for them.';
