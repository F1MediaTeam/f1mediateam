# F1 Pulse

First-party, cookieless analytics for client sites, plus the server-side
collectors that measure everything a browser tag cannot see.

Admin-only in this version. The schema is client-scoped throughout, so
client-facing views can be added later without reshaping anything.

## How a site starts reporting

1. **Add the site** — `/admin/pulse` → *Add client site*. This generates a key
   (`f1_` + 20 hex characters) and the snippet.
2. **Paste the snippet** into the client's footer:
   ```html
   <script defer src="https://f1mediateam.com/f1.js" data-site="f1_…"></script>
   ```
3. **Confirm** with *Check installation*. It passes on either proof — the tag in
   the page source, or a beacon already received. Either alone has a blind spot:
   HTML scanning misses tag-manager injection, and beacon-checking misses a
   correct install nobody has visited yet.

Status goes `pending` → `live` on the first beacon, and a `tag_detected` event
appears in the feed.

## Layout

```
public/f1.js                      the tag itself
src/app/api/pulse/ingest          the only endpoint the tag talks to
src/app/api/pulse/refresh/[c]     every collector, manual or scheduled
src/lib/pulse/hash.ts             daily-rotating visitor/session hashing
src/lib/pulse/sites.ts            site records, snippet, install checking
src/lib/pulse/heartbeat.ts        uptime + tag presence
src/lib/pulse/collectors/         ranks, backlinks, crawl, robots, search
src/lib/pulse/providers/serp.ts   rank + backlink provider, real or mock
src/lib/pulse/dashboard.ts        every read the UI makes
src/lib/pulse/aggregates.ts       monthly rollups for the deck
src/app/admin/pulse/              the screens
```

## Privacy invariants

These are not policy — they are enforced by construction, and any change that
would break one should be treated as a bug.

1. **No cookies, no storage, no fingerprinting.** The tag writes nothing to the
   visitor's device.
2. **No raw IP is ever persisted.** There is no column for one. The IP exists in
   memory for the length of one request, as hash input; country comes from the
   edge header rather than a lookup we perform.
3. **The hash salt rotates every 24 hours**, so today's identifier cannot be
   recomputed tomorrow.
4. **No form field values, ever.** The tag reads a form's `id`/`name` and
   nothing inside it.
5. **No cross-site joins.** The site id is hash input, so the same person on two
   client sites produces two unrelated hashes.
6. **First-party only.** The tag calls our domain and nothing else.

## Mock mode

Ranks and backlinks run against mock data when `PULSE_MOCK=true`, or whenever
`DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD` are unset. Mock output is
deterministic — the same keyword always yields the same position, and movement
comes from the date rather than a random number, so a demo is stable and a
regression is visible. Runs are flagged `mocked` in `pulse_runs` and the UI
shows a *Sample data* badge.

## Environment

| Variable | Needed for | Without it |
|---|---|---|
| `PULSE_HASH_SALT` | Visitor hashing | Falls back to the service-role key |
| `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD` | Real ranks + backlinks | Mock mode |
| `PULSE_MOCK` | Force mock even with credentials | — |
| `CRON_SECRET` | Scheduled collector calls | Manual refresh still works |

## Scheduling

Every collector is one endpoint: `POST /api/pulse/refresh/{collector}` with
`Authorization: Bearer $CRON_SECRET`. Collectors are `heartbeat`, `ranks`,
`backlinks`, `crawl`, `search`.

The crawler is resumable and **must be called repeatedly**: each call works a
slice and returns `{ done: false }` until the queue drains. 2,000 pages at one
request per second is about 33 minutes against a 300-second function ceiling,
so a crawl cannot be a single call. Schedule a tick every few minutes.

## Using the aggregates in the deck

```ts
import { pulseMonthly, toMonthlyContent, brand } from "@/lib/pulse/aggregates";

const rollup = await pulseMonthly(clientId);

if (rollup) {
  // Spread over whatever the deck is already assembling — this returns a
  // partial, so the AI-written narrative is preserved rather than replaced.
  content = { ...content, ...toMonthlyContent(rollup) };
}
```

`pulseMonthly` returns `null` when the client has no Pulse site. Handle that
rather than rendering zeroes: a deck full of zeroes reads as "we lost all your
traffic", not "this wasn't measured".

A worked example of the returned object:

```jsonc
{
  "clientName": "Buckets Of Ink",
  "domain": "bucketsofink.com",
  "period": { "label": "August 2026", "from": "2026-07-12", "to": "2026-08-11" },
  "traffic": {
    "visitors": 1284, "pageviews": 3106, "sessions": 1502,
    "avgEngagementSec": 47, "visitorsDelta": 18,
    "topPages": [{ "path": "/screen-printing-supplies", "views": 412 }],
    "vitals": [{ "metric": "LCP", "p75": 2310, "verdict": "good" }]
  },
  "conversions": { "total": 63, "byKind": { "tel_click": 41, "form_submit": 12 } },
  "rankings": {
    "tracked": 15, "inTop10": 6,
    "improved": [{ "phrase": "screen printing supplies", "from": 14, "to": 8 }]
  },
  "backlinks": { "live": 11, "gained": 2, "lost": 0, "newDomains": ["yelp.com"] },
  "siteHealth": { "pagesCrawled": 2000, "errors": 3, "botsBlocked": [], "botsTracked": 10 },
  "search": { "clicks": 2140, "impressions": 48210, "ctr": 0.044, "position": 12.7 }
}
```

`brand` is exported from the same module so the deck, the report view and any
export stamp identical branding rather than hardcoding it twice.

## White-label rule

No third-party provider name appears on any client-facing surface or in any
export. Vendors may be named in `pulse_runs` and internal logs only.
