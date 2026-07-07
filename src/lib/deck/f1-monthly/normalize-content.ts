// Normalize a MonthlyContent object from any Claude output — API synthesis,
// the revise chat, or JSON pasted back from the Claude app — into the exact
// shape the preview and the pptx builder consume. The OUTPUT CONTRACT
// under-specifies a couple of sections, so models improvise field names
// ({channel, clicks} instead of {name, metric}; competitors without a
// position; aiVisibility as an object). Accept the common drifts instead of
// rendering "undefined" on a slide.

import type { MonthlyContent } from "./deck-builder";

type AnyRec = Record<string, unknown>;

const isObj = (v: unknown): v is AnyRec => Boolean(v) && typeof v === "object" && !Array.isArray(v);

function toStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return Number.isFinite(v) ? v.toLocaleString("en-US") : "";
  if (typeof v === "boolean") return String(v);
  if (isObj(v)) {
    for (const k of ["text", "note", "title", "label", "url", "name"]) {
      if (typeof v[k] === "string" && v[k]) return v[k] as string;
    }
  }
  return "";
}

// Loose string[] — accepts arrays of strings/numbers/objects, a bare string,
// or an object whose values are worth listing.
function strArr(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(toStr).filter(Boolean);
  if (typeof v === "string") return v ? [v] : [];
  return [];
}

function toNum(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^\d.-]/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

