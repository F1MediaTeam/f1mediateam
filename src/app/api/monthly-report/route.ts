// POST /api/monthly-report
//
// The F1 Media monthly report pipeline:
//   1. Pull STRUCTURED_DATA for the client + window (GSC totals + top pages,
//      content cards posted in window, SEMrush deep-pull rows, last login).
//   2. Pull FIELDY_TRANSCRIPT for the same window.
//   3. Send both to Claude with SYNTHESIS_SYSTEM_PROMPT → strict JSON content
//      object (see deck-builder MonthlyContent).
//   4. Render via generateDeck() → .pptx Buffer.
//   5. Upload to client-attachments storage under {client_id}/reports/...
//      and return the file directly as the form posted target=_blank.
//
// Tier + brand are read off the FormData (or the clients row if those columns
// exist post-migration). Output is `.pptx`.

import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { data } from "@/lib/data";
import { resolveRange } from "@/lib/deck/ai-narrative";
import { fieldyMeetingsInWindow, fieldyConfigured } from "@/lib/connectors/fieldy";
import { fetchClientGscPages, fetchClientGscQueries } from "@/lib/connectors/gsc";
import { todayIso } from "@/lib/utils";
import { generateDeck, type BrandConfig, type MonthlyContent } from "@/lib/deck/f1-monthly/deck-builder";
import { SYNTHESIS_SYSTEM_PROMPT } from "@/lib/deck/f1-monthly/synthesis-prompt";
import brandConfigs from "@/lib/deck/f1-monthly/brand-configs.json";
import { createServiceClient } from "@/lib/supabase/server";
import { randomUUID } from "node:crypto";
import type { Client, OnboardingData } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Opus 4.7 with max_tokens: 16000 can take 90–120s to finish a Tier-3 deck's
// worth of JSON. The default Vercel 60s window returns FUNCTION_INVOCATION_TIMEOUT
// before the model finishes; bump to 300s (5 min) which is the Pro/Fluid Compute
// ceiling and leaves headroom for the PPTX render + storage upload after.
export const maxDuration = 300;

const ANTHROPIC_MODEL = "claude-opus-4-7";
const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const ATTACHMENT_BUCKET = "client-attachments";

