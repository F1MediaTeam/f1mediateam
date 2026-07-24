-- Admin visual style editor (2026-07-23)
--
-- Backs the crosshair style inspector in the admin console. Two tables:
--   ui_overrides     — the styles currently applied to /admin/* pages
--   ui_style_default — a single-row snapshot of ui_overrides that the admin
--                      "Set as default" button writes, and "Reset" restores
--
-- Nothing here touches the client portal: the generated <style> block is
-- rendered only from src/app/admin/layout.tsx.

-- 1) live overrides ---------------------------------------------------------

create table if not exists ui_overrides (
  id          uuid primary key default gen_random_uuid(),
  -- 'token'   → a CSS custom property, e.g. --color-bg-card (site-wide)
  -- 'group'   → every element sharing a class signature, e.g. all nav links
  -- 'element' → one element carrying a data-style-id
  scope       text not null check (scope in ('token', 'group', 'element')),
  -- token name, class signature, or data-style-id depending on scope
  selector    text not null,
  -- { "color": "#fff", "backgroundColor": "#000", "fontWeight": "700", ... }
  styles      jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references profiles(id) on delete set null
);

-- One row per target, so saving the same element twice updates in place.
create unique index if not exists ui_overrides_scope_selector_idx
  on ui_overrides (scope, selector);

alter table ui_overrides enable row level security;

-- Admins only — both read and write. Client accounts never select this table;
-- their pages don't render the override <style> block at all.
drop policy if exists ui_overrides_admin_all on ui_overrides;
create policy ui_overrides_admin_all on ui_overrides
  for all
  using      (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

-- 2) the saved default ------------------------------------------------------

-- Single row (id is pinned to 1) holding a snapshot of every ui_overrides row
-- as a JSON array. "Set as default" overwrites it; "Reset" replays it back
-- into ui_overrides. Keeping it as one blob makes both operations atomic.
create table if not exists ui_style_default (
  id          smallint primary key default 1 check (id = 1),
  snapshot    jsonb not null default '[]'::jsonb,
  saved_at    timestamptz not null default now(),
  saved_by    uuid references profiles(id) on delete set null
);

insert into ui_style_default (id, snapshot)
  values (1, '[]'::jsonb)
  on conflict (id) do nothing;

alter table ui_style_default enable row level security;

drop policy if exists ui_style_default_admin_all on ui_style_default;
create policy ui_style_default_admin_all on ui_style_default
  for all
  using      (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));