export function normalizeMonthlyContent(raw: unknown): MonthlyContent {
  if (!isObj(raw)) return {};
  const c = { ...(raw as AnyRec) };

  // ----- executiveSummary -----
  if (isObj(c.executiveSummary)) {
    const es = { ...c.executiveSummary };
    if (es.wins != null) es.wins = strArr(es.wins);
    c.executiveSummary = es;
  }

  // ----- sinceLastMeeting: topics/commitments as string lists -----
  if (isObj(c.sinceLastMeeting)) {
    const slm = { ...c.sinceLastMeeting };
    if (slm.topics != null) slm.topics = strArr(slm.topics);
    if (slm.commitments != null) slm.commitments = strArr(slm.commitments);
    if (slm.note != null) slm.note = toStr(slm.note);
    c.sinceLastMeeting = slm;
  }

  // ----- keywordRankings.rows: keyword/url strings, prior/current numbers -----
  if (isObj(c.keywordRankings)) {
    const kr = { ...c.keywordRankings };
    if (Array.isArray(kr.rows)) {
      kr.rows = kr.rows.filter(isObj).map((r) => ({
        ...r,
        keyword: toStr(r.keyword ?? r.term ?? r.query),
        url: typeof r.url === "string" ? r.url : toStr(r.url),
        prior: toNum(r.prior ?? r.previous ?? r.was) ?? 0,
        current: toNum(r.current ?? r.now ?? r.position) ?? 0,
      }));
    }
    c.keywordRankings = kr;
  }

  // ----- competitiveSnapshot: competitors need {domain, position} -----
  if (isObj(c.competitiveSnapshot)) {
    const cs = { ...c.competitiveSnapshot };
    if (Array.isArray(cs.competitors)) {
      cs.competitors = cs.competitors.map((comp) => {
        if (!isObj(comp)) return { domain: toStr(comp), position: "" };
        let position = toStr(comp.position ?? comp.metric);
        if (!position) {
          const ck = toNum(comp.commonKeywords ?? comp.sharedKeywords);
          const ok = toNum(comp.organicKeywords ?? comp.keywords);
          if (ck != null) position = `${ck.toLocaleString("en-US")} shared keywords`;
          else if (ok != null) position = `${ok.toLocaleString("en-US")} organic keywords`;
        }
        return { ...comp, domain: toStr(comp.domain ?? comp.site ?? comp.name), position };
      });
    }
    if (cs.closing == null && cs.note != null) cs.closing = toStr(cs.note);
    if (isObj(cs.gaps)) {
      const g = { ...cs.gaps };
      for (const k of ["ahead", "close", "opportunity"] as const) {
        if (g[k] != null) g[k] = strArr(g[k]);
      }
      cs.gaps = g;
    }
    c.competitiveSnapshot = cs;
  }

  // ----- organicTraffic: stat values must be strings -----
  if (isObj(c.organicTraffic)) {
    const ot = { ...c.organicTraffic };
    for (const k of ["clicks", "impressions", "ctr", "avgPosition"] as const) {
      if (isObj(ot[k])) {
        const stat = { ...(ot[k] as AnyRec) };
        if (stat.value != null) stat.value = toStr(stat.value);
        if (stat.prior != null) stat.prior = toStr(stat.prior);
        ot[k] = stat;
      }
    }
    c.organicTraffic = ot;
  }

  // ----- crossChannelAi: channels {name, metric}; aiVisibility string[] -----
  if (isObj(c.crossChannelAi)) {
    const cc = { ...c.crossChannelAi };
    if (Array.isArray(cc.channels)) {
      cc.channels = cc.channels.map((ch) => {
        if (!isObj(ch)) return { name: toStr(ch), metric: "" };
        let metric = toStr(ch.metric ?? ch.value);
        if (!metric) {
          const parts: string[] = [];
          const clicks = toNum(ch.clicks);
          const impressions = toNum(ch.impressions);
          const score = toNum(ch.score);
          if (clicks != null) parts.push(`${clicks.toLocaleString("en-US")} clicks`);
          if (impressions != null) parts.push(`${impressions.toLocaleString("en-US")} impressions`);
          if (score != null) parts.push(`score ${score}`);
          metric = parts.join(" · ");
        }
        return { name: toStr(ch.name ?? ch.channel ?? ch.source), metric };
      });
    }
    if (cc.aiVisibility != null && !Array.isArray(cc.aiVisibility)) {
      const ai = cc.aiVisibility;
      const items: string[] = [];
      if (isObj(ai)) {
        const score = toNum(ai.score);
        if (score != null) items.push(`Tracked AI visibility score: ${score}`);
        const note = toStr(ai.note ?? ai.summary);
        if (note) items.push(note);
      } else {
        const s = toStr(ai);
        if (s) items.push(s);
      }
      cc.aiVisibility = items;
    } else if (Array.isArray(cc.aiVisibility)) {
      cc.aiVisibility = strArr(cc.aiVisibility);
    }
    c.crossChannelAi = cc;
  }

  // ----- plain string-list sections -----
  if (isObj(c.contentInsights)) {
    const ci = { ...c.contentInsights };
    if (ci.posted != null) ci.posted = strArr(ci.posted);
    if (ci.approved != null) ci.approved = strArr(ci.approved);
    if (ci.pagesCreated != null) ci.pagesCreated = strArr(ci.pagesCreated);
    if (ci.pagesOptimized != null) ci.pagesOptimized = strArr(ci.pagesOptimized);
    c.contentInsights = ci;
  }
  if (isObj(c.photoBacklink)) {
    const pb = { ...c.photoBacklink };
    if (pb.refreshes != null) pb.refreshes = strArr(pb.refreshes);
    c.photoBacklink = pb;
  }

  // ----- workGallery: only real image refs survive -----
  // Models may drift field names (url/src instead of image) or emit strings.
  // Keep an item only when it carries an http(s) image URL or an already-
  // inlined data: URI; dedupe by that ref and cap at the builder's limit.
  if (c.workGallery != null) {
    const seen = new Set<string>();
    const arr = Array.isArray(c.workGallery) ? c.workGallery : [];
    c.workGallery = arr
      .map((g) => {
        if (typeof g === "string") return { image: g };
        if (!isObj(g)) return null;
        const image = toStr(g.image ?? g.url ?? g.src).trim();
        const data = typeof g.data === "string" && g.data.startsWith("data:image/") ? g.data : undefined;
        return {
          title: toStr(g.title) || undefined,
          date: toStr(g.date ?? g.postedAt) || undefined,
          caption: toStr(g.caption) || undefined,
          image: image || undefined,
          ...(data ? { data } : {}),
        };
      })
      .filter((g): g is NonNullable<typeof g> => {
        if (!g) return false;
        const ref = (g as { data?: string }).data ?? g.image ?? "";
        if (!ref || seen.has(ref)) return false;
        if (!(g as { data?: string }).data && !/^https?:\/\//i.test(g.image ?? "")) return false;
        seen.add(ref);
        return true;
      })
      .slice(0, 12);
  }
  if (isObj(c.postingSocial)) {
    const ps = { ...c.postingSocial };
    if (ps.channels != null) ps.channels = strArr(ps.channels);
    c.postingSocial = ps;
  }
  if (c.whatsNext != null) c.whatsNext = strArr(c.whatsNext);
  if (isObj(c.questions)) {
    const q = { ...c.questions };
    if (q.forClient != null) q.forClient = strArr(q.forClient);
    c.questions = q;
  }

  // ----- rankingDetail.topPages -----
  if (isObj(c.rankingDetail)) {
    const rd = { ...c.rankingDetail };
    if (Array.isArray(rd.topPages)) {
      rd.topPages = rd.topPages.filter(isObj).map((p) => ({
        ...p,
        url: toStr(p.url ?? p.page),
        clicks: toNum(p.clicks),
        impressions: toNum(p.impressions),
      }));
    }
    c.rankingDetail = rd;
  }

  // ----- charts: numeric series, string labels -----
  if (Array.isArray(c.charts)) {
    c.charts = c.charts.filter(isObj).map((ch) => ({
      ...ch,
      title: toStr(ch.title),
      type: ch.type === "bar" ? "bar" : "line",
      labels: strArr(ch.labels),
      series: Array.isArray(ch.series)
        ? ch.series.filter(isObj).map((s, i) => ({
            name: toStr(s.name ?? s.label) || `Series ${i + 1}`,
            values: Array.isArray(s.values) ? s.values.map((v) => toNum(v) ?? 0) : [],
          }))
        : [],
    }));
  }

  // ----- sectionTitles: string map -----
  if (isObj(c.sectionTitles)) {
    c.sectionTitles = Object.fromEntries(
      Object.entries(c.sectionTitles).map(([k, v]) => [k, toStr(v)]).filter(([, v]) => v),
    );
  }

  return whitelabel(c) as MonthlyContent;
}

// ----- white-label: client-facing decks never name our tooling -----
// Every data source reads as "F1 Media Analytics" on the slides. Applied as
// a deep pass over all strings so it holds no matter where the JSON came
// from (API synthesis, revise chat, or a paste from the Claude app). Search
// CHANNELS ("Google Search", "Bing Search") are left alone — those are where
// customers search, not tools. URLs are skipped.
const TOOL_NAMES: Array<[RegExp, string]> = [
  [/google search console/gi, "F1 Media Analytics"],
  [/search console/gi, "F1 Media Analytics"],
  [/google analytics(?: 4)?/gi, "F1 Media Analytics"],
  [/bing webmaster(?: tools)?/gi, "F1 Media Analytics"],
  [/\bsemrush\b/gi, "F1 Media Analytics"],
  [/\bGSC\b/g, "F1 Media Analytics"],
  [/\bGA4\b/g, "F1 Media Analytics"],
];
function whitelabel(v: unknown): unknown {
  if (typeof v === "string") {
    // URLs and inlined images pass through untouched — a data: URI is huge
    // and a URL containing a tool name is an address, not client-facing copy.
    if (/^(https?:\/\/|data:)/i.test(v)) return v;
    let s = v;
    for (const [re, sub] of TOOL_NAMES) s = s.replace(re, sub);
    // Collapse artifacts like "F1 Media Analytics's F1 Media Analytics".
    return s.replace(/(F1 Media Analytics)(['’]s)? (F1 Media Analytics)/g, "$1");
  }
  if (Array.isArray(v)) return v.map(whitelabel);
  if (isObj(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, whitelabel(x)]));
  return v;
}
