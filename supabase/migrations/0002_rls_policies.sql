-- F1 Media — Phase 1 RLS
-- Strict multi-tenancy: clients only see their own client_id rows.
-- Admins bypass via role check.

-- =========================================================
-- helper functions (security definer; safe — read role from profiles)
-- =========================================================
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

create or replace function public.current_client_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select client_id from public.profiles where id = auth.uid();
$$;

-- =========================================================
-- enable RLS everywhere
-- =========================================================
alter table public.clients              enable row level security;
alter table public.profiles             enable row level security;
alter table public.tasks                enable row level security;
alter table public.calendar_events      enable row level security;
alter table public.metric_snapshots     enable row level security;
alter table public.content_cards        enable row level security;
alter table public.content_card_events  enable row level security;
alter table public.files                enable row level security;
alter table public.login_audit          enable row level security;
alter table public.disclaimer_acceptances enable row level security;
alter table public.email_prefs          enable row level security;
alter table public.connector_tokens     enable row level security;

-- =========================================================
-- clients
-- =========================================================
drop policy if exists clients_admin_all on public.clients;
create policy clients_admin_all on public.clients
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists clients_self_read on public.clients;
create policy clients_self_read on public.clients
  for select to authenticated
  using (id = public.current_client_id());

-- =========================================================
-- profiles
-- =========================================================
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

drop policy if exists profiles_admin_insert on public.profiles;
create policy profiles_admin_insert on public.profiles
  for insert to authenticated
  with check (public.is_admin() or id = auth.uid());

-- =========================================================
-- tasks  (admin-only writes; client read of own tasks not required, but allowed)
-- =========================================================
drop policy if exists tasks_admin_all on public.tasks;
create policy tasks_admin_all on public.tasks
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists tasks_client_read on public.tasks;
create policy tasks_client_read on public.tasks
  for select to authenticated
  using (client_id = public.current_client_id());

-- =========================================================
-- calendar_events
-- =========================================================
drop policy if exists calendar_admin_all on public.calendar_events;
create policy calendar_admin_all on public.calendar_events
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists calendar_client_read on public.calendar_events;
create policy calendar_client_read on public.calendar_events
  for select to authenticated
  using (client_id = public.current_client_id());

-- =========================================================
-- metric_snapshots
-- =========================================================
drop policy if exists snapshots_admin_all on public.metric_snapshots;
create policy snapshots_admin_all on public.metric_snapshots
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists snapshots_client_read on public.metric_snapshots;
create policy snapshots_client_read on public.metric_snapshots
  for select to authenticated
  using (client_id = public.current_client_id());

-- =========================================================
-- content_cards — client can read all, can act on proposed (approve/reject).
-- Stage advance/back is enforced in app code; RLS guards the column updates.
-- =========================================================
drop policy if exists content_admin_all on public.content_cards;
create policy content_admin_all on public.content_cards
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists content_client_read on public.content_cards;
create policy content_client_read on public.content_cards
  for select to authenticated
  using (client_id = public.current_client_id());

-- Client may update a card only if it belongs to their company AND the card
-- is in the proposed stage (so they can approve → pending or note rejection).
-- After approval the row is in pending; further updates are admin-only.
drop policy if exists content_client_act_proposed on public.content_cards;
create policy content_client_act_proposed on public.content_cards
  for update to authenticated
  using (
    client_id = public.current_client_id()
    and stage = 'proposed'
  )
  with check (
    client_id = public.current_client_id()
    and stage in ('proposed', 'pending')
  );

-- =========================================================
-- content_card_events (audit log: append-only)
-- =========================================================
drop policy if exists content_events_admin_all on public.content_card_events;
create policy content_events_admin_all on public.content_card_events
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists content_events_client_read on public.content_card_events;
create policy content_events_client_read on public.content_card_events
  for select to authenticated
  using (
    exists (
      select 1 from public.content_cards c
      where c.id = content_card_events.card_id
        and c.client_id = public.current_client_id()
    )
  );

drop policy if exists content_events_client_insert on public.content_card_events;
create policy content_events_client_insert on public.content_card_events
  for insert to authenticated
  with check (
    actor_role = 'client'
    and actor_user_id = auth.uid()
    and exists (
      select 1 from public.content_cards c
      where c.id = card_id
        and c.client_id = public.current_client_id()
    )
  );

-- =========================================================
-- files
-- =========================================================
drop policy if exists files_admin_all on public.files;
create policy files_admin_all on public.files
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists files_client_read on public.files;
create policy files_client_read on public.files
  for select to authenticated
  using (client_id = public.current_client_id());

-- =========================================================
-- login_audit
-- =========================================================
drop policy if exists login_audit_admin_all on public.login_audit;
create policy login_audit_admin_all on public.login_audit
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists login_audit_self_read on public.login_audit;
create policy login_audit_self_read on public.login_audit
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists login_audit_self_insert on public.login_audit;
create policy login_audit_self_insert on public.login_audit
  for insert to authenticated
  with check (user_id = auth.uid());

-- =========================================================
-- disclaimer_acceptances
-- =========================================================
drop policy if exists disclaimer_admin_all on public.disclaimer_acceptances;
create policy disclaimer_admin_all on public.disclaimer_acceptances
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists disclaimer_self_all on public.disclaimer_acceptances;
create policy disclaimer_self_all on public.disclaimer_acceptances
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- =========================================================
-- email_prefs
-- =========================================================
drop policy if exists email_prefs_admin_all on public.email_prefs;
create policy email_prefs_admin_all on public.email_prefs
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists email_prefs_self_all on public.email_prefs;
create policy email_prefs_self_all on public.email_prefs
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- =========================================================
-- connector_tokens (admin only — sensitive)
-- =========================================================
drop policy if exists connector_tokens_admin_all on public.connector_tokens;
create policy connector_tokens_admin_all on public.connector_tokens
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
