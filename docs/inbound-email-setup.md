# Making replies to the daily task email work

Roughly fifteen minutes across three tabs: Resend, Network Solutions, Vercel.

## Why it does not work today

`f1mediateam.com` has no MX record — the DNS record saying where a domain's
mail should be delivered. Without one the domain can send but cannot receive,
so a reply to `notifications@f1mediateam.com` has nowhere to land.

Everything on our side is built and deployed. Only the return path is missing.

## Steps

**1. Resend → Domains.** Add `tasks.f1mediateam.com` and enable receiving.
Use the subdomain, not the bare domain: an MX record on `f1mediateam.com`
itself would redirect mail for the whole domain.

Do this in the team that already owns `f1mediateam.com`. The `RESEND_API_KEY`
in Vercel belongs to that team, so receiving set up under a different one
fires the webhook and then fails to fetch the body with a key from the wrong
workspace — a 502 with no obvious cause. A subdomain is a separate domain
entry within the same team; it does not appear as a setting on the existing
domain, which is why the Domains list looks like it only has the one. Resend then shows an MX
record to copy — the value is account-specific, so it has to come from there.

**2. Network Solutions → Advanced DNS.** Add one MX record.

| Field | Value |
|---|---|
| Host | `tasks` |
| Type | MX |
| Points to | the value Resend showed |
| Priority | 10, or whatever Resend specifies |
| TTL | 3600 |

Enter the host as `tasks`, not the full hostname — Network Solutions appends
the domain, so typing the whole thing yields
`tasks.f1mediateam.com.f1mediateam.com`.

Verify after 15–60 minutes: `dig +short MX tasks.f1mediateam.com`

**3. Resend → Webhooks.** New webhook, event `email.received` only, URL:

```
https://f1mediateam.com/api/inbound/task-reply?key=<INBOUND_WEBHOOK_SECRET>
```

The secret is in Vercel → Settings → Environment Variables. The key rides in
the URL because email providers sign their webhooks rather than letting you
set a custom header, so header-only auth would make the endpoint unreachable
by the one thing it was built for. Treat the URL as a secret.

Anything other than a 401 on Resend's test ping means the key is right.

**4. Vercel → Environment Variables.** Add to Production:

```
EMAIL_REPLY_TO=tasks@tasks.f1mediateam.com
```

Without it, replies keep going to the address that cannot receive. A deploy
has to go out before it takes effect.

**5. Test.** Reply to the summary email:

```
done T-1
add Check the Buckets of Ink logo files
note T-7 Garrett wants this before Friday
```

A confirmation email comes back listing what changed. Anything it did not
understand is reported and nothing is done with it.

## What a reply can say

| Instruction | Effect |
|---|---|
| `done T-7` | Close it |
| `reopen T-7` | Put it back |
| `add <title>` | New task, filed as F1 Media's own work |
| `note T-7 <text>` | Append a note |

Quoted text below the reply is ignored, so the original email's own examples
are not re-run every time it is answered.

## Notes

- Resend inbound receiving is included on the free plan.
- The webhook carries metadata only; the body is fetched from
  `GET /emails/receiving/{id}` afterwards. `text` is null for HTML-only
  senders, so the body is recovered from the HTML.
