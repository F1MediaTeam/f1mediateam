-- F1 Media — Phase 1 follow-on schema
-- 1) admin "view-as" / impersonation audit
-- 2) richer geolocation on login audit
-- 3) per-client onboarding submission

-- =========================================================
-- admin_impersonations: every time admin enters a client's portal as them
-- =========================================================
create table if not exists public.admin_impersonations (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references public.profiles(id) on delete set null,
  client_id uuid not null references public.clients(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  ip text,
  city text,
  region text,
  country text
);

create index if not exists admin_impersonations_client_idx
  on public.admin_impersonations(client_id, started_at desc);
create index if not exists admin_impersonations_admin_idx
  on public.admin_impersonations(admin_user_id, started_at desc);

alter table public.admin_impersonations enable row level security;

drop policy if exists admin_imp_admin_all on public.admin_impersonations;
create policy admin_imp_admin_all on public.admin_impersonations
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Clients can see when their own dashboard was viewed by an admin.
drop policy if exists admin_imp_client_read on public.admin_impersonations;
create policy admin_imp_client_read on public.admin_impersonations
  for select to authenticated
  using (client_id = public.current_client_id());

-- =========================================================
-- login_audit: add city/region/country (drop reliance on user_agent in UI)
-- =========================================================
alter table public.login_audit
  add column if not exists city text,
  add column if not exists region text,
  add column if not exists country text;

-- =========================================================
-- client_onboarding: stored questionnaire from the first-login modal
-- =========================================================
create table if not exists public.client_onboarding (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  submitted_by uuid references public.profiles(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  terms_version text not null,
  accepted_terms boolean not null default false,
  submitted_at timestamptz not null default now(),
  unique (client_id)
);

create index if not exists client_onboarding_client_idx on public.client_onboarding(client_id);

alter table public.client_onboarding enable row level security;

drop policy if exists onboarding_admin_all on public.client_onboarding;
create policy onboarding_admin_all on public.client_onboarding
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists onboarding_client_read on public.client_onboarding;
create policy onboarding_client_read on public.client_onboarding
  for select to authenticated
  using (client_id = public.current_client_id());

drop policy if exists onboarding_client_insert on public.client_onboarding;
create policy onboarding_client_insert on public.client_onboarding
  for insert to authenticated
  with check (client_id = public.current_client_id() and submitted_by = auth.uid());

drop policy if exists onboarding_client_update on public.client_onboarding;
create policy onboarding_client_update on public.client_onboarding
  for update to authenticated
  using (client_id = public.current_client_id())
  with check (client_id = public.current_client_id());
