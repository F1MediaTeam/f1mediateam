# F1 Media — Client SEO & Marketing Platform

Multi-tenant Next.js + Supabase reporting platform for a solo marketing/SEO
consultant managing many client companies.

## Running locally (mock mode — no Supabase needed)

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with one of
the demo accounts (shown on the login page):

- `admin@f1media.dev` / `demo` — admin
- `owner@northwind.example` / `demo` — Northwind HVAC (client)
- `marketing@acme.example` / `demo` — Acme Roofing (client)

The mock store persists to `.data/mock-store.json` so dev-server restarts
don't blow away your task edits, content approvals, etc. Delete that file
to reseed.

## Routes

### Admin (`/admin`)
- `/admin` — Work dashboard (Today / Tomorrow / This Week)
- `/admin/calendar` — Master calendar, color-coded per client
- `/admin/clients` — Client list
- `/admin/clients/[id]` — Per-client profile: baseline vs current, connectors, widget config
- `/admin/content` — Content approval board (Proposed / Pending / Posted)
- `/admin/reports` — Weekly/monthly/yearly/custom reports
- `/admin/audit` — Global login audit

### Client (`/client`)
- `/client` — Shared dashboard (widgets driven by `client.config.widgets`)
- `/client/content` — Approve cards, request changes
- `/client/files` — Per-client storage view
- `/client/settings` — Email opt-out, sign-in history

## Architecture

- **One shared client dashboard.** Every client renders from
  `src/app/client/page.tsx` — per-client variation comes from
  `client.config.widgets`, not from forked code.
- **Strict multi-tenancy.** Every table has `client_id`. RLS policies in
  `supabase/migrations/0002_rls_policies.sql` guarantee a client can only
  read/write their own rows; admin role bypasses to see all.
- **Audit-first.** Every successful sign-in writes a `login_audit` row.
  Every content stage move writes a `content_card_events` row.
- **Snapshot store.** Live syncs (GSC, GA4) write into `metric_snapshots`
  as the accumulating record — that's what powers baseline-vs-now and reports.

## Migrating to Supabase + Vercel

The localhost mock is a parity shim — the data adapter exposes the same
functions a Supabase adapter will. To switch:

1. **Create a fresh Supabase project** (use the new account).
2. In the SQL Editor, run `supabase/migrations/0001_initial_schema.sql`,
   then `0002_rls_policies.sql`.
3. **Create users**: add an admin user + one per client in Supabase Auth.
   INSERT a `profiles` row for each with the right `role` and `client_id`.
4. **Set env vars** (`.env.local` locally, Vercel project env in prod) —
   see `.env.example`.
5. **Replace the mock adapter.** In `src/lib/data/index.ts`, build a
   `supabase-adapter.ts` that re-exports the same function names backed
   by `@supabase/ssr` queries. Every page stays identical — they import
   `data` from `@/lib/data`.
6. **Deploy to Vercel.** `vercel.json` already wires the cron job that
   hits `/api/cron/sync` daily.

## What's NOT built (left as clean extension points)

- **Real OAuth + sync** for GSC and GA4. The connector framework, token
  shape, snapshot writer, and cron route are all in place. Wiring the
  Google OAuth flow + their REST endpoints is the next session.
- **Email send.** Opt-out preference is captured; plug in Resend or
  Postmark and call from a server action.
- **File upload UI** for admins. Storage path is in place; swap to
  Supabase Storage upload on the swap.
- **Later phases**: Google Ads, Bing WMT, Semrush, Meta Graph, TikTok,
  Zoho Books, DocuSign. The connector interface accommodates all of them.

## Brand tokens

Swap the look-and-feel by editing CSS vars in `src/app/globals.css`:
`--color-accent`, `--color-bg`, fonts in `layout.tsx`, etc.
