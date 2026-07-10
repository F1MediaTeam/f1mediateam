-- Notification digest + daily summary (2026-07-10)
-- 1) queue table for batched notifications
create table if not exists notification_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  audience text not null check (audience in ('client','admin')),
  kind text not null,
  title text not null,
  detail text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists notification_events_pending_idx
  on notification_events (audience, created_at) where sent_at is null;
alter table notification_events enable row level security;
-- service-role only: no policies on purpose

-- 2) portal-visit stamp used to skip digests the user already saw
alter table profiles add column if not exists last_seen_at timestamptz;

-- 3) schedules (Supabase pg_cron + pg_net)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- activity digest: every 15 minutes
select cron.schedule(
  'f1-notify-digest',
  '*/15 * * * *',
  $$select net.http_get(
      url := 'https://f1mediateam.com/api/cron/notify-digest',
      headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET — get from Vercel env>')
    )$$
);

-- end-of-day summary: 5:00 PM Phoenix (UTC-7, no DST) = 00:00 UTC
select cron.schedule(
  'f1-daily-summary',
  '0 0 * * *',
  $$select net.http_get(
      url := 'https://f1mediateam.com/api/cron/daily-summary',
      headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET — get from Vercel env>')
    )$$
);
