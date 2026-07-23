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
import { data, usingMock } from "@/lib/data";
import { resolveRange, meetingMatchesClient } from "@/lib/deck/ai-narrative";
import { fieldyMeetingsInWindow, fieldyConfigured } from "@/lib/connectors/fieldy";
import { fetchClientGscPages, fetchClientGscQueries, fetchClientGscBreakdown } from "@/lib/connectors/gsc";
import { fetchGa4Channels, fetchGa4LandingPages } from "@/lib/connectors/ga4";
import { todayIso } from "@/lib/utils";
import { generateDeck, type BrandConfig, type MonthlyContent } from "@/lib/deck/f1-monthly/deck-builder";
import { inlineWorkGalleryImages } from "@/lib/deck/f1-monthly/gallery-images";
import { normalizeMonthlyContent } from "@/lib/deck/f1-monthly/normalize-content";
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

// Fetch a logo (remote URL or public/ path) into a data URI, or null.
async function logoToDataUri(pick: string | null): Promise<string | null> {
  if (!pick) return null;
  try {
    if (pick.startsWith("http")) {
      const res = await fetch(pick);
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0 || buf.length >= 4_000_000) return null;
      const ct = res.headers.get("content-type") || "image/png";
      return `data:${ct};base64,${buf.toString("base64")}`;
    }
    // Static fallback path under public/ (traced into this lambda).
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const buf = await readFile(join(process.cwd(), "public", pick.replace(/^\//, "")));
    const ext = pick.split(".").pop()?.toLowerCase();
    const mime =
      ext === "svg" ? "image/svg+xml" : ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

// Read a hex off the 0008 brand_* columns (may not exist pre-migration).
function columnHex(client: Client, key: string): string | null {
  const raw = (client as unknown as Record<string, unknown>)[key];
  if (typeof raw !== "string") return null;
  const m = raw.replace(/^#/, "").match(/^[0-9a-fA-F]{6}$/);
  return m ? m[0].toUpperCase() : null;
}

async function resolveBrand(formData: FormData, client: Client, ob: OnboardingData): Promise<BrandConfig> {
  const brandKey = field(formData, "brand_key") || slugify(client.company_name);
  const known = (brandConfigs as Record<string, BrandConfig>)[brandKey];
  const base: BrandConfig = known
    ? { ...known }
    : { ...(brandConfigs as Record<string, BrandConfig>).default, name: client.company_name };

  // Precedence for brand colors:
  //   1. explicit form field (admin override for this run)
  //   2. clients.branding.colors saved in the DB (customer's palette)
  //   3. clients.brand_primary/secondary/tertiary columns (0008)
  //   4. onboarding brand_color_hex (what the customer told us — primary only)
  //   5. brand-configs.json[brandKey]  (bundled defaults, already in `base`)
  const obPrimary = (() => {
    const raw = typeof ob.brand_color_hex === "string" ? ob.brand_color_hex : "";
    const m = raw.replace(/^#/, "").match(/^[0-9a-fA-F]{6}$/);
    return m ? m[0].toUpperCase() : null;
  })();
  if (obPrimary) base.primary = obPrimary;
  const colPrimary = columnHex(client, "brand_primary");
  const colSecondary = columnHex(client, "brand_secondary");
  const colTertiary = columnHex(client, "brand_tertiary");
  if (colPrimary) base.primary = colPrimary;
  if (colSecondary) base.secondary = colSecondary;
  if (colTertiary) base.tertiary = colTertiary;
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

  // Fonts: per-run style-bar override wins; otherwise the fonts the customer
  // named in onboarding ("Montserrat, Open Sans" → display, body).
  const df = field(formData, "display_font");
  const bf = field(formData, "body_font");
  const obFonts = (typeof ob.brand_fonts === "string" ? ob.brand_fonts : "")
    .split(/[,/;·|]+/)
    .map((s) => s.trim())
    .filter((s) => /^[A-Za-z][A-Za-z0-9 .'-]{1,40}$/.test(s));
  if (obFonts[0]) base.displayFont = obFonts[0];
  if (obFonts[1]) base.bodyFont = obFonts[1];
  if (df) base.displayFont = df;
  if (bf) base.bodyFont = bf;

  const logoUrl = field(formData, "logo_url");
  if (logoUrl) {
    base.logoData = (await logoToDataUri(logoUrl)) ?? base.logoData;
  }

  // Brand logos: the cover sits on the dark brand primary (dark-theme
  // variant), interior slides are white (light-theme variant). Fetch both so
  // each surface gets art that's actually legible on it.
  try {
    const { getClientBrandLogoUrls } = await import("@/lib/client-logo");
    const logos = await getClientBrandLogoUrls(client.id, client.company_name);
    if (!base.logoData) base.logoData = await logoToDataUri(logos.dark || logos.light);
    base.logoLightData = await logoToDataUri(logos.light || logos.dark);
  } catch {
    // ignore — slides fall back to the company name in text
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

interface SynthesisArgs {
  reportMeta: unknown;
  brandProfile: unknown;
  clientProfile: unknown;
  profileData: unknown;
  fieldyTranscript: string;
  selectedNotes: string;
  clientMessages: string;
  priorDeck: string;
}

// The synthesis user message — also exported verbatim by the prompt_only
// path so the admin can run the same draft in the Claude app (subscription)
// instead of burning API credits here.
// PROFILE_DATA is by far the largest block — compact JSON (no indent)
// halves its size, which directly cuts synthesis latency. The small
// qualitative blocks stay pretty-printed for the model's benefit.
function buildUserMsg(args: SynthesisArgs): string {
  return (
    "REPORT_META:\n" + JSON.stringify(args.reportMeta, null, 2) +
    "\n\nBRAND_PROFILE:\n" + JSON.stringify(args.brandProfile, null, 2) +
    "\n\nCLIENT_PROFILE (qualitative — voice, ideal customer, services, growth lanes; NEVER a metrics source):\n" + JSON.stringify(args.clientProfile, null, 2) +
    "\n\nPROFILE_DATA (source of truth for all numbers; compact JSON):\n" + JSON.stringify(args.profileData) +
    "\n\nSELECTED_NOTES (hand-picked directives from the F1 operator for THIS report — weight highly):\n" + (args.selectedNotes || "(none)") +
    "\n\nCLIENT_MESSAGES (the client's portal messages this period — their own asks/concerns; qualitative only):\n" + (args.clientMessages || "(none)") +
    "\n\nPRIOR_DECK (the previous meeting deck's plan — review these commitments in sinceLastMeeting; never a metrics source):\n" + (args.priorDeck || "(none — first deck on record)") +
    "\n\nFIELDY_TRANSCRIPT (qualitative context only — never a metrics source):\n" + (args.fieldyTranscript || "(empty)") +
    "\n\nReturn ONLY the content object as valid JSON."
  );
}

async function synthesize(args: SynthesisArgs, signal?: AbortSignal): Promise<MonthlyContent> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
  const userMsg = buildUserMsg(args);

  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    // Propagate the browser's cancel: aborting here stops the API spend
    // instead of letting a canceled draft run (and bill) to completion.
    signal,
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

  // Onboarding early: brand colors/fonts and the client profile both read it.
  const onboardingRow = await data.getOnboarding(clientId);
  const ob = (onboardingRow?.data ?? {}) as OnboardingData;

  // The client's meeting history — anchors the "since last meeting" window
  // and gives REPORT_META a last-meeting date for continuity framing.
  const clientMeetings = (await data.listMeetings().catch(() => []))
    .filter((m) => m.client_id === clientId)
    .filter((m) => m.scheduled_at.slice(0, 10) <= today)
    .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));
  const lastMeetingDate = clientMeetings[0]?.scheduled_at.slice(0, 10) ?? null;

  // "since_last" range: pull exactly the span since the client was last seen.
  // Falls back to the standard 28d window when no meeting is on record.
  const rawRange = field(fd, "range") || "28d";
  const window =
    rawRange === "since_last" && lastMeetingDate
      ? resolveRange("custom", lastMeetingDate, today, today)
      : resolveRange(rawRange === "since_last" ? "28d" : rawRange, field(fd, "from") || null, field(fd, "to") || null, today);

  // ---------- Form overrides (needed by both paths) ----------
  // Tier order: explicit form field wins, otherwise fall back to the tier the
  // admin assigned on the client's profile (clients.tier). Default to "1".
  const clientTier = client.tier === "1" || client.tier === "2" || client.tier === "3" ? client.tier : "";
  const tier = normalizeTier(field(fd, "tier") || clientTier || "1");
  const brand = await resolveBrand(fd, client, ob);
  const brandKey = field(fd, "brand_key") || slugify(client.company_name);

  // Meeting cadence — shapes how the bot frames the narrative (weekly
  // check-in vs. yearly review) and names the output file. "sincelast" reads
  // as a custom-window review.
  const REPORT_TYPES = ["weekly", "monthly", "quarterly", "yearly", "custom"] as const;
  const rawType = field(fd, "report_type").toLowerCase();
  const reportType = rawType === "sincelast"
    ? "custom"
    : (REPORT_TYPES as readonly string[]).includes(rawType) ? rawType : "monthly";

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
  async function renderAndRespond(rawContent: MonthlyContent): Promise<Response> {
    const content = normalizeMonthlyContent(rawContent);
    applyDefaults(content);
    // Fetch the posted-work gallery images (URLs picked off the content
    // board) into data: URIs the builder can embed. Dead links just drop
    // their cell — never the render.
    await inlineWorkGalleryImages(content);
    const buf = await generateDeck(brand, content);

    // A canceled run must not publish: without this check the .pptx of a
    // draft the operator never reviewed lands in the files table — which the
    // client's Files page lists.
    if (request.signal.aborted) {
      return new Response("Canceled", { status: 499 });
    }

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
      // Deck history: persist the editable content JSON so this deck can be
      // reopened/re-rendered later and the NEXT deck can review this one's
      // commitments. Inlined image bytes are stripped — URLs re-inline on
      // re-render. Best-effort: pre-migration this just returns null.
      const storableContent = JSON.parse(
        JSON.stringify(content, (k, v) =>
          k === "data" && typeof v === "string" && v.startsWith("data:") ? undefined : v,
        ),
      ) as Record<string, unknown>;
      await data.saveDeckReport({
        client_id: clientId,
        report_type: reportType,
        period_from: window.fromIso,
        period_to: window.toIso,
        meeting_date: today,
        content: storableContent,
        pptx_path: storagePath,
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
    bingClicksAll, bingImprAll, bingAvgPosAll, bingAvgImprPosAll,
    semrushKeywordsAll, semrushTrafficAll, semrushAuthorityAll,
    visibilityAll, aiVisibilityAll,
    semrushBacklinksAll, semrushRefDomainsAll, siteHealthAll, mentionsAll,
    semrushPaidKeywordsAll, semrushPaidTrafficAll, semrushPaidCostAll,
    contentCards,
    topPages,
    semrushReports,
    topQueries,
    gscDevices, gscCountries,
    ga4Channels, ga4LandingPages,
    allTasks,
    calendarEvents,
    portalMessages,
    loginAudit,
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
    data.listSnapshots({ clientId, metric: "bing_avg_impression_position" }),
    data.listSnapshots({ clientId, metric: "semrush_organic_keywords" }),
    data.listSnapshots({ clientId, metric: "semrush_organic_traffic" }),
    data.listSnapshots({ clientId, metric: "semrush_authority_score" }),
    data.listSnapshots({ clientId, metric: "visibility" }),
    data.listSnapshots({ clientId, metric: "ai_visibility" }),
    data.listSnapshots({ clientId, metric: "semrush_backlinks" }),
    data.listSnapshots({ clientId, metric: "semrush_referring_domains" }),
    data.listSnapshots({ clientId, metric: "site_health" }),
    data.listSnapshots({ clientId, metric: "mentions" }),
    data.listSnapshots({ clientId, metric: "semrush_paid_keywords" }),
    data.listSnapshots({ clientId, metric: "semrush_paid_traffic" }),
    data.listSnapshots({ clientId, metric: "semrush_paid_cost" }),
    data.listContent({ clientId }),
    fetchClientGscPages(clientId, window.fromIso, window.toIso, 25).catch(() => []),
    data.listSemrushReports(clientId).catch(() => []),
    fetchClientGscQueries(clientId, window.fromIso, window.toIso, 25).catch(() => []),
    fetchClientGscBreakdown(clientId, "device", window.fromIso, window.toIso, 6).catch(() => []),
    fetchClientGscBreakdown(clientId, "country", window.fromIso, window.toIso, 8).catch(() => []),
    fetchGa4Channels(clientId, window.fromIso, window.toIso, 8).catch(() => []),
    fetchGa4LandingPages(clientId, window.fromIso, window.toIso, 10).catch(() => []),
    data.listTasks({ clientId }).catch(() => []),
    data.listCalendar({ clientId }).catch(() => []),
    data.listMessages(clientId).catch(() => []),
    data.listAudit({ clientId, limit: 200 }).catch(() => []),
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
  const activeUsersPrev = priorSumOrNull(activeUsersAll, window.prevFromIso, window.prevToIso);
  const conversionsCur = sumInRange(conversionsAll, window.fromIso, window.toIso);
  const conversionsPrev = priorSumOrNull(conversionsAll, window.prevFromIso, window.prevToIso);
  const sessionsTrend = sessionsAll
    .filter((s) => inRange(s.captured_at, window.fromIso, window.toIso))
    .sort((a, b) => a.captured_at.localeCompare(b.captured_at));

  // ----- Bing -----
  const bingClicksCur = sumInRange(bingClicksAll, window.fromIso, window.toIso);
  const bingClicksPrev = priorSumOrNull(bingClicksAll, window.prevFromIso, window.prevToIso);
  const bingImprCur = sumInRange(bingImprAll, window.fromIso, window.toIso);
  const bingImprPrev = priorSumOrNull(bingImprAll, window.prevFromIso, window.prevToIso);
  const bingAvgPosCur = avgInRange(bingAvgPosAll, window.fromIso, window.toIso);
  const bingAvgImprPosCur = avgInRange(bingAvgImprPosAll, window.fromIso, window.toIso);
  const bingClicksTrend = bingClicksAll
    .filter((s) => inRange(s.captured_at, window.fromIso, window.toIso))
    .sort((a, b) => a.captured_at.localeCompare(b.captured_at));

  // ----- SEMrush -----
  // These series are periodic history pulls, not daily syncs. Read the value
  // AS OF the window end (not "latest ever" — a deck for a past window must
  // not show today's numbers) and the prior-window value for a real delta.
  type Series = { captured_at: string; value: number }[];
  const valueAsOf = (series: Series, iso: string): number | null => {
    const rows = series.filter((s) => s.captured_at <= iso);
    return rows.length ? rows[rows.length - 1].value : null;
  };
  const monthlySeries = (series: Series): Array<{ date: string; value: number }> =>
    series
      .filter((s) => s.captured_at <= window.toIso)
      .slice(-24)
      .map((s) => ({ date: s.captured_at, value: s.value }));
  const semrushKeywordsCur = valueAsOf(semrushKeywordsAll, window.toIso);
  const semrushKeywordsPrev = valueAsOf(semrushKeywordsAll, window.prevToIso);
  const semrushTrafficCur = valueAsOf(semrushTrafficAll, window.toIso);
  const semrushTrafficPrev = valueAsOf(semrushTrafficAll, window.prevToIso);
  const semrushAuthorityCur = valueAsOf(semrushAuthorityAll, window.toIso);
  const semrushBacklinksCur = valueAsOf(semrushBacklinksAll, window.toIso);
  const semrushBacklinksPrev = valueAsOf(semrushBacklinksAll, window.prevToIso);
  const semrushRefDomainsCur = valueAsOf(semrushRefDomainsAll, window.toIso);
  const semrushRefDomainsPrev = valueAsOf(semrushRefDomainsAll, window.prevToIso);
  const siteHealthCur = valueAsOf(siteHealthAll, window.toIso);
  const mentionsCur = valueAsOf(mentionsAll, window.toIso);
  const semrushPaid = {
    keywords: valueAsOf(semrushPaidKeywordsAll, window.toIso),
    traffic: valueAsOf(semrushPaidTrafficAll, window.toIso),
    trafficCost: valueAsOf(semrushPaidCostAll, window.toIso),
  };
  const visibilityCur = valueAsOf(visibilityAll, window.toIso);
  const aiVisibilityCur = valueAsOf(aiVisibilityAll, window.toIso);

  // Content board with approval history (slide 5). The events log says who
  // moved each card — actor_role "client" on a proposed→ transition means the
  // CUSTOMER approved it, which is the story that slide needs to tell.
  const cardEvents = await data
    .listContentEventsByCards(contentCards.map((c) => c.id))
    .catch(() => new Map<string, never[]>());
  // Image links on a card feed the posted-work gallery. Two capture modes:
  //   • Marker context — markdown ![]() and [ATTACH:…] declare "this is an
  //     image", so no file extension is required (scheduler/CDN URLs like
  //     lh3.googleusercontent.com carry none) and query strings are KEPT
  //     (they're the signature on S3/Supabase/Instagram signed URLs).
  //   • Bare URLs — need an image extension so ordinary links don't match,
  //     but keep any query string after it.
  // The render-time fetch (gallery-images.ts) is the format gate: it embeds
  // only PowerPoint-safe types, so a non-image marker URL just drops out.
  const extractCardImages = (body: string | null, fileUrl: string | null): string[] => {
    const urls: string[] = [];
    const hay = body ?? "";
    let m: RegExpExecArray | null;
    const marked = /(?:\!\[[^\]]*\]\(|\[ATTACH:)\s*(https?:\/\/[^\s\)\]]+)/gi;
    while ((m = marked.exec(hay)) !== null) urls.push(m[1]);
    const bare = /(?:^|\s)(https?:\/\/[^\s\)\]]+\.(?:png|jpe?g|gif)(?:\?[^\s\)\]]*)?)/gi;
    while ((m = bare.exec(hay)) !== null) urls.push(m[1]);
    if (fileUrl && /^https?:\/\//i.test(fileUrl)) urls.push(fileUrl);
    return Array.from(new Set(urls)).slice(0, 4);
  };
  const enrichCard = (c: (typeof contentCards)[number]) => {
    const evs = cardEvents.get(c.id) ?? [];
    const postedEv = [...evs].reverse().find((e) => e.to_stage === "posted");
    const approveEv = [...evs].reverse().find((e) => e.from_stage === "proposed" && e.to_stage !== "proposed");
    // Open change request on a still-proposed card: the client's own words on
    // what they want different — direct "topics to address" material.
    const crEv = c.stage === "proposed"
      ? [...evs].reverse().find((e) => (e.note ?? "").startsWith("CHANGES REQUESTED"))
      : undefined;
    const changeRequestNote = crEv?.note
      ? crEv.note.replace(/^CHANGES REQUESTED:\s*/, "").replace(/\[ATTACH:[^\]]+\]/g, "").trim().slice(0, 300) || null
      : null;
    return {
      title: c.title,
      link: c.link,
      stage: c.stage,
      body: (c.body ?? "").slice(0, 280),
      postedAt: postedEv?.created_at?.slice(0, 10) ?? (c.stage === "posted" ? c.updated_at.slice(0, 10) : null),
      approvedAt: approveEv?.created_at?.slice(0, 10) ?? null,
      // "client" = the customer approved it themselves; "admin" = F1 moved it.
      approvedBy: approveEv?.actor_role ?? null,
      changeRequestNote,
      // Image URLs on the card — the posted-work gallery copies these into
      // workGallery entries verbatim.
      images: extractCardImages(c.body, c.file_url),
    };
  };
  const contentBoard = {
    posted: contentCards.filter((c) => c.stage === "posted").map(enrichCard),
    approvedQueued: contentCards.filter((c) => c.stage === "pending").map(enrichCard),
    awaitingApproval: contentCards.filter((c) => c.stage === "proposed").map(enrichCard),
  };
  const postedInWindow = contentBoard.posted.filter(
    (c) => c.postedAt != null && c.postedAt >= window.fromIso && c.postedAt <= window.toIso,
  );

  // Image deliverables from the client's file folder this period — uploads
  // (flyer scans, photos, screenshots) that never got pasted onto a card
  // body, so card extraction can't see them. Signed for 30 days so the
  // render (and a re-render within the month) can fetch them.
  const deliverableImages: Array<{ filename: string; category: string | null; uploadedAt: string; image: string }> = [];
  try {
    const fileRows = await data.listFiles(clientId);
    const imgRows = fileRows
      .filter((f) => /^image\/(png|jpe?g|gif)/i.test(f.mime_type ?? ""))
      .filter((f) => f.created_at.slice(0, 10) >= window.fromIso && f.created_at.slice(0, 10) <= window.toIso)
      .slice(0, 12);
    if (imgRows.length && !usingMock) {
      const supabase = await createServiceClient();
      for (const f of imgRows) {
        const { data: signed } = await supabase.storage
          .from(ATTACHMENT_BUCKET)
          .createSignedUrl(f.storage_path, 60 * 60 * 24 * 30);
        if (signed?.signedUrl) {
          deliverableImages.push({
            filename: f.filename,
            category: f.category,
            uploadedAt: f.created_at.slice(0, 10),
            image: signed.signedUrl,
          });
        }
      }
    }
  } catch {
    // deliverables are additive — never block the deck
  }

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
  // A too-fat report is SKIPPED (not a hard stop — `break` used to silently
  // drop every report after the first fat one) and named in deepPullDropped
  // so the omission is visible instead of silent.
  const DEEP_PULL_CHAR_BUDGET = 150_000;
  let deepPullChars = 0;
  const semrushDeepPull: Array<{ report: string; rows: Array<Record<string, unknown>> }> = [];
  const deepPullDropped: string[] = [];
  for (const r of semrushReports) {
    const meta = (r.meta ?? {}) as Record<string, unknown>;
    const label = String(meta.label ?? r.report_type);
    const entry = {
      report: label,
      rows: ((r.rows ?? []) as Array<Record<string, unknown>>).slice(0, 25),
    };
    const size = JSON.stringify(entry).length;
    if (deepPullChars + size > DEEP_PULL_CHAR_BUDGET) {
      deepPullDropped.push(label);
      continue;
    }
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
  // Anything that silently degrades the deck's inputs gets named here and
  // surfaced to the operator (prompt_only response + server logs) — an
  // operator-curated conversation quietly missing is worse than an error.
  const warnings: string[] = [];
  const curatedIds = field(fd, "fieldy_ids")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (fieldyConfigured()) {
    try {
      let chosen: Awaited<ReturnType<typeof fieldyMeetingsInWindow>>;
      if (curatedIds.length > 0) {
        // Pull a wide window (paginated) so older curated picks still resolve.
        const wide = new Date();
        wide.setUTCDate(wide.getUTCDate() - 730);
        const wideFrom = wide.toISOString().slice(0, 10);
        const all = await fieldyMeetingsInWindow(wideFrom, today, 500);
        chosen = all.filter((n) => curatedIds.includes(n.id));
        const missing = curatedIds.filter((id) => !chosen.some((n) => n.id === id));
        if (missing.length) {
          warnings.push(
            `${missing.length} of your ${curatedIds.length} selected Fieldy conversation(s) could not be resolved and are NOT in this deck's transcript.`,
          );
        }
      } else {
        const notes = await fieldyMeetingsInWindow(window.fromIso, window.toIso, 100);
        // Token-based matcher (shared with the meetings deck) — survives
        // partial names like "Buckets" for "Buckets Of Ink LLC".
        chosen = notes.filter((n) => meetingMatchesClient(n, client.company_name));
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
    } catch (e) {
      transcript = "";
      warnings.push(
        `Fieldy fetch failed (${e instanceof Error ? e.message.slice(0, 300) : "unknown error"}) — this deck has NO meeting-notes context.`,
      );
    }
  }
  if (deepPullDropped.length) {
    warnings.push(`SEMrush deep-pull reports omitted for size: ${deepPullDropped.join(", ")}.`);
  }
  for (const w of warnings) console.warn("[monthly-report]", w);

  // ---------- CLIENT_PROFILE from onboarding ----------
  // Pull the onboarding row (if the customer has submitted one) and hand the
  // qualitative fields to the synthesis bot as CLIENT_PROFILE. These aren't
  // numbers — they're voice/context: who the ideal customer is, what services
  // to spotlight, what growth lanes matter. The bot uses this to tailor
  // narrative sections (executiveSummary.intro, whatsNext, framing) so a
  // print shop's report doesn't sound like a law firm's.
  const trimmed = (v: unknown): string | null => {
    const s = typeof v === "string" ? v.trim() : "";
    return s ? s : null;
  };
  const labeled = (label: string | null | undefined, text: string | null): string | null => {
    if (!text) return null;
    const l = trimmed(label);
    return l ? `${l}: ${text}` : text;
  };
  const clientProfile = {
    submitted: Boolean(onboardingRow),
    identity: {
      companyBio: trimmed(ob.company_bio),
      differentiator: trimmed(ob.brand_diff),
      threeWords: trimmed(ob.brand_3words),
      brandFonts: trimmed(ob.brand_fonts),
      brandGuidelines: trimmed(ob.brand_guidelines_notes),
    },
    market: {
      idealCustomer: trimmed(ob.ideal_client),
      highestRevenueServices: trimmed(ob.highest_revenue_cases),
      projectsToAvoid: trimmed(ob.cases_to_avoid),
      saturatedMarkets: trimmed(ob.saturated_markets),
      growthOpportunity: trimmed(ob.growth_opportunity),
      competitionFocus: trimmed(ob.market_focus_competition),
      priorityCities: trimmed(ob.market_focus_priority_cities),
      marketsToAvoid: trimmed(ob.market_focus_avoid),
    },
    footprint: {
      primaryCity: trimmed(ob.primary_city?.name),
      primaryCityDetail: ob.primary_city
        ? {
            hasOffice: trimmed(ob.primary_city.has_office),
            priority: trimmed(ob.primary_city.priority),
            revenueMarket: trimmed(ob.primary_city.revenue_market),
          }
        : null,
      services: Array.isArray(ob.services)
        ? ob.services
            .map((s) => ({ name: trimmed(s?.name), description: trimmed(s?.description), priority: s?.priority ?? null }))
            .filter((s) => s.name)
        : [],
      surroundingCities: Array.isArray(ob.service_locations)
        ? ob.service_locations
            .map((l) => ({ city: trimmed(l?.city), priority: trimmed(l?.priority), hasOffice: trimmed(l?.has_office) }))
            .filter((l) => l.city)
        : [],
      countiesServed: Array.isArray(ob.counties_served)
        ? ob.counties_served
            .map((c) => ({ name: trimmed(c?.name), priority: trimmed(c?.priority) }))
            .filter((c) => c.name)
        : [],
      statewide: ob.statewide_coverage?.provides === "yes"
        ? { limitations: trimmed(ob.statewide_coverage.limitations), priority: trimmed(ob.statewide_coverage.priority) }
        : null,
      outOfState: Array.isArray(ob.out_of_state)
        ? ob.out_of_state
            .map((o) => ({ state: trimmed(o?.state), serviceType: trimmed(o?.service_type), priority: trimmed(o?.priority) }))
            .filter((o) => o.state)
        : [],
      futureExpansion: trimmed(ob.future_expansion_targets),
      // The client's actual social channels — lets postingSocial name real
      // handles instead of generic channel labels.
      socials: Object.entries(ob.socials ?? {})
        .map(([platform, v]) => ({ platform, handle: trimmed(v?.username) }))
        .filter((s) => s.handle),
    },
    performance: {
      pastSuccesses: [
        ob.perf_social_active ? labeled(ob.perf_social_used, trimmed(ob.perf_social_explanation)) : null,
        ob.perf_website_active ? trimmed(ob.perf_website_explanation) : null,
        ob.perf_paid_active ? labeled(ob.perf_paid_platforms, trimmed(ob.perf_paid_explanation)) : null,
        ob.perf_podcast_active ? labeled(ob.perf_podcast_name, trimmed(ob.perf_podcast_explanation)) : null,
        ob.perf_other_active ? labeled(ob.perf_other, trimmed(ob.perf_other_explanation)) : null,
      ].filter(Boolean),
      // What already failed — so the deck never proposes a strategy the
      // client told us didn't work.
      underperformed: trimmed(ob.perf_underperforming),
      underperformedChannel: trimmed(ob.perf_underperforming_channel),
      underperformedAttempted: trimmed(ob.perf_underperforming_attempted),
      additionalNotes: trimmed(ob.perf_additional_notes),
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
    // The previous meeting on record — the continuity anchor for "since our
    // last meeting" framing. Null = first meeting / no history.
    lastMeetingDate,
    windowAnchoredToLastMeeting: rawRange === "since_last" && Boolean(lastMeetingDate),
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
      byDevice: gscDevices.map((d) => ({ device: d.key, clicks: d.clicks, impressions: d.impressions, position: d.position })),
      byCountry: gscCountries.map((c) => ({ country: c.key, clicks: c.clicks, impressions: c.impressions })),
      trendDailyClicks: capSeries(trendPoints).map((p) => ({ date: p.captured_at, value: p.value })),
      trendDailyImpressions: capSeries(imprTrend).map((p) => ({ date: p.captured_at, value: p.value })),
    },
    ga4: {
      sessions: { current: sessionsCur, prior: sessionsPrev },
      // Real zeros are data (a site with no conversions is a true statement),
      // so no ||-null coercion here.
      activeUsers: { current: activeUsersCur, prior: activeUsersPrev },
      conversions: { current: conversionsCur, prior: conversionsPrev },
      channels: ga4Channels.map((c) => ({ channel: c.key, sessions: c.sessions, activeUsers: c.activeUsers, conversions: c.conversions })),
      topLandingPages: ga4LandingPages.map((p) => ({ page: p.key, sessions: p.sessions, conversions: p.conversions })),
      trendDailySessions: capSeries(sessionsTrend).map((p) => ({ date: p.captured_at, value: p.value })),
    },
    bing: {
      clicks: { current: bingClicksCur, prior: bingClicksPrev },
      impressions: { current: bingImprCur, prior: bingImprPrev },
      avgClickPosition: bingAvgPosCur != null ? Number(bingAvgPosCur.toFixed(1)) : null,
      avgImpressionPosition: bingAvgImprPosCur != null ? Number(bingAvgImprPosCur.toFixed(1)) : null,
      trendDailyClicks: capSeries(bingClicksTrend).map((p) => ({ date: p.captured_at, value: p.value })),
    },
    semrush: {
      // Window-aware values (as of the window end) with prior-window deltas
      // and monthly history series — chartable growth, not just one number.
      organicKeywords: { current: semrushKeywordsCur, prior: semrushKeywordsPrev, trendMonthly: monthlySeries(semrushKeywordsAll) },
      organicTraffic: { current: semrushTrafficCur, prior: semrushTrafficPrev, trendMonthly: monthlySeries(semrushTrafficAll) },
      authorityScore: semrushAuthorityCur,
      backlinks: { current: semrushBacklinksCur, prior: semrushBacklinksPrev, trendMonthly: monthlySeries(semrushBacklinksAll) },
      referringDomains: { current: semrushRefDomainsCur, prior: semrushRefDomainsPrev },
      siteHealth: siteHealthCur,
      mentions: mentionsCur,
      paid: semrushPaid,
      visibility: visibilityCur,
      aiVisibility: aiVisibilityCur,
      competitors: semrushCompetitors,
      backlinksOverviewRows: semrushBacklinks,
      deepPullReports: semrushDeepPull,
      deepPullDropped,
    },
    content: {
      postedThisPeriod: postedInWindow,
      postedAllTime: contentBoard.posted,
      approvedQueued: contentBoard.approvedQueued,
      awaitingApproval: contentBoard.awaitingApproval,
      // Image deliverables uploaded to the client's folder this period
      // (signed URLs, 30 days) — extra posted-work gallery candidates for
      // work delivered as uploads rather than pasted links.
      deliverableImages,
    },
    // Internal work queue: real completed/upcoming items ground the
    // "work delivered" and whatsNext sections in actual tasks.
    internalWork: {
      completedThisPeriod: allTasks
        .filter((t) => t.status === "done" && t.updated_at.slice(0, 10) >= window.fromIso && t.updated_at.slice(0, 10) <= window.toIso)
        .slice(0, 20)
        .map((t) => ({ title: t.title, completedOn: t.updated_at.slice(0, 10) })),
      open: allTasks
        .filter((t) => t.status === "open")
        .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"))
        .slice(0, 15)
        .map((t) => ({ title: t.title, due: t.due_date })),
    },
    calendar: {
      thisPeriod: calendarEvents
        .filter((e) => e.starts_at.slice(0, 10) >= window.fromIso && e.starts_at.slice(0, 10) <= window.toIso)
        .slice(0, 15)
        .map((e) => ({ title: e.title, type: e.type, date: e.starts_at.slice(0, 10) })),
      upcoming: calendarEvents
        .filter((e) => e.starts_at.slice(0, 10) > today)
        .slice(0, 10)
        .map((e) => ({ title: e.title, type: e.type, date: e.starts_at.slice(0, 10) })),
    },
    engagement: {
      lastClientLogin: loginAudit[0]?.logged_in_at?.slice(0, 10) ?? null,
      loginsThisPeriod: loginAudit.filter(
        (l) => l.logged_in_at.slice(0, 10) >= window.fromIso && l.logged_in_at.slice(0, 10) <= window.toIso,
      ).length,
    },
  };

  // ---------- CLIENT_MESSAGES — the portal thread this period ----------
  // The client's own questions/asks since the last deck, straight from the
  // portal messenger. Qualitative context for "topics to address".
  const messagesBlock = portalMessages
    .filter((m) => m.created_at.slice(0, 10) >= window.fromIso && m.created_at.slice(0, 10) <= window.toIso)
    .slice(-40)
    .map((m) => `• [${m.created_at.slice(0, 10)}] ${m.from_role}: ${m.body.slice(0, 400)}`)
    .join("\n");

  // ---------- PRIOR_DECK — what we promised last time ----------
  // The previous deck's plan + questions, so this deck can review commitments
  // ("since our last meeting") instead of starting from a blank page.
  const priorDeckRow = await data.latestDeckReport(clientId).catch(() => null);
  const priorContent = (priorDeckRow?.content ?? null) as (MonthlyContent & Record<string, unknown>) | null;
  const priorDeckBlock = priorDeckRow && priorContent
    ? JSON.stringify(
        {
          generatedOn: priorDeckRow.created_at.slice(0, 10),
          meetingDate: priorDeckRow.meeting_date,
          period: `${priorDeckRow.period_from ?? "?"} → ${priorDeckRow.period_to ?? "?"}`,
          whatsNext: priorContent.whatsNext ?? [],
          questionsForClient: priorContent.questions && typeof priorContent.questions === "object"
            ? (priorContent.questions as { forClient?: string[] }).forClient ?? []
            : [],
        },
        null,
        2,
      )
    : "";

  // ---------- 2a. Prompt-only export (zero API credits) ----------
  // Same data pull, no Claude call: hand back the exact system prompt + data
  // message so the admin can draft in the Claude app on their subscription,
  // then paste the JSON back via "Import deck JSON".
  if (field(fd, "prompt_only") === "1") {
    const user = buildUserMsg({
      reportMeta,
      brandProfile,
      clientProfile,
      profileData,
      fieldyTranscript: transcript,
      selectedNotes,
      clientMessages: messagesBlock,
      priorDeck: priorDeckBlock,
    });
    return Response.json({
      system: SYNTHESIS_SYSTEM_PROMPT,
      user,
      warnings,
      filenameHint: `${slugify(client.company_name)}-${window.toIso}-deck-prompt.txt`,
    });
  }

  // ---------- 2b. Synthesize the deck content ----------
  let content: MonthlyContent;
  try {
    content = await synthesize(
      {
        reportMeta,
        brandProfile,
        clientProfile,
        profileData,
        fieldyTranscript: transcript,
        selectedNotes,
        clientMessages: messagesBlock,
        priorDeck: priorDeckBlock,
      },
      request.signal,
    );
  } catch (err) {
    if (request.signal.aborted) return new Response("Canceled", { status: 499 });
    const msg = err instanceof Error ? err.message : "synthesis failed";
    return new Response(`Synthesis failed: ${msg}`, { status: 502 });
  }

  content = normalizeMonthlyContent(content);
  applyDefaults(content);

  // Dry-run: return the content object for inspection without rendering.
  if (field(fd, "dryrun") === "1") {
    return Response.json({
      window,
      warnings,
      sentToBot: {
        reportMeta,
        brandProfile,
        clientProfile,
        profileData,
        fieldyTranscript: transcript,
        selectedNotes,
        clientMessages: messagesBlock,
        priorDeck: priorDeckBlock,
      },
      content,
    });
  }

  return renderAndRespond(content);
}
