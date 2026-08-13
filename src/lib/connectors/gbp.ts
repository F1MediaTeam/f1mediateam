// Google Business Profile connector.
//
// Scope: https://www.googleapis.com/auth/business.manage
//
// Three separate Google hosts are involved, which is not a mistake:
//   accounts      mybusinessaccountmanagement.googleapis.com/v1
//   locations     mybusinessbusinessinformation.googleapis.com/v1
//   reviews       mybusiness.googleapis.com/v4   ← the legacy API
//
// Reviews never moved off v4. That matters for setup: v4 is only reachable by
// a Google Cloud project that has been granted access through Google's
// Business Profile APIs request form, which is a human review that can take
// days. Enabling the API in the console is not sufficient on its own. Until
// that approval lands, review calls answer 403 and the panel shows its
// not-connected state rather than an error.
//
// Free: none of these APIs cost anything.

import type { Connector, SyncContext, SyncResult } from "./index";
import { getValidAccessToken } from "./google-oauth";

const SCOPE = "https://www.googleapis.com/auth/business.manage";

const ACCOUNTS_API = "https://mybusinessaccountmanagement.googleapis.com/v1";
const INFO_API = "https://mybusinessbusinessinformation.googleapis.com/v1";
const REVIEWS_API = "https://mybusiness.googleapis.com/v4";

export interface GbpLocation {
  /** "locations/12345678901234567890" */
  name: string;
  title: string;
  /** "accounts/1234567890" — reviews are addressed under the account. */
  account: string;
}

export interface GbpReview {
  reviewId: string;
  rating: number | null;
  author: string | null;
  text: string | null;
  replyText: string | null;
  createdAt: string | null;
}

/** Google returns star ratings as words, not numbers. */
const STAR_VALUE: Record<string, number> = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
};

async function googleGet(url: string, token: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const text = await res.text();
    // 403 here is nearly always the v4 access approval rather than a bad
    // token, and saying so saves an hour of looking in the wrong place.
    const hint =
      res.status === 403
        ? " — this usually means the Google Cloud project has not been granted Business Profile API access yet."
        : "";
    throw new Error(`Business Profile API ${res.status}: ${text.slice(0, 200)}${hint}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

/** Every location the authorised account can manage, across all its accounts. */
export async function listGbpLocations(token: string): Promise<GbpLocation[]> {
  const accountsJson = await googleGet(`${ACCOUNTS_API}/accounts`, token);
  const accounts = (accountsJson.accounts as Array<{ name: string }> | undefined) ?? [];

  const out: GbpLocation[] = [];
  for (const account of accounts) {
    // readMask is required by this API — omitting it is a 400, not a default.
    const url = `${INFO_API}/${account.name}/locations?readMask=name,title&pageSize=100`;
    let json: Record<string, unknown>;
    try {
      json = await googleGet(url, token);
    } catch {
      // One account failing shouldn't hide the locations under the others.
      continue;
    }
    for (const loc of (json.locations as Array<{ name: string; title?: string }> | undefined) ?? []) {
      out.push({ name: loc.name, title: loc.title ?? loc.name, account: account.name });
    }
  }
  return out;
}

/**
 * Reviews for one location, newest first.
 *
 * `location` is the bare "locations/123…" name; the v4 path needs it nested
 * under its account, which is why GbpLocation carries both.
 */
export async function fetchGbpReviews(
  token: string,
  account: string,
  location: string,
  limit = 50,
): Promise<{ reviews: GbpReview[]; averageRating: number | null; totalCount: number }> {
  const locationId = location.startsWith("locations/") ? location : `locations/${location}`;
  const json = await googleGet(
    `${REVIEWS_API}/${account}/${locationId}/reviews?pageSize=${Math.min(limit, 200)}`,
    token,
  );

  const raw =
    (json.reviews as Array<{
      reviewId?: string;
      name?: string;
      starRating?: string;
      comment?: string;
      createTime?: string;
      reviewer?: { displayName?: string };
      reviewReply?: { comment?: string };
    }> | undefined) ?? [];

  const reviews: GbpReview[] = raw.map((r) => ({
    // reviewId is absent on some responses; the full resource name is always
    // unique, so it is the safer key for the upsert.
    reviewId: r.reviewId ?? r.name ?? "",
    rating: r.starRating ? (STAR_VALUE[r.starRating] ?? null) : null,
    author: r.reviewer?.displayName ?? null,
    text: r.comment ?? null,
    replyText: r.reviewReply?.comment ?? null,
    createdAt: r.createTime ?? null,
  }));

  return {
    reviews: reviews.filter((r) => r.reviewId),
    averageRating: typeof json.averageRating === "number" ? json.averageRating : null,
    totalCount: typeof json.totalReviewCount === "number" ? json.totalReviewCount : reviews.length,
  };
}

export const gbpConnector: Connector = {
  provider: "gbp",
  label: "Google Business Profile",

  buildAuthUrl({ clientId, redirectUri, state }) {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
      redirect_uri: redirectUri,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      scope: SCOPE,
      state: `${state}:${clientId}:gbp`,
      // Same rule as gsc and ga4: no include_granted_scopes. Incremental
      // authorization would bundle the other providers' scopes into this
      // grant and revoke their refresh tokens.
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  },

  /**
   * Rating and review count as metrics, so the portal's existing snapshot
   * pipeline and the client dashboard get them for free. The reviews
   * themselves are rows rather than metrics and are collected Pulse-side into
   * pulse_reviews.
   */
  async sync(ctx: SyncContext): Promise<SyncResult> {
    const { access_token, credentials } = await getValidAccessToken(ctx.token.id);

    const locations = await listGbpLocations(access_token);
    // account_label holds the chosen location once one is picked; with a
    // single managed location there is nothing to choose.
    const chosen =
      locations.find((l) => l.name === credentials.account_label) ?? locations[0] ?? null;
    if (!chosen) throw new Error("No Business Profile locations available for this account");

    const { averageRating, totalCount } = await fetchGbpReviews(
      access_token,
      chosen.account,
      chosen.name,
      1,
    );

    const captured_at = new Date().toISOString().slice(0, 10);
    const snapshots: SyncResult["snapshots"] = [];
    if (averageRating !== null) {
      snapshots.push({
        source: "gbp",
        metric: "gbp_rating",
        value: averageRating,
        captured_at,
        is_baseline: false,
        meta: { location: chosen.title },
      });
    }
    snapshots.push({
      source: "gbp",
      metric: "gbp_reviews",
      value: totalCount,
      captured_at,
      is_baseline: false,
      meta: { location: chosen.title },
    });

    return { snapshots, effectiveAsOf: captured_at };
  },
};
