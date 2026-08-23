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
// A fourth host, for performance data. Same scope, no extra approval — unlike
// the v4 reviews API, this one works as soon as it is enabled.
const PERFORMANCE_API = "https://businessprofileperformance.googleapis.com/v1";

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

export interface GbpSearchKeyword {
  keyword: string;
  /** Impressions in the window. When belowThreshold, read as "fewer than". */
  impressions: number;
  /**
   * Google withholds exact counts for low-volume terms and returns a ceiling
   * instead. Treating that ceiling as a count would overstate local demand,
   * so which one arrived is carried alongside the number rather than lost.
   */
  belowThreshold: boolean;
}

/**
 * The searches that actually surfaced this business on Google and Maps.
 *
 * This is the local half of demand, and Search Console never sees it: someone
 * searching "sign shop near me" on their phone and tapping a map result leaves
 * no trace in the web-search data at all. For a local service business that is
 * not a rounding error, it is most of the intent.
 *
 * Monthly only — Google publishes no daily breakdown for search terms. Results
 * page at 100, so a busy location needs several round trips.
 */
export async function fetchSearchKeywords(
  locationName: string,
  token: string,
  months = 3,
): Promise<GbpSearchKeyword[]> {
  // Google's current month is always partial, so the window ends last month.
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - (months - 1), 1));

  const id = locationName.startsWith("locations/") ? locationName : `locations/${locationName}`;
  const base = new URLSearchParams({
    "monthlyRange.start_month.year": String(start.getUTCFullYear()),
    "monthlyRange.start_month.month": String(start.getUTCMonth() + 1),
    "monthlyRange.end_month.year": String(end.getUTCFullYear()),
    "monthlyRange.end_month.month": String(end.getUTCMonth() + 1),
    pageSize: "100",
  });

  const out: GbpSearchKeyword[] = [];
  let pageToken: string | null = null;

  // Bounded rather than while(true): a pagination bug on Google's side or ours
  // should cost a wasted request, not an endless loop in a scheduled job.
  for (let page = 0; page < 20; page++) {
    const params = new URLSearchParams(base);
    if (pageToken) params.set("pageToken", pageToken);

    const body = await googleGet(`${PERFORMANCE_API}/${id}/searchkeywords/impressions/monthly?${params}`, token);
    const rows = (body.searchKeywordsCounts as Array<Record<string, unknown>>) ?? [];

    for (const row of rows) {
      const keyword = String(row.searchKeyword ?? "").trim();
      if (!keyword) continue;
      const insights = (row.insightsValue ?? {}) as { value?: string; threshold?: string };
      const exact = insights.value != null;
      const raw = Number(exact ? insights.value : insights.threshold);
      if (!Number.isFinite(raw)) continue;
      out.push({ keyword, impressions: raw, belowThreshold: !exact });
    }

    pageToken = (body.nextPageToken as string) ?? null;
    if (!pageToken) break;
  }

  // Exact counts first, then thresholds — a "fewer than 15" should never sort
  // above a measured 12.
  out.sort((a, b) =>
    a.belowThreshold === b.belowThreshold
      ? b.impressions - a.impressions
      : a.belowThreshold ? 1 : -1,
  );
  return out;
}
