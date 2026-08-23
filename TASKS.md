# F1 Media — running task list

The list Garrett asked for. Lives in the repo on purpose: it survives a closed
session, and it reaches the other machine on the next `git pull`. A list that
only exists in one chat window is the thing we are trying to avoid.

**Working rules**
- Nothing is marked done here on the strength of reading the code. Done means
  it was exercised against real data and the evidence is written next to it.
- Anything added mid-conversation gets appended here the same day.
- Schema migrations are shown and approved before they are applied. Always.

Last updated: 2026-08-23

---

## Verified working (with evidence)

| Thing | Evidence |
|---|---|
| Calendar runs on Arizona time | 15/15 tests. Offset is UTC−7 in both January and July, so no daylight-saving drift. A 2pm Phoenix meeting stores as 21:00Z, an 8pm event stays on its own day instead of rolling to tomorrow, and unparseable input is rejected rather than stored as garbage. |
| Calendar events persist | 9 live rows, oldest 2026-06-17, newest 2026-08-18. 4 linked to a client. |
| Email actually sends | Supabase pg_cron fires `notify-digest` every 15 min — 288 runs in 3 days, all succeeded — and `daily-summary` nightly. 19 of 19 queued notifications show `sent_at`. `RESEND_API_KEY` and `CRON_SECRET` are set in production. |
| We are not capped at 2 cron jobs | Vercel Hobby allows 2 and both are used (`sync` 09:00Z, `pulse` 08:00Z), but the digests run on **Supabase pg_cron**, which has no such limit. New schedules go there. |
| Pulse alerts reach someone | Fixed 2026-08-23. The dispatcher looked back 3 hours while the cron ran daily, so 81 events across 10 days were never alerted on and never would have been. |
| Rejected-beacon warnings are honest | Fixed 2026-08-23. 28 "beacons rejected" warnings were both clients previewing their own DecoNetwork storefronts. Still rejected — preview clicks are not customers — but no longer alarming. 11 tests including adversarial lookalike domains. |

Run the invariant tests with `npm run checks`.

---

## Open

### 1. Task list, daily email, and reply-to-update — **built; blocked on DNS**
Done and deployed: internal tasks, the T-ref handles, the full open list in the
end-of-day email, the reply endpoint and parser. The list is live as T-1..T-15
in the database.

Not working yet: replies cannot arrive, because `f1mediateam.com` has no MX
record and so cannot receive mail at all. See `docs/inbound-email-setup.md`.

Original scope, for the record:
Garrett's concern is that the list will not keep tabs. So the list itself
becomes a feature of the app rather than a habit:
- `build_tasks` table (internal tasks — `client_id` nullable, unlike the
  existing `tasks` table which requires one and has 0 rows)
- `/admin/tasks` to add, assign, complete
- a daily email to the F1 Media address with what is still open
- replying to that email updates the list
- scheduled on pg_cron, not Vercel

Needs a migration → needs a yes first.

### 2. Broken links and dead functions
36 pages, 26 API routes. Every tab, button, form and link. Looking for routes
nothing links to, links to routes that do not exist, forms with no action, and
buttons wired to nothing.

### 3. Onboarding — accessibility and whether it works
Spans 9 files. Verify a client can actually get through it, the PDF generates
and the gate releases. Then labels, focus order, keyboard operation, contrast.

### 4. Recurring calendar events — **confirmed missing**
`calendar_events` has no recurrence column of any kind. Needs a migration plus
expansion that respects Phoenix wall time, and a decision on what editing one
occurrence does to the series.

### 5. Calendar assignment — clients, employees, references
`assignee_ids` exists but is populated on 1 of 9 rows, so the column is there
and the UX probably is not. Assignees need to be pickable, visible on the
event, and notified.

### 6. Pulse click-through explainers
Every metric clickable through to what it means, how it is measured, and what
to do about it. A glossary already exists at `/admin/pulse/glossary` — wire
panels to it rather than inventing a second vocabulary.

### 7. Every Pulse tab loads real data, and stays free
Client by client, tab by tab. No mock data, no paid call in a free path.
Includes the known Keyword Lab problem: only 4 of 45 tracked keywords have
Search Console position data, which is why the tab looks broken.

### 8. Email coverage audit
Delivery is proven. Coverage is not: does every event worth an email actually
queue one, are opt-outs honoured, is any path orphaned, is the sending domain
verified in Resend.

### 9. Zoho and app links — **blocked, needs Garrett**
"Link in the Soho and apps that you've created." Reading that as Zoho, but
which product (CRM, Books, Mail, Desk), what "link in" means (SSO, data sync,
deep links), and which apps — all unknown.

---

## Paused, not cancelled
Buckets of Ink's accounting, inventory and payroll apps are built but not set
up for F1 Media. Explicitly on hold; kept here so they do not get lost.

---

## Known gaps carried over
- `pulse_daily_rollups` has no writer
- 8 report templates, Domain Overview, and the Compare view are unbuilt
- Offboarding is unbuilt
- Needs Garrett: transparent white logo export, what `mymacroutine.com` is,
  whether CobraFlex should be registered, the 16-month Search Console
  backfill, and a free `PAGESPEED_API_KEY`
