-- App-wide settings (2026-08-09)
--
-- A small key/value store for choices that belong to the whole install rather
-- than to one person or one client. First use: the default theme, so an admin
-- can pick a look and have every browser that hasn't chosen one land on it.
--
-- Read through the service client, not RLS: the default theme has to render on
-- the login page, before anyone is authenticated, and adding an anon-readable
-- policy to a settings table is a wider door than this needs.

create table if not exists public.app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles(id) on delete set null
);

alter table public.app_settings enable row level security;

drop policy if exists app_settings_admin_all on public.app_settings;
create policy app_settings_admin_all on public.app_settings
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

comment on table public.app_settings is
  'Install-wide key/value settings. Values are jsonb so a setting can grow past a scalar without a migration.';
