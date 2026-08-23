-- The running task list, as a thing the app owns rather than a habit.
--
-- A task system already exists — the tasks table, the Add Task modal on the
-- admin dashboard, full CRUD, and the end-of-day summary email that already
-- reaches garrett.f1mediateam@gmail.com. Extending it beats building a second
-- one: two task lists would disagree the first day either was edited, and the
-- one nobody opens would be the one holding the important item.
--
-- Three gaps stop it doing what was asked.
--
--   1. client_id is NOT NULL, so every task must belong to a client. "Fix the
--      calendar" belongs to the business. That is why the table is empty.
--   2. Tasks cannot be assigned to anyone.
--   3. Nothing in an email can refer to a specific task, so a reply has no
--      way to say which one it means. A uuid is not something anyone types.

-- =========================================================
-- 1. Internal tasks
-- =========================================================
alter table public.tasks alter column client_id drop not null;

comment on column public.tasks.client_id is
  'The client this is for, or null when it is internal work for F1 Media itself.';

-- =========================================================
-- 2. Assignment
-- =========================================================
-- Mirrors calendar_events.assignee_ids deliberately: same shape, so the same
-- picker component and the same notification code serve both.
alter table public.tasks
  add column if not exists assignee_ids uuid[] not null default '{}';

-- =========================================================
-- 3. Something a human can type in a reply
-- =========================================================
-- The daily email lists "T-7 Fix the calendar", and a reply saying "done T-7"
-- is unambiguous. Backfills existing rows in creation order.
alter table public.tasks
  add column if not exists ref bigint;

create sequence if not exists public.tasks_ref_seq owned by public.tasks.ref;

update public.tasks
   set ref = nextval('public.tasks_ref_seq')
 where ref is null;

alter table public.tasks
  alter column ref set default nextval('public.tasks_ref_seq');

-- Unique rather than primary: the uuid stays the key, this is just the handle.
create unique index if not exists tasks_ref_key on public.tasks (ref);

comment on column public.tasks.ref is
  'Short human handle, e.g. T-7. Exists so a reply to the daily email can name a task.';

-- =========================================================
-- RLS — nothing to change, and that is worth writing down
-- =========================================================
-- Checked against production rather than assumed. Two policies exist:
--
--   tasks_admin_all    ALL    using (is_admin())
--   tasks_client_read  SELECT using (client_id = current_client_id())
--
-- An internal task has client_id null, and `null = current_client_id()` is
-- NULL, never true, so clients cannot see internal tasks. Admins still can.
-- Dropping NOT NULL is therefore safe as it stands.
--
-- The first draft of this migration added a policy reading
-- `using (client_id is not null or public.is_admin())` to "make that
-- explicit". It would have been a hole: permissive policies combine with OR,
-- so that clause grants every authenticated user read access to every task
-- that has a client — i.e. each client could read all the others'. Left here
-- as a warning rather than deleted quietly.
