// Visitor and session identity, without identifying anyone.
//
// There is no cookie and nothing on the visitor's device. Instead an identifier
// is derived server-side from a salt that changes every day. Because the salt
// is gone tomorrow, today's hash cannot be recomputed tomorrow, so no
// identifier can outlive 24 hours by construction rather than by policy.
//
// The IP is an input to this function and is never returned, stored or logged.
// It exists in memory for the length of one request.

import { createHash } from "node:crypto";

/** Days since epoch — the salt rotates when this ticks over. */
function dayIndex(now: Date): number {
  return Math.floor(now.getTime() / 86_400_000);
}

function secret(): string {
  // A missing salt would silently make hashes guessable, so fall back to
  // something unguessable rather than an empty string. The service-role key is
  // already the most protected value we hold and never leaves the server.
  return (
    process.env.PULSE_HASH_SALT ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "f1-pulse-development-salt"
  );
}

/**
 * Stable for one visitor, on one site, for one day.
 *
 * Site id is part of the input on purpose: the same person visiting two client
 * sites produces two unrelated hashes, so the data cannot be joined across
 * sites even by us. That is invariant 5, enforced here.
 */
export function visitorHash(siteId: string, ip: string, userAgent: string, now = new Date()): string {
  return createHash("sha256")
    .update(`${secret()}|${dayIndex(now)}|${siteId}|${ip}|${userAgent}`)
    .digest("hex")
    .slice(0, 32);
}

/**
 * A session is the visitor plus a 30-minute bucket, so a return visit later in
 * the day counts separately without anything being remembered between them.
 *
 * Bucketed rather than idle-timeout based because a true idle timeout needs
 * server-side state per visitor, which is exactly the thing we are avoiding.
 * The tradeoff: a visit spanning a bucket boundary counts as two sessions.
 */
export function sessionHash(visitor: string, now = new Date()): string {
  const bucket = Math.floor(now.getTime() / (30 * 60 * 1000));
  return createHash("sha256").update(`${visitor}|${bucket}`).digest("hex").slice(0, 32);
}
