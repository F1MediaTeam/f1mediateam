// Local Presence — the Google Business Profile side of a client's visibility.
//
// For a local business this is often the most consequential surface there is:
// the map pack sits above the organic results, and the star rating next to a
// name decides whether anyone clicks it. It is also the one place where a
// single unhappy customer changes the number overnight, which is why new
// reviews are a feed event rather than a figure that quietly moves.
//
// Free — the Business Profile APIs cost nothing. What they do require is
// Google's approval of the Cloud project for the v4 reviews API, which is a
// human review taking days. Until that lands, or before a client's profile is
// connected, this runs in mock mode so the panel is complete and demonstrable.
//
// Section 5 note: reviews are public writing by identifiable people, so they
// are client data, not visitor data. Nothing here touches the privacy
// invariants around the tag — no visitor is involved at any point.

import { createServiceClient } from "@/lib/supabase/server";
import { data } from "@/lib/data";
import { getValidAccessToken } from "@/lib/connectors/google-oauth";
import { fetchGbpReviews, listGbpLocations, type GbpReview } from "@/lib/connectors/gbp";
import { isMock } from "@/lib/pulse/providers/serp";
import type { PulseSite } from "@/lib/pulse/sites";

export interface LocalRunResult {
  siteId: string;
  domain: string;
  location: string | null;
  rating: number | null;
  reviewCount: number;
  newReviews: number;
  mocked: boolean;
  skipped?: string;
}

/** Stable pseudo-random from a string, so mock output never reshuffles. */
function seed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h % 10_000) / 10_000;
}

/**
 * Mock reviews, deliberately unmistakable.
 *
 * Authors are "Sample reviewer N" and every body says it is sample data. A
 * demo review that reads like a real customer is a liability the moment
 * someone screenshots it — the point of mock mode is a complete UI, not a
 * convincing forgery.
 */
function mockReviews(site: PulseSite): { reviews: GbpReview[]; rating: number; total: number } {
  const base = seed(site.domain);
  const total = 18 + Math.floor(base * 40);
  const rating = Math.round((4.1 + base * 0.8) * 10) / 10;
  const stars = [5, 5, 4, 5, 3, 5, 4];

  const reviews: GbpReview[] = stars.map((rating_, i) => ({
    reviewId: `mock-${site.id}-${i}`,
    rating: rating_,
    author: `Sample reviewer ${i + 1}`,
    text: `Sample data — this is placeholder review text shown because no Business Profile is connected for ${site.domain}.`,
    replyText: i === 2 ? "Sample data — placeholder owner reply." : null,
    createdAt: new Date(Date.now() - (i + 1) * 6 * 86_400_000).toISOString(),
  }));

  return { reviews, rating, total };
}

export async function runLocal(site: PulseSite): Promise<LocalRunResult> {
  const supabase = await createServiceClient();
  const base = {
    siteId: site.id,
    domain: site.domain,
    location: null as string | null,
    rating: null as number | null,
    reviewCount: 0,
    newReviews: 0,
    mocked: false,
  };

  const connectors = await data.listConnectors(site.client_id);
  const token = connectors.find((c) => c.provider === "gbp");

  let reviews: GbpReview[];
  let rating: number | null;
  let total: number;
  let location: string | null;
  let mocked = false;

  if (!token || isMock()) {
    const m = mockReviews(site);
    reviews = m.reviews;
    rating = m.rating;
    total = m.total;
    location = `${site.domain} (sample)`;
    mocked = true;
  } else {
    const { access_token, credentials } = await getValidAccessToken(token.id);
    const locations = await listGbpLocations(access_token);
    const chosen =
      locations.find((l) => l.name === credentials.account_label) ?? locations[0] ?? null;
    if (!chosen) {
      return { ...base, skipped: "Connected, but this Google account manages no Business Profile locations." };
    }
    const fetched = await fetchGbpReviews(access_token, chosen.account, chosen.name, 50);
    reviews = fetched.reviews;
    rating = fetched.averageRating;
    total = fetched.totalCount;
    location = chosen.title;
  }

  if (reviews.length === 0) {
    return { ...base, location, rating, reviewCount: total, mocked };
  }

  // Which review ids already exist decides what is genuinely new — a review
  // seen last run is not news, and the feed should only carry news.
  const { data: existingRows } = await supabase
    .from("pulse_reviews")
    .select("review_id")
    .eq("site_id", site.id);
  const existing = new Set(((existingRows as Array<{ review_id: string }>) ?? []).map((r) => r.review_id));

  const payload = reviews.map((r) => ({
    site_id: site.id,
    review_id: r.reviewId,
    rating: r.rating,
    author: r.author,
    text: r.text,
    reply_text: r.replyText,
    // The review's own timestamp, not ours — created_at is when the customer
    // wrote it, which is the only date that means anything here.
    ...(r.createdAt ? { created_at: r.createdAt } : {}),
  }));

  const { error } = await supabase
    .from("pulse_reviews")
    .upsert(payload, { onConflict: "site_id,review_id", ignoreDuplicates: false });
  if (error) throw new Error(`Could not store reviews: ${error.message}`);

  const fresh = reviews.filter((r) => !existing.has(r.reviewId));

  // A first run would otherwise announce every historical review at once.
  // Silence on the first sight of a profile is correct; after that, every new
  // review is worth surfacing — especially the bad ones.
  const firstRun = existing.size === 0;
  if (fresh.length > 0 && !firstRun) {
    const worst = fresh.slice().sort((a, b) => (a.rating ?? 5) - (b.rating ?? 5))[0];
    const negative = (worst.rating ?? 5) <= 3;
    await supabase.from("pulse_feed_events").insert({
      site_id: site.id,
      kind: "review_new",
      severity: negative ? "warning" : "good",
      title:
        fresh.length === 1
          ? `New ${worst.rating ?? "?"}-star review${negative ? " — needs a reply" : ""}`
          : `${fresh.length} new reviews${negative ? ", including one at 3 stars or below" : ""}`,
      payload: {
        count: fresh.length,
        lowest: worst.rating,
        mocked,
        sample: fresh.slice(0, 3).map((r) => ({ rating: r.rating, author: r.author, text: r.text?.slice(0, 200) })),
      },
    });
  }

  return {
    ...base,
    location,
    rating,
    reviewCount: total,
    newReviews: firstRun ? 0 : fresh.length,
    mocked,
  };
}