function field(fd: FormData, name: string): string {
  return String(fd.get(name) ?? "").trim();
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function normalizeTier(raw: string): "1" | "2" | "3" {
  const v = raw.toLowerCase();
  if (v.startsWith("3") || /domination/.test(v)) return "3";
  if (v.startsWith("2") || /growth|authority/.test(v)) return "2";
  return "1";
}

// Pull brand-color hex codes out of clients.branding.colors JSONB when
// present. Shape stored by the settings write path:
//   { colors: { primary, secondary, tertiary, black, white } }
// with values in "#RRGGBB" form. Returns 6-char uppercase hex (no #), or
// null if the key isn't a hex triplet.
function brandingHex(branding: unknown, key: "primary" | "secondary" | "tertiary"): string | null {
  const b = branding as { colors?: Record<string, unknown> } | null | undefined;
  const raw = b?.colors?.[key];
  if (typeof raw !== "string") return null;
  const m = raw.replace(/^#/, "").match(/^[0-9a-fA-F]{6}$/);
  return m ? m[0].toUpperCase() : null;
}

async function resolveBrand(formData: FormData, client: Client): Promise<BrandConfig> {
  const brandKey = field(formData, "brand_key") || slugify(client.company_name);
  const known = (brandConfigs as Record<string, BrandConfig>)[brandKey];
  const base: BrandConfig = known
    ? { ...known }
    : { ...(brandConfigs as Record<string, BrandConfig>).default, name: client.company_name };

  // Precedence for brand colors:
  //   1. explicit form field (admin override for this run)
  //   2. clients.branding.colors saved in the DB (customer's palette)
  //   3. brand-configs.json[brandKey]  (bundled defaults, already in `base`)
  const dbPrimary = brandingHex(client.branding, "primary");
  const dbSecondary = brandingHex(client.branding, "secondary");
  const dbTertiary = brandingHex(client.branding, "tertiary");
  if (dbPrimary) base.primary = dbPrimary;
  if (dbSecondary) base.secondary = dbSecondary;
  if (dbTertiary) base.tertiary = dbTertiary;

  const fp = field(formData, "accent") || field(formData, "brand_primary");
  const fs = field(formData, "brand_secondary");
  const ft = field(formData, "brand_tertiary");
  if (fp) base.primary = fp.replace(/^#/, "");
  if (fs) base.secondary = fs.replace(/^#/, "");
  if (ft) base.tertiary = ft.replace(/^#/, "");

  // Per-run font overrides from the deck style bar.
  const df = field(formData, "display_font");
  const bf = field(formData, "body_font");
  if (df) base.displayFont = df;
  if (bf) base.bodyFont = bf;

  const logoUrl = field(formData, "logo_url");
  if (logoUrl) {
    try {
      const res = await fetch(logoUrl);
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 0 && buf.length < 4_000_000) {
          const ct = res.headers.get("content-type") || "image/png";
          base.logoData = `data:${ct};base64,${buf.toString("base64")}`;
        }
      }
    } catch {
      // ignore — slide just falls back to the company name in text
    }
  }

  // No explicit logo? Use the client's brand logo (onboarding upload or the
  // static fallback in public/) — the cover slide centers it. Light-theme
  // variant first (dark artwork): the cover background is white.
  if (!base.logoData) {
    try {
      const { getClientBrandLogoUrls } = await import("@/lib/client-logo");
      const logos = await getClientBrandLogoUrls(client.id, client.company_name);
      const pick = logos.light || logos.dark;
      if (pick?.startsWith("http")) {
        const res = await fetch(pick);
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          if (buf.length > 0 && buf.length < 4_000_000) {
            const ct = res.headers.get("content-type") || "image/png";
            base.logoData = `data:${ct};base64,${buf.toString("base64")}`;
          }
        }
      } else if (pick) {
        // Static fallback path under public/ (traced into this lambda).
        const { readFile } = await import("node:fs/promises");
        const { join } = await import("node:path");
        const buf = await readFile(join(process.cwd(), "public", pick.replace(/^\//, "")));
        const ext = pick.split(".").pop()?.toLowerCase();
        const mime =
          ext === "svg" ? "image/svg+xml" : ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
        base.logoData = `data:${mime};base64,${buf.toString("base64")}`;
      }
    } catch {
      // ignore — cover falls back to the company name in text
    }
  }
  return base;
}

function compact(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n) >= 1000) {
    return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "")}K`;
  }
  return String(Math.round(n));
}

function pct(n: number, digits = 1): string {
  return `${(n * 100).toFixed(digits)}%`;
}

function inRange(captured: string, from: string, to: string): boolean {
  return captured >= from && captured <= to;
}

function sumInRange(series: { captured_at: string; value: number }[], from: string, to: string): number {
  return series.filter((s) => inRange(s.captured_at, from, to)).reduce((a, s) => a + s.value, 0);
}

function avgInRange(series: { captured_at: string; value: number }[], from: string, to: string): number | null {
  const w = series.filter((s) => inRange(s.captured_at, from, to));
  if (!w.length) return null;
  return w.reduce((a, s) => a + s.value, 0) / w.length;
}

// A prior-window sum is only honest if tracking history reaches back to the
// start of that window (±7 days grace). Connector history is finite — GSC
// ~16 months, Bing ~6 — so a "last 12 months vs the year before" comparison
// would otherwise sum a fragment of the prior year and hand Claude a
// fabricated YoY delta. Missing coverage → null, and the prompt tells the
// bot a null prior means "baseline, no comparison".
function priorSumOrNull(
  series: { captured_at: string; value: number }[],
  prevFrom: string,
  prevTo: string,
): number | null {
  if (!series.length) return null;
  const earliest = new Date(series[0].captured_at + "T00:00:00Z").getTime();
  const windowStart = new Date(prevFrom + "T00:00:00Z").getTime();
  if (earliest > windowStart + 7 * 86_400_000) return null;
  return sumInRange(series, prevFrom, prevTo);
}

interface ClaudeResp {
  content: Array<{ type: string; text?: string }>;
  stop_reason?: string;
}

async function synthesize(args: {
  reportMeta: unknown;
  brandProfile: unknown;
  clientProfile: unknown;
  profileData: unknown;
  fieldyTranscript: string;
  selectedNotes: string;
}): Promise<MonthlyContent> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
  // PROFILE_DATA is by far the largest block — compact JSON (no indent)
  // halves its size, which directly cuts synthesis latency. The small
  // qualitative blocks stay pretty-printed for the model's benefit.
  const userMsg =
    "REPORT_META:\n" + JSON.stringify(args.reportMeta, null, 2) +
    "\n\nBRAND_PROFILE:\n" + JSON.stringify(args.brandProfile, null, 2) +
    "\n\nCLIENT_PROFILE (qualitative — voice, ideal customer, services, growth lanes; NEVER a metrics source):\n" + JSON.stringify(args.clientProfile, null, 2) +
    "\n\nPROFILE_DATA (source of truth for all numbers; compact JSON):\n" + JSON.stringify(args.profileData) +
    "\n\nSELECTED_NOTES (hand-picked directives from the F1 operator for THIS report — weight highly):\n" + (args.selectedNotes || "(none)") +
    "\n\nFIELDY_TRANSCRIPT (qualitative context only — never a metrics source):\n" + (args.fieldyTranscript || "(empty)") +
    "\n\nReturn ONLY the content object as valid JSON.";

  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      // claude-opus-4-7 dropped the `temperature` param — omitting it lets the
      // model pick its own default (sampling was tuned during training).
      // max_tokens: 4000 truncated Tier-3 responses mid-JSON — a full deck
      // (executive summary + rankings + competitive snapshot + traffic +
      // cross-channel/AI + content + backlinks + social + ranking detail +
      // whatsNext + charts) blows past 4k output tokens. 16000 gives generous
      // headroom for any tier.
      model: ANTHROPIC_MODEL,
      max_tokens: 16000,
      system: SYNTHESIS_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMsg }],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as ClaudeResp;
  const text = (json.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
  const cleaned = text.replace(/^```json\s*|\s*```$/g, "").trim();
  try {
    return JSON.parse(cleaned) as MonthlyContent;
  } catch {
    const hint = json.stop_reason === "max_tokens"
      ? " (stop_reason=max_tokens — the response was cut off; raise max_tokens)"
      : "";
    throw new Error(
      `Claude response was not valid JSON${hint}. Length ${cleaned.length}, first 200: ${cleaned.slice(0, 200)}`,
    );
  }
}

export async function POST(request: NextRequest) {
  // fetch()-only endpoint: 401 beats requireAdmin()'s redirect-to-login here —
  // the redirect hands the client HTML instead of JSON/pptx and surfaces as a
  // confusing parse error (or a stray 404) in the Deck Studio.
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return new Response("Your session expired — sign in again, then re-draft.", { status: 401 });
  }
  const fd = await request.formData();

  const clientId = field(fd, "client_id");
  if (!clientId) return new Response("client_id required", { status: 400 });

  const client = await data.getClient(clientId);
  if (!client) return new Response("Client not found", { status: 404 });

  const today = todayIso("America/Los_Angeles");
  const window = resolveRange(field(fd, "range") || "28d", field(fd, "from") || null, field(fd, "to") || null, today);

  // ---------- Form overrides (needed by both paths) ----------
  // Tier order: explicit form field wins, otherwise fall back to the tier the
  // admin assigned on the client's profile (clients.tier). Default to "1".
  const clientTier = client.tier === "1" || client.tier === "2" || client.tier === "3" ? client.tier : "";
  const tier = normalizeTier(field(fd, "tier") || clientTier || "1");
  const brand = await resolveBrand(fd, client);
  const brandKey = field(fd, "brand_key") || slugify(client.company_name);

  // Meeting cadence — shapes how the bot frames the narrative (weekly
  // check-in vs. yearly review) and names the output file.
  const REPORT_TYPES = ["weekly", "monthly", "quarterly", "yearly", "custom"] as const;
  const rawType = field(fd, "report_type").toLowerCase();
  const reportType = (REPORT_TYPES as readonly string[]).includes(rawType) ? rawType : "monthly";

  // Hand-picked operator directives for this specific report.
  const selectedNotes = field(fd, "selected_notes");

  function applyDefaults(content: MonthlyContent) {
    // Defensive defaults — never let a missing field tank the render.
    content.client = content.client || client!.company_name;
    content.tier = content.tier || tier;
    content.brandKey = content.brandKey || brandKey;
    if (!content.reportPeriod) content.reportPeriod = `${window.fromIso} → ${window.toIso}`;
    if (!content.meetingDate) content.meetingDate = today;
  }

  // ---------- 3+4. Render the .pptx, persist, and return ----------
  async function renderAndRespond(content: MonthlyContent): Promise<Response> {
    applyDefaults(content);
    const buf = await generateDeck(brand, content);

    try {
      const supabase = await createServiceClient();
      const storagePath = `${clientId}/reports/${window.toIso}-${randomUUID()}.pptx`;
      await supabase.storage.from(ATTACHMENT_BUCKET).upload(storagePath, buf, {
        contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        upsert: false,
      });
      await supabase.from("files").insert({
        client_id: clientId,
        filename: `${slugify(client!.company_name)}-${window.toIso}-${reportType}-report.pptx`,
        storage_path: storagePath,
        mime_type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        size_bytes: buf.length,
        category: "monthly-report",
      });
    } catch (err) {
      console.error("report storage upload failed", err);
      // continue — the user still gets the download even if storage failed
    }

    const filename = `${slugify(client!.company_name)}-${window.toIso}-${reportType}-report.pptx`;
    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  }

  // Edited content from the Reports preview editor: the deck is already
  // written and approved, so skip the entire data pull + synthesis and
  // render exactly what the admin saw on screen.
  const contentJson = field(fd, "content_json");
  if (contentJson) {
    let edited: MonthlyContent;
    try {
      edited = JSON.parse(contentJson) as MonthlyContent;
    } catch {
      return new Response("content_json is not valid JSON", { status: 400 });
    }
    return renderAndRespond(edited);
  }

  // ---------- 1. PROFILE_DATA per source ----------
  const [
    clicksAll, imprAll, posAll, ctrAll,
    sessionsAll, activeUsersAll, conversionsAll,
    bingClicksAll, bingImprAll, bingAvgPosAll,
    semrushKeywordsAll, semrushTrafficAll, semrushAuthorityAll,
    visibilityAll, aiVisibilityAll,
    contentCards,
    topPages,
    semrushReports,
    topQueries,
  ] = await Promise.all([
    data.listSnapshots({ clientId, metric: "clicks" }),
    data.listSnapshots({ clientId, metric: "impressions" }),
    data.listSnapshots({ clientId, metric: "avg_position" }),
    data.listSnapshots({ clientId, metric: "ctr" }),
    data.listSnapshots({ clientId, metric: "sessions" }),
    data.listSnapshots({ clientId, metric: "active_users" }),
    data.listSnapshots({ clientId, metric: "conversions" }),
    data.listSnapshots({ clientId, metric: "bing_clicks" }),
    data.listSnapshots({ clientId, metric: "bing_impressions" }),
    data.listSnapshots({ clientId, metric: "bing_avg_click_position" }),
    data.listSnapshots({ clientId, metric: "semrush_organic_keywords" }),
    data.listSnapshots({ clientId, metric: "semrush_organic_traffic" }),
    data.listSnapshots({ clientId, metric: "semrush_authority_score" }),
    data.listSnapshots({ clientId, metric: "visibility" }),
    data.listSnapshots({ clientId, metric: "ai_visibility" }),
    data.listContent({ clientId }),
    fetchClientGscPages(clientId, window.fromIso, window.toIso, 25).catch(() => []),
    data.listSemrushReports(clientId).catch(() => []),
    fetchClientGscQueries(clientId, window.fromIso, window.toIso, 25).catch(() => []),
  ]);

  // ----- GSC -----
  const clicksCur = sumInRange(clicksAll, window.fromIso, window.toIso);
  const clicksPrev = priorSumOrNull(clicksAll, window.prevFromIso, window.prevToIso);
  const imprCur = sumInRange(imprAll, window.fromIso, window.toIso);
  const imprPrev = priorSumOrNull(imprAll, window.prevFromIso, window.prevToIso);
  const avgPosCur = avgInRange(posAll, window.fromIso, window.toIso);
  const ctrCur = avgInRange(ctrAll, window.fromIso, window.toIso);

  const trendPoints = clicksAll
    .filter((s) => inRange(s.captured_at, window.fromIso, window.toIso))
    .sort((a, b) => a.captured_at.localeCompare(b.captured_at));
  const imprTrend = imprAll
    .filter((s) => inRange(s.captured_at, window.fromIso, window.toIso))
    .sort((a, b) => a.captured_at.localeCompare(b.captured_at));

  // ----- GA4 -----
  const sessionsCur = sumInRange(sessionsAll, window.fromIso, window.toIso);
  const sessionsPrev = priorSumOrNull(sessionsAll, window.prevFromIso, window.prevToIso);
  const activeUsersCur = sumInRange(activeUsersAll, window.fromIso, window.toIso);
  const conversionsCur = sumInRange(conversionsAll, window.fromIso, window.toIso);
  const sessionsTrend = sessionsAll
    .filter((s) => inRange(s.captured_at, window.fromIso, window.toIso))
    .sort((a, b) => a.captured_at.localeCompare(b.captured_at));

  // ----- Bing -----
  const bingClicksCur = sumInRange(bingClicksAll, window.fromIso, window.toIso);
  const bingClicksPrev = priorSumOrNull(bingClicksAll, window.prevFromIso, window.prevToIso);
  const bingImprCur = sumInRange(bingImprAll, window.fromIso, window.toIso);
  const bingImprPrev = priorSumOrNull(bingImprAll, window.prevFromIso, window.prevToIso);
  const bingAvgPosCur = avgInRange(bingAvgPosAll, window.fromIso, window.toIso);

  // ----- SEMrush -----
  const latest = (series: { captured_at: string; value: number }[]) =>
    series.length ? series[series.length - 1].value : null;
  const semrushKeywordsCur = latest(semrushKeywordsAll);
  const semrushTrafficCur = latest(semrushTrafficAll);
  const semrushAuthorityCur = latest(semrushAuthorityAll);
  const visibilityCur = latest(visibilityAll);
  const aiVisibilityCur = latest(aiVisibilityAll);

  // Content cards posted within the window (slide 5)
  const postedInWindow = contentCards.filter(
    (c) => c.stage === "posted" && c.updated_at.slice(0, 10) >= window.fromIso && c.updated_at.slice(0, 10) <= window.toIso,
  );
  const pipeline = contentCards.filter((c) => c.stage === "proposed" || c.stage === "pending");

  // Semrush insights extracted from the deep pull if present
  type SemrushReport = (typeof semrushReports)[number];
  const reportRows = (label: string): Array<Record<string, unknown>> => {
    const r: SemrushReport | undefined = semrushReports.find((rr) => {
      const meta = (rr.meta ?? {}) as Record<string, unknown>;
      const l = String(meta.label ?? rr.report_type).toLowerCase();
      return l.includes(label.toLowerCase());
    });
    return (r?.rows ?? []) as Array<Record<string, unknown>>;
  };
  const semrushCompetitors = reportRows("competitor").slice(0, 10);
  const semrushBacklinks = reportRows("backlink").slice(0, 10);
  // Every deep-pull report goes to the bot, but under a hard serialized-size
  // budget — a client with 17 fat reports would otherwise balloon the prompt
  // past what synthesis can chew through inside the function time limit.
  const DEEP_PULL_CHAR_BUDGET = 120_000;
  let deepPullChars = 0;
  const semrushDeepPull: Array<{ report: string; rows: Array<Record<string, unknown>> }> = [];
  for (const r of semrushReports) {
    const meta = (r.meta ?? {}) as Record<string, unknown>;
    const entry = {
      report: String(meta.label ?? r.report_type),
      rows: ((r.rows ?? []) as Array<Record<string, unknown>>).slice(0, 12),
    };
    const size = JSON.stringify(entry).length;
    if (deepPullChars + size > DEEP_PULL_CHAR_BUDGET) break;
    deepPullChars += size;
    semrushDeepPull.push(entry);
  }

  // Daily trend series get long on quarterly/yearly windows — sample down to
  // a bounded number of points (the shape is what matters for charts).
  const capSeries = <T,>(points: T[], max = 120): T[] => {
    if (points.length <= max) return points;
    const step = points.length / max;
    return Array.from({ length: max }, (_, i) => points[Math.floor(i * step)]);
  };

  // ---------- 2. FIELDY_TRANSCRIPT ----------
  // If the admin curated specific Fieldy conversations via the Fieldy button,
  // use exactly those (skip the client-name filter — they already chose). If
  // not, fall back to the auto-pull: every conversation in the window that
  // mentions the client by name.
  let transcript = "";
  const curatedIds = field(fd, "fieldy_ids")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (fieldyConfigured()) {
    try {
      let chosen;
      if (curatedIds.length > 0) {
        // Pull a wide window so older curated picks still resolve.
        const wide = new Date();
        wide.setUTCDate(wide.getUTCDate() - 365);
        const wideFrom = wide.toISOString().slice(0, 10);
        const all = await fieldyMeetingsInWindow(wideFrom, today, 100);
        chosen = all.filter((n) => curatedIds.includes(n.id));
      } else {
        const notes = await fieldyMeetingsInWindow(window.fromIso, window.toIso);
        chosen = notes.filter((n) =>
          [n.title, n.summary, n.content].some((s) =>
            (s ?? "").toLowerCase().includes(client.company_name.toLowerCase()),
          ),
        );
      }
      transcript = chosen
        .map((n) => {
          const kw = n.keywords.length ? `\nKeywords: ${n.keywords.join(", ")}` : "";
          const quotes = n.quotes.length
            ? "\nQuotes:\n" + n.quotes.slice(0, 12).map((q) => `> "${q.text}"${q.context ? ` — ${q.context}` : ""}`).join("\n")
            : "";
          return `# ${n.title}${n.startTime ? ` (${n.startTime.slice(0, 10)})` : ""}\n${n.summary ?? ""}\n${n.content ?? ""}${kw}${quotes}`;
        })
        .join("\n\n---\n\n");
    } catch {
      transcript = "";
    }
  }

  // ---------- CLIENT_PROFILE from onboarding ----------
  // Pull the onboarding row (if the customer has submitted one) and hand the
  // qualitative fields to the synthesis bot as CLIENT_PROFILE. These aren't
  // numbers — they're voice/context: who the ideal customer is, what services
  // to spotlight, what growth lanes matter. The bot uses this to tailor
  // narrative sections (executiveSummary.intro, whatsNext, framing) so a
  // print shop's report doesn't sound like a law firm's.
  const onboardingRow = await data.getOnboarding(clientId);
  const ob = (onboardingRow?.data ?? {}) as OnboardingData;
  const trimmed = (v: unknown): string | null => {
    const s = typeof v === "string" ? v.trim() : "";
    return s ? s : null;
  };
  const clientProfile = {
    submitted: Boolean(onboardingRow),
    identity: {
      companyBio: trimmed(ob.company_bio),
      differentiator: trimmed(ob.brand_diff),
      threeWords: trimmed(ob.brand_3words),
      brandFonts: trimmed(ob.brand_fonts),
    },
    market: {
      idealCustomer: trimmed(ob.ideal_client),
      highestRevenueServices: trimmed(ob.highest_revenue_cases),
      projectsToAvoid: trimmed(ob.cases_to_avoid),
      saturatedMarkets: trimmed(ob.saturated_markets),
      growthOpportunity: trimmed(ob.growth_opportunity),
    },
    footprint: {
      primaryCity: trimmed(ob.primary_city?.name),
      services: Array.isArray(ob.services)
        ? ob.services
            .map((s) => ({ name: trimmed(s?.name), description: trimmed(s?.description), priority: s?.priority ?? null }))
            .filter((s) => s.name)
        : [],
      surroundingCities: Array.isArray(ob.service_locations)
        ? ob.service_locations.map((l) => trimmed(l?.city)).filter(Boolean)
        : [],
      futureExpansion: trimmed(ob.future_expansion_targets),
    },
    performance: {
      pastSuccesses: [
        ob.perf_social_active ? trimmed(ob.perf_social_explanation) : null,
        ob.perf_website_active ? trimmed(ob.perf_website_explanation) : null,
        ob.perf_paid_active ? trimmed(ob.perf_paid_explanation) : null,
        ob.perf_podcast_active ? trimmed(ob.perf_podcast_explanation) : null,
      ].filter(Boolean),
      underperformed: trimmed(ob.perf_underperforming),
    },
  };

  // REPORT_META — exactly the keys the master prompt expects.
  const reportMeta = {
    client: client.company_name,
    website: client.websites?.[0] ?? "",
    // industry/services have no dedicated form fields anymore — the bot reads
    // richer versions from CLIENT_PROFILE; these stay for API callers that
    // still pass them, with services falling back to the onboarding list.
    industry: field(fd, "industry"),
    services: field(fd, "services") ||
      clientProfile.footprint.services.map((s) => s.name).filter(Boolean).join(", "),
    reportPeriod: `${window.fromIso} → ${window.toIso}`,
    reportType,
    periodLabel: window.label,
    meetingDate: today,
    tier,
  };

  // BRAND_PROFILE — pass brandKey straight through, plus the resolved tokens.
  const brandProfile = {
    brandKey,
    primary: brand.primary,
    secondary: brand.secondary,
    tertiary: brand.tertiary,
    displayFont: brand.displayFont,
    bodyFont: brand.bodyFont,
    logo: field(fd, "logo_url") || null,
  };

  // PROFILE_DATA — namespaced by source so the bot can apply the source-of-
  // truth map. Numbers never blend across sources.
  const profileData = {
    period: {
      label: window.label,
      from: window.fromIso,
      to: window.toIso,
      priorFrom: window.prevFromIso,
      priorTo: window.prevToIso,
    },
    gsc: {
      clicks: {
        current: clicksCur,
        prior: clicksPrev,
        currentCompact: compact(clicksCur),
        priorCompact: clicksPrev != null ? compact(clicksPrev) : null,
      },
      impressions: {
        current: imprCur,
        prior: imprPrev,
        currentCompact: compact(imprCur),
        priorCompact: imprPrev != null ? compact(imprPrev) : null,
      },
      avgPosition: avgPosCur != null ? Number(avgPosCur.toFixed(1)) : null,
      ctr: ctrCur != null ? pct(ctrCur, 2) : null,
      topPages: topPages.map((p) => ({ url: p.key, clicks: p.clicks, impressions: p.impressions, position: p.position })),
      topQueries: topQueries.map((q) => ({ query: q.key, clicks: q.clicks, impressions: q.impressions, position: q.position })),
      trendDailyClicks: capSeries(trendPoints).map((p) => ({ date: p.captured_at, value: p.value })),
      trendDailyImpressions: capSeries(imprTrend).map((p) => ({ date: p.captured_at, value: p.value })),
    },
    ga4: {
      sessions: { current: sessionsCur, prior: sessionsPrev },
      activeUsers: activeUsersCur || null,
      conversions: conversionsCur || null,
      trendDailySessions: capSeries(sessionsTrend).map((p) => ({ date: p.captured_at, value: p.value })),
    },
    bing: {
      clicks: { current: bingClicksCur, prior: bingClicksPrev },
      impressions: { current: bingImprCur, prior: bingImprPrev },
      avgClickPosition: bingAvgPosCur != null ? Number(bingAvgPosCur.toFixed(1)) : null,
    },
    semrush: {
      organicKeywords: semrushKeywordsCur,
      organicTraffic: semrushTrafficCur,
      authorityScore: semrushAuthorityCur,
      visibility: visibilityCur,
      aiVisibility: aiVisibilityCur,
      competitors: semrushCompetitors,
      backlinksOverviewRows: semrushBacklinks,
      deepPullReports: semrushDeepPull,
    },
    content: {
      postedInWindow: postedInWindow.map((c) => ({ title: c.title, link: c.link, body: (c.body ?? "").slice(0, 280), updated_at: c.updated_at })),
      pipeline: pipeline.map((c) => ({ stage: c.stage, title: c.title, link: c.link })),
    },
  };

  // ---------- 2b. Synthesize the deck content ----------
  let content: MonthlyContent;
  try {
    content = await synthesize({
      reportMeta,
      brandProfile,
      clientProfile,
      profileData,
      fieldyTranscript: transcript,
      selectedNotes,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "synthesis failed";
    return new Response(`Synthesis failed: ${msg}`, { status: 502 });
  }

  applyDefaults(content);

  // Dry-run: return the content object for inspection without rendering.
  if (field(fd, "dryrun") === "1") {
    return Response.json({
      window,
      sentToBot: {
        reportMeta,
        brandProfile,
        clientProfile,
        profileData,
        fieldyTranscript: transcript,
        selectedNotes,
      },
      content,
    });
  }

  return renderAndRespond(content);
}
