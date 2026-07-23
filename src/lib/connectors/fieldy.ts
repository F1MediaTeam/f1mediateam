// Fieldy public API client — reads meeting conversations from the Fieldy
// wearable note-taker so the AI deck writer can ground its narrative in what
// was actually said in client meetings, not just the analytics numbers.
//
// Docs: https://api.fieldy.ai/docs  ·  Bearer-token auth, REST, 30 req/min.
//   Base: https://api.fieldy.ai/api/public/v2
//
// Verified live against the API:
//   GET /conversations?startTime&endTime&pageSize
//     → { items: [{ id, title, summary, content, startTime, endTime,
//                   keywords[], quotes[{text,context}], ... }], nextCursor }
//   (startTime/endTime are REQUIRED, ISO 8601. The list row already carries
//   `summary` + structured `content`, so one call gives us what we need —
//   no per-meeting detail or transcript pagination required for the deck.)
//
// Note: Fieldy meetings aren't tagged with our app's client IDs, so callers
// match meetings to a client by name (see ai-narrative.ts).

const FIELDY_BASE = "https://api.fieldy.ai/api/public/v2";

// The /conversations endpoint caps pageSize at 50 (min 1). Sending more is a
// 400 "Input validation failed", so clamp to this and let cursor pagination
// collect the caller's full `limit` across pages.
const FIELDY_MAX_PAGE_SIZE = 50;

/** True when a key is present so the server can reach Fieldy. */
export function fieldyConfigured(): boolean {
  return Boolean(process.env.FIELDY_API_KEY);
}

function apiKey(): string {
  const key = process.env.FIELDY_API_KEY;
  if (!key) throw new Error("FIELDY_API_KEY is not set.");
  return key;
}

export interface FieldyMeetingNote {
  id: string;
  title: string;
  /** ISO 8601 start time, or "" if absent. */
  startTime: string;
  /** Fieldy's narrative summary / key points. */
  summary: string;
  /** Fieldy's structured memory note (markdown sections incl. next-steps). */
  content: string;
  keywords: string[];
  /** Verbatim quotes Fieldy captured, with surrounding context when present. */
  quotes: Array<{ text: string; context: string }>;
}

type Json = Record<string, unknown>;

function pick(obj: Json, ...keys: string[]): unknown {
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function strList(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v
      .map((it) => (typeof it === "string" ? it : str(pick((it ?? {}) as Json, "text", "title", "name", "value"))))
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function quoteList(v: unknown): Array<{ text: string; context: string }> {
  if (!Array.isArray(v)) return [];
  return v
    .map((it) => {
      if (typeof it === "string") return { text: it.trim(), context: "" };
      const o = (it ?? {}) as Json;
      return { text: str(pick(o, "text", "quote", "value")).trim(), context: str(pick(o, "context", "speaker")).trim() };
    })
    .filter((q) => q.text);
}

function rowsFrom(body: unknown): Json[] {
  if (Array.isArray(body)) return body as Json[];
  const b = (body ?? {}) as Json;
  for (const k of ["items", "data", "conversations", "results"]) {
    if (Array.isArray(b[k])) return b[k] as Json[];
  }
  return [];
}

/**
 * Conversations whose start falls in [fromIso, toIso] (YYYY-MM-DD, inclusive),
 * newest first. Follows nextCursor pagination so busy windows and curated-pick
 * resolution don't silently drop meetings past the first page. Returns each
 * meeting's summary + structured content for the deck prompt. Best-effort:
 * throws only on HTTP/auth failure of the FIRST page (callers catch); a
 * failure mid-pagination returns what was collected so far.
 */
export async function fieldyMeetingsInWindow(
  fromIso: string,
  toIso: string,
  limit = 50,
): Promise<FieldyMeetingNote[]> {
  const MAX_PAGES = 10;
  const notes: FieldyMeetingNote[] = [];
  const seenIds = new Set<string>();
  const seenCursors = new Set<string>();
  let cursor: string | null = null;

  for (let page = 0; page < MAX_PAGES && notes.length < limit; page++) {
    const url = new URL(FIELDY_BASE + "/conversations");
    url.searchParams.set("startTime", `${fromIso}T00:00:00.000Z`);
    url.searchParams.set("endTime", `${toIso}T23:59:59.999Z`);
    url.searchParams.set("pageSize", String(Math.min(limit, FIELDY_MAX_PAGE_SIZE)));
    if (cursor) url.searchParams.set("cursor", cursor);

    let body: unknown;
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey()}`, Accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`Fieldy API error (${res.status}): ${detail || res.statusText}`);
      }
      body = await res.json();
    } catch (e) {
      if (page === 0) throw e; // first page failing = real outage, surface it
      break; // later page failing: keep what we have
    }

    const rows = rowsFrom(body);
    let added = 0;
    for (const row of rows) {
      const note: FieldyMeetingNote = {
        id: str(pick(row, "id", "conversationId", "uuid", "_id")),
        title: str(pick(row, "title", "name", "summaryTitle")) || "Untitled meeting",
        startTime: str(pick(row, "startTime", "startedAt", "createdAt", "timestamp", "date")),
        summary: str(pick(row, "summary", "shortSummary", "overview")),
        content: str(pick(row, "content", "memory", "notes")),
        keywords: strList(pick(row, "keywords", "topics", "tags")),
        quotes: quoteList(pick(row, "quotes")),
      };
      if (!note.id || seenIds.has(note.id)) continue;
      seenIds.add(note.id);
      notes.push(note);
      added++;
    }

    const next = str(pick((body ?? {}) as Json, "nextCursor", "cursor", "next"));
    // Stop on: no cursor, a repeated cursor (param name mismatch would loop
    // the same page forever), or a page that added nothing new.
    if (!next || seenCursors.has(next) || added === 0) break;
    seenCursors.add(next);
    cursor = next;
  }

  notes.sort((a, b) => (a.startTime < b.startTime ? 1 : a.startTime > b.startTime ? -1 : 0));
  return notes.slice(0, limit);
}
