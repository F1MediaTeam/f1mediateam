-- Per-client interface colour (2026-08-09)
--
-- One designated colour per client, used everywhere that client appears in the
-- admin UI: the block behind a calendar entry, legend chips, and page accents.
--
-- Deliberately NOT brand_primary. That column (0008) is read by the monthly
-- report deck builder as a full-bleed slide background, where a dark, heavy
-- colour is wanted. A colour that reads well as a small calendar chip is often
-- wrong as a title slide, so the two are kept apart and can be set separately.
--
-- Null means "not chosen yet". The app derives a stable colour from the client
-- id in that case, so every client always has exactly one colour — and unlike
-- the previous behaviour, it never changes when another client is added.

alter table public.clients
  add column if not exists ui_color text;

comment on column public.clients.ui_color is
  'Designated interface colour for this client as a #rrggbb hex. Null = derived from the client id.';
