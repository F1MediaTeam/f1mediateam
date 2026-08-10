-- Employee roles and per-client assignment (2026-08-10)
--
-- The app has had exactly two roles since day one: 'admin' and 'client'. Every
-- F1 Media person is a full admin who sees every customer, and there is no way
-- to limit anyone's view of anything.
--
-- Deliberately NOT done by adding values to the user_role enum. That enum is
-- what is_admin() checks, which is what every RLS policy is built on, and what
-- requireAdmin() gates every admin page with. A new enum value would be
-- non-admin everywhere at once and lock those people out of the console the
-- moment it shipped. So 'admin' stays the coarse gate — "may open the admin
-- console" — and staff_role layers granularity on top of it.
--
-- staff_role is nullable and null means owner. Every existing admin therefore
-- keeps full access on deploy; nobody has to be migrated before the feature is
-- safe to ship.

alter table public.profiles
  add column if not exists staff_role text
    check (staff_role is null or staff_role in ('owner', 'manager', 'specialist', 'contractor'));

comment on column public.profiles.staff_role is
  'Granularity within role=admin: owner | manager | specialist | contractor. Null = owner (full access). Ignored for role=client.';

-- =========================================================
-- client_assignments: which staff work on which customers
-- =========================================================
-- Owners and managers see every client regardless of what is in here; this
-- table is what narrows a specialist or contractor to their own accounts.

create table if not exists public.client_assignments (
  client_id  uuid not null references public.clients(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.profiles(id) on delete set null,
  primary key (client_id, profile_id)
);

create index if not exists client_assignments_profile_idx
  on public.client_assignments (profile_id);

alter table public.client_assignments enable row level security;

-- Admin-only: the assignment list is internal, and the client portal must
-- never be able to read who works on what.
drop policy if exists client_assignments_admin_all on public.client_assignments;
create policy client_assignments_admin_all on public.client_assignments
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
