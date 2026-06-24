-- F1 Media — Phase 1 schema
-- Multi-tenant marketing/SEO reporting platform
-- Run against a fresh Supabase project: `supabase db push` or paste into SQL Editor.

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- =========================================================
-- clients (tenants)
-- =========================================================
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  join_date date not null default current_date,
  websites text[] not null default '{}',
  config jsonb not null default '{}'::jsonb,
  branding jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================
-- profiles (one row per auth.users user)
-- =========================================================
create type public.user_role as enum ('admin', 'client');

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null default 'client',
  client_id uuid references public.clients(id) on delete cascade,
  full_name text,
  email text not null,
  created_at timestamptz not null default now(),
  -- admins do not need a client_id; clients must have one
  constraint client_must_have_client_id
    check (role = 'admin' or client_id is not null)
);

create index if not exists profiles_client_id_idx on public.profiles(client_id);

-- =========================================================
-- tasks (admin work queue, scoped per client)
-- =========================================================
create type public.task_status as enum ('open', 'done');

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  title text not null,
  notes text,
  due_date date,
  status public.task_status not null default 'open',
  assigned_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_client_id_idx on public.tasks(client_id);
create index if not exists tasks_due_date_idx on public.tasks(due_date);

-- =========================================================
-- calendar events (meetings + work deadlines)
-- =========================================================
create type public.calendar_event_type as enum ('meeting', 'deadline');

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  type public.calendar_event_type not null,
  title text not null,
  notes text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists calendar_events_starts_at_idx on public.calendar_events(starts_at);
create index if not exists calendar_events_client_id_idx on public.calendar_events(client_id);

-- =========================================================
-- metric snapshots — the accumulating record powering baseline-vs-now
-- =========================================================
create table if not exists public.metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  source text not null,        -- e.g. 'gsc' | 'ga4' | 'manual'
  metric text not null,        -- e.g. 'clicks' | 'impressions' | 'sessions' | 'avg_position' | 'visibility'
  value numeric not null,
  captured_at date not null,   -- the date the metric covers, not when row was written
  is_baseline boolean not null default false,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (client_id, source, metric, captured_at)
);

create index if not exists metric_snapshots_client_metric_idx
  on public.metric_snapshots(client_id, metric, captured_at desc);
create index if not exists metric_snapshots_baseline_idx
  on public.metric_snapshots(client_id, metric) where is_baseline;

-- =========================================================
-- content approval board
-- =========================================================
create type public.content_stage as enum ('proposed', 'pending', 'posted');

create table if not exists public.content_cards (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  title text not null,
  body text,
  link text,
  file_url text,
  stage public.content_stage not null default 'proposed',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists content_cards_client_stage_idx
  on public.content_cards(client_id, stage);

create table if not exists public.content_card_events (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.content_cards(id) on delete cascade,
  from_stage public.content_stage,
  to_stage public.content_stage not null,
  actor_user_id uuid references public.profiles(id),
  actor_role public.user_role not null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists content_card_events_card_idx
  on public.content_card_events(card_id, created_at desc);

-- =========================================================
-- per-client files
-- =========================================================
create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  filename text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  category text,               -- 'video' | 'report' | 'other'
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists files_client_id_idx on public.files(client_id);

-- =========================================================
-- audit: client logins
-- =========================================================
create table if not exists public.login_audit (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  logged_in_at timestamptz not null default now(),
  ip text,
  user_agent text
);

create index if not exists login_audit_client_idx on public.login_audit(client_id, logged_in_at desc);
create index if not exists login_audit_user_idx on public.login_audit(user_id, logged_in_at desc);

-- =========================================================
-- disclaimer acceptances (first-login terms)
-- =========================================================
create table if not exists public.disclaimer_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  version text not null,
  accepted_at timestamptz not null default now(),
  unique (user_id, version)
);

-- =========================================================
-- email preferences
-- =========================================================
create table if not exists public.email_prefs (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  opted_out boolean not null default false,
  updated_at timestamptz not null default now()
);

-- =========================================================
-- connector tokens (encrypted at the application boundary)
-- =========================================================
create table if not exists public.connector_tokens (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  provider text not null,             -- 'gsc' | 'ga4' | future: 'google_ads' | 'bing_wmt' | 'semrush' | 'meta' | 'tiktok'
  account_label text,                 -- e.g. GA4 property id, GSC site, friendly name
  access_token_ciphertext text,       -- encrypted with app-level key
  refresh_token_ciphertext text,
  expires_at timestamptz,
  scopes text[] not null default '{}',
  meta jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  last_sync_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, provider, account_label)
);

create index if not exists connector_tokens_client_idx on public.connector_tokens(client_id);

-- =========================================================
-- updated_at trigger
-- =========================================================
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  for t in
    select unnest(array['clients','tasks','content_cards','connector_tokens'])
  loop
    execute format(
      'drop trigger if exists set_updated_at on public.%I; '
      'create trigger set_updated_at before update on public.%I '
      'for each row execute function public.tg_set_updated_at();',
      t, t);
  end loop;
end$$;
