-- Per-client tier + brand identity used by the monthly-report generator.
-- All columns are nullable; the deck builder falls back to neutral defaults
-- when a value isn't set, so backfill is optional.
alter table public.clients
  add column if not exists tier              text,
  add column if not exists brand_key         text,
  add column if not exists brand_primary     text,
  add column if not exists brand_secondary   text,
  add column if not exists brand_tertiary    text,
  add column if not exists logo_url          text;

comment on column public.clients.tier              is 'Monthly report tier: 1 = Foundation Visibility, 2 = Growth & Authority, 3 = Market Domination.';
comment on column public.clients.brand_key         is 'Key into deck-builder brand-configs.json. Falls back to "default" when null.';
comment on column public.clients.brand_primary     is 'Primary brand hex (no #). Dark background on title/closing slides.';
comment on column public.clients.brand_secondary   is 'Accent hex (no #). Used for stats / positive movement / kickers.';
comment on column public.clients.brand_tertiary    is 'Optional second accent hex (no #).';
comment on column public.clients.logo_url          is 'Public URL to client logo; embedded on cover + closing slides.';
