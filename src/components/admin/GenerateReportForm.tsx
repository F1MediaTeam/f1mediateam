"use client";

// The Deck Studio — client-side heart of /admin/reports.
//
// Flow: pick company + meeting cadence → the source rail shows exactly what
// Claude will build from → Draft the deck (staged progress, elapsed clock,
// cancel) → slides render as editable cards (click any text), the Claude
// chat applies bigger changes (screenshots included), the style bar
// overrides brand colors/fonts → Download renders exactly what's on screen.
//
// Requests carry an AbortController with a hard 340s ceiling, so a stalled
// synthesis surfaces as a real error instead of an infinite spinner.

import { useEffect, useRef, useState } from "react";
import {
  ClipboardList,
  Download,
  FileText,
  Globe2,
  LineChart,
  Mic,
  Search,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Pill } from "@/components/ui";
import FieldyPanelButton from "@/components/admin/FieldyPanelButton";
import DateRangePicker from "@/components/admin/DateRangePicker";
import DeckSlidePreviews from "@/components/admin/DeckSlidePreviews";
import DeckChat from "@/components/admin/DeckChat";
import MonthlyContentEditor from "@/components/admin/MonthlyContentEditor";
import type { MonthlyContent } from "@/lib/deck/f1-monthly/deck-builder";
import { normalizeMonthlyContent } from "@/lib/deck/f1-monthly/normalize-content";
import type { Client } from "@/lib/types";

interface Props {
  clients: Client[];
  defaultClientId: string;
  /** clientId → logo URL (dark-theme variant) for the preview cover slide. */
  logos?: Record<string, string | null>;
}

const MEETING_TYPES = [
  { value: "weekly", label: "Weekly", range: "7d" },
  { value: "monthly", label: "Monthly", range: "28d" },
  { value: "quarterly", label: "Quarterly", range: "90d" },
  { value: "yearly", label: "Yearly", range: "12m" },
  // Window anchors to the previous meeting on record for this client —
  // exactly the span since the client was last seen (falls back to 28d
  // server-side when no meeting exists yet).
  { value: "sincelast", label: "Since last meeting", range: "since_last" },
  { value: "custom", label: "Custom", range: "custom" },
] as const;

const FONTS = [
  "Century Schoolbook",
  "Calibri",
  "Arial",
  "Georgia",
  "Montserrat",
  "Helvetica",
  "Times New Roman",
  "Verdana",
  "Garamond",
  "Tahoma",
] as const;

const SOURCE_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  gsc: Search,
  ga4: LineChart,
  bing: Globe2,
  semrush: TrendingUp,
  onboarding: ClipboardList,
  fieldy: Mic,
  content: FileText,
};

interface SourceStatus {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
}

interface DeckStyle {
  brand_primary?: string;
  brand_secondary?: string;
  brand_tertiary?: string;
  display_font?: string;
  body_font?: string;
}

// Honest, elapsed-time-based stages — synthesis genuinely spends its time in
// these phases, and most of it in the last one.
const DRAFT_STAGES = [
  { at: 0, label: "Pulling analytics — Search Console, GA4, Bing, SEMrush" },
  { at: 8, label: "Reading Fieldy meeting notes & the onboarding profile" },
  { at: 16, label: "Claude is writing your slides" },
];
const REQUEST_TIMEOUT_MS = 340_000;

const labelCls =
  "block text-[11px] uppercase tracking-widest text-[var(--color-text-muted)] mb-2";

function fmtElapsed(s: number): string {
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${String(s % 60).padStart(2, "0")}s` : `${s}s`;
}

function ProgressPanel({
  mode,
  hasEditedDeck,
  elapsed,
  onCancel,
}: {
  mode: "preview" | "generate" | "export";
  hasEditedDeck: boolean;
  elapsed: number;
  onCancel: () => void;
}) {
  const rendering = mode === "generate" && hasEditedDeck;
  const stages =
    mode === "export"
      ? [{ at: 0, label: "Pulling analytics & packaging the prompt for the Claude app" }]
      : rendering
        ? [{ at: 0, label: "Rendering your edited deck to .pptx" }]
        : mode === "generate"
          ? [...DRAFT_STAGES, { at: 120, label: "Rendering to .pptx" }]
          : DRAFT_STAGES;
  const activeIdx = stages.reduce((acc, s, i) => (elapsed >= s.at ? i : acc), 0);

  return (
    <div className="animate-studio-rise rounded-2xl border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/[0.06] p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--color-accent)]/15 animate-studio-pulse-ring">
            <Sparkles size={16} className="text-[var(--color-accent)]" />
          </span>
          <div>
            <div className="text-sm font-semibold">
              {rendering ? "Building your file" : "Drafting your deck"}
            </div>
            <div className="text-xs text-[var(--color-text-muted)] tabular-nums">
              {fmtElapsed(elapsed)} elapsed
              {!rendering ? " · a full draft usually takes 1–3 minutes" : ""}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-hover)] transition"
        >
          Cancel
        </button>
      </div>
      <ol className="mt-4 space-y-2">
        {stages.map((s, i) => (
          <li key={s.label} className="flex items-center gap-2.5 text-xs">
            {i < activeIdx ? (
              <span className="grid h-4 w-4 place-items-center rounded-full bg-[var(--color-accent)]/20 text-[var(--color-accent)] text-[9px]">
                ✓
              </span>
            ) : i === activeIdx ? (
              <span className="inline-block h-4 w-4 rounded-full border-2 border-[var(--color-accent)]/30 border-t-[var(--color-accent)] animate-spin" />
            ) : (
              <span className="inline-block h-4 w-4 rounded-full border border-[var(--color-border)]" />
            )}
            <span
              className={
                i === activeIdx
                  ? "text-[var(--color-text)]"
                  : i < activeIdx
                    ? "text-[var(--color-text-muted)] line-through decoration-[var(--color-border)]"
                    : "text-[var(--color-text-muted)]"
              }
            >
              {s.label}
              {i === activeIdx && !rendering ? "…" : ""}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function GenerateReportForm({ clients, defaultClientId, logos }: Props) {
  const [busy, setBusy] = useState<"idle" | "generate" | "preview" | "export">("idle");
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [clientId, setClientId] = useState(defaultClientId);
  const [meetingType, setMeetingType] = useState<string>("monthly");
  const [readiness, setReadiness] = useState<{ clientId: string; sources: SourceStatus[] } | null>(null);
  const [style, setStyle] = useState<DeckStyle>({});
  // Synthesized (then admin-edited) deck content. Set by "Preview & edit";
  // when present, Generate renders exactly this instead of re-synthesizing.
  const [content, setContentRaw] = useState<MonthlyContent | null>(null);
  const [savedDraftAvailable, setSavedDraftAvailable] = useState(false);
  const [deckHistory, setDeckHistory] = useState<
    { clientId: string; decks: Array<{ id: string; report_type: string; period_from: string | null; period_to: string | null; created_at: string }> } | null
  >(null);
  const abortRef = useRef<AbortController | null>(null);
  const abortReasonRef = useRef<"cancel" | "timeout" | null>(null);
  // Undo stack: every content replacement (chat edit, inline edit, editor,
  // import) pushes the previous state. Capped so memory stays bounded.
  const undoRef = useRef<MonthlyContent[]>([]);
  const [undoDepth, setUndoDepth] = useState(0);

  const setContent = (next: MonthlyContent | null, opts?: { skipUndo?: boolean }) => {
    if (content && next && !opts?.skipUndo) {
      undoRef.current = [...undoRef.current.slice(-19), content];
      setUndoDepth(undoRef.current.length);
    }
    if (!next) {
      undoRef.current = [];
      setUndoDepth(0);
    }
    setContentRaw(next);
  };

  const undo = () => {
    const prev = undoRef.current.pop();
    if (prev) {
      setUndoDepth(undoRef.current.length);
      setContentRaw(prev);
    }
  };

  const range = MEETING_TYPES.find((t) => t.value === meetingType)?.range ?? "28d";
  const draftKey = `deckDraft:${clientId}`;

  // Crash-proofing: the drafted deck is the most expensive artifact in this
  // flow, and it used to live only in React state. Autosave to localStorage
  // per client; offer restore after a refresh / accidental client switch.
  useEffect(() => {
    if (!content) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify({ savedAt: new Date().toISOString(), content }));
    } catch {
      // quota — a huge deck (embedded images) just won't autosave
    }
  }, [content, draftKey]);
  useEffect(() => {
    try {
      setSavedDraftAvailable(!content && Boolean(localStorage.getItem(draftKey)));
    } catch {
      setSavedDraftAvailable(false);
    }
  }, [clientId, content, draftKey]);

  function restoreSavedDraft() {
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { content?: MonthlyContent };
      if (parsed.content) {
        setContent(normalizeMonthlyContent(parsed.content), { skipUndo: true });
        setOk("Saved draft restored — this is where you left off.");
      }
    } catch {
      setError("The saved draft couldn't be read.");
    }
  }
  function discardSavedDraft() {
    try {
      localStorage.removeItem(draftKey);
    } catch {}
    setSavedDraftAvailable(false);
  }

  // Elapsed clock while a request is in flight.
  useEffect(() => {
    if (busy === "idle") return;
    const started = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(id);
  }, [busy]);

  // Data-readiness rail for the selected client AND window — the chips answer
  // "will this deck have data", so they re-check when the meeting type moves.
  useEffect(() => {
    let stale = false;
    if (!clientId) return;
    const params = new URLSearchParams({ range });
    fetch(`/api/report-readiness/${clientId}?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { sources?: SourceStatus[] } | null) => {
        if (!stale && json?.sources) setReadiness({ clientId, sources: json.sources });
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [clientId, range]);
  const sources = readiness?.clientId === clientId ? readiness.sources : null;

  // Past decks for the selected client (deck_reports history).
  useEffect(() => {
    let stale = false;
    if (!clientId) return;
    fetch(`/api/deck-history/${clientId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { decks?: Array<{ id: string; report_type: string; period_from: string | null; period_to: string | null; created_at: string }> } | null) => {
        if (!stale && json?.decks) setDeckHistory({ clientId, decks: json.decks });
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [clientId]);
  const pastDecks = deckHistory?.clientId === clientId ? deckHistory.decks : null;

  async function reopenDeck(deckId: string) {
    setError(null);
    try {
      const res = await fetch(`/api/deck-history/${clientId}?deck=${encodeURIComponent(deckId)}`);
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as { deck?: { content?: MonthlyContent } };
      if (!json.deck?.content) throw new Error("That deck has no saved content.");
      setContent(normalizeMonthlyContent(json.deck.content), { skipUndo: true });
      setOk("Past deck reopened — edit below, or Download to re-render it. No API credits used.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't reopen that deck.");
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setOk(null);
    const form = e.currentTarget;
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const isPreview = submitter?.getAttribute("name") === "dryrun";
    const isPromptExport = submitter?.getAttribute("name") === "prompt_only";
    const fd = new FormData(form);
    if (range === "custom" && (!fd.get("from") || !fd.get("to"))) {
      setError("Pick a start and end date for the custom range.");
      return;
    }
    if (isPromptExport) fd.set("prompt_only", "1");
    else if (isPreview) fd.set("dryrun", "1");
    else if (content) fd.set("content_json", JSON.stringify(content));

    const controller = new AbortController();
    abortRef.current = controller;
    abortReasonRef.current = null;
    const timeoutId = setTimeout(() => {
      abortReasonRef.current = "timeout";
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    setElapsed(0);
    setBusy(isPromptExport ? "export" : isPreview ? "preview" : "generate");
    try {
      const res = await fetch("/api/monthly-report", {
        method: "POST",
        body: fd,
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text();
        // Platform error pages (404/504/etc.) come back as HTML — don't dump
        // markup into the error box, translate to a readable sentence.
        const isHtml =
          (res.headers.get("content-type") ?? "").includes("text/html") ||
          text.trimStart().startsWith("<");
        throw new Error(
          isHtml
            ? `The server returned an error page (HTTP ${res.status}). Try again — if it keeps happening, check the Vercel logs.`
            : text || `HTTP ${res.status}`,
        );
      }
      if (isPromptExport) {
        const json = (await res.json()) as { system: string; user: string; warnings?: string[]; filenameHint?: string };
        // Degraded inputs (unresolvable Fieldy picks, dropped reports) must be
        // visible BEFORE the deck gets drafted from this export.
        if (json.warnings?.length) {
          setError("Heads up — this export is missing something:\n• " + json.warnings.join("\n• "));
        }
        const text = `${json.system}\n\n${"=".repeat(60)}\n\n${json.user}`;
        const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = json.filenameHint ?? "deck-prompt.txt";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        setOk(
          "Prompt downloaded — zero API credits used. Drop the .txt into the Claude app (or claude.ai) on your subscription, copy the JSON it returns, then click Import deck JSON below. Editing and downloading an imported deck costs nothing.",
        );
        return;
      }
      if (isPreview) {
        const json = (await res.json()) as { content: MonthlyContent };
        setContent(json.content);
        setOk("Deck drafted — click any slide text to edit, or ask Claude below.");
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get("content-disposition") ?? "";
      const m = cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
      const filename = m?.[1] ?? "report.pptx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      setOk(`Downloaded ${filename}${content ? " (your edited deck)" : ""}`);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError(
          abortReasonRef.current === "timeout"
            ? "This draft took longer than 5½ minutes and was stopped. Try again — if it keeps happening, tell Garrett's assistant (me) and I'll dig into this client's data volume."
            : "Canceled.",
        );
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      clearTimeout(timeoutId);
      abortRef.current = null;
      setBusy("idle");
    }
  }

  // Paste-back from the Claude app: accepts the bare content object or the
  // revise route's {note, content} wrapper, with or without a ```json fence.
  function handleImport() {
    const raw = importText.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    try {
      let parsed = JSON.parse(raw) as MonthlyContent & { content?: MonthlyContent };
      if (parsed && typeof parsed === "object" && parsed.content && typeof parsed.content === "object") {
        parsed = parsed.content as MonthlyContent & { content?: MonthlyContent };
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
      // Guard against cross-client mix-ups: Download stores the deck under
      // the SELECTED client (branding, filename, portal file list) — pasting
      // Client A's JSON with Client B selected makes a hybrid deck.
      const selectedName = clients.find((c) => c.id === clientId)?.company_name ?? "";
      const importedName = typeof parsed.client === "string" ? parsed.client.trim() : "";
      if (
        importedName &&
        selectedName &&
        importedName.toLowerCase() !== selectedName.toLowerCase() &&
        !window.confirm(
          `This JSON says it's a deck for "${importedName}", but "${selectedName}" is selected. ` +
            `Downloading would store it under ${selectedName} with ${selectedName}'s branding. Load it anyway?`,
        )
      ) {
        return;
      }
      // Models improvise field names in a couple of sections — normalize the
      // common drifts so a pasted draft renders exactly like an API draft.
      setContent(normalizeMonthlyContent(parsed));
      setImportOpen(false);
      setImportText("");
      setError(null);
      setOk("Draft imported — edit below. Download renders exactly this deck; no API credits used.");
    } catch {
      setError(
        "That doesn't parse as deck JSON. Paste exactly what Claude returned — starting with { and ending with } (a ```json fence is fine).",
      );
    }
  }

  async function copyDeckJson() {
    if (!content) return;
    await navigator.clipboard.writeText(JSON.stringify(content, null, 2));
    setOk("Deck JSON copied — paste it into the Claude app for big revisions, then Import the result back.");
  }

  const btnBase =
    "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition disabled:opacity-50 disabled:pointer-events-none";
  const ghostBtn =
    "rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-hover)] transition disabled:opacity-50 disabled:pointer-events-none";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <input type="hidden" name="range" value={range} />
      <input type="hidden" name="report_type" value={meetingType} />
      {/* Style overrides only ride along while the deck they were chosen for
          is on screen — never silently into a fresh draft. */}
      {content
        ? Object.entries(style).map(([k, v]) =>
            v ? <input key={k} type="hidden" name={k} value={v} /> : null,
          )
        : null}

      {/* ---------- BUILDER ---------- */}
      <section className="animate-studio-rise relative overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-6 sm:p-8 shadow-2xl shadow-black/30">
        <div className="pointer-events-none absolute -top-32 -right-24 h-72 w-72 rounded-full bg-[var(--color-accent)]/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -left-24 h-72 w-72 rounded-full bg-emerald-400/[0.07] blur-3xl" />

        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end">
          <div className="flex-1 min-w-0 xl:max-w-md">
            <label className={labelCls}>Client</label>
            <select
              name="client_id"
              required
              value={clientId}
              disabled={busy !== "idle"}
              onChange={(e) => {
                setClientId(e.target.value);
                // A drafted deck belongs to the client it was built for.
                setContent(null);
                setStyle({});
              }}
              className="h-14 w-full rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-bg)] px-4 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40"
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.company_name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>Meeting</label>
            <div className="inline-flex h-14 items-center rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-bg)] p-1.5">
              {MEETING_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  disabled={busy !== "idle"}
                  onClick={() => {
                    if (t.value !== meetingType) setContent(null);
                    setMeetingType(t.value);
                  }}
                  className={cn(
                    "h-full rounded-xl px-4 text-sm font-semibold transition whitespace-nowrap",
                    meetingType === t.value
                      ? "bg-[var(--color-accent)] text-[var(--color-on-accent)] shadow-lg shadow-[var(--color-accent)]/25"
                      : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 xl:ml-auto">
            <button
              type="submit"
              name="dryrun"
              value="1"
              disabled={busy !== "idle"}
              className={cn(
                btnBase,
                "h-14 px-6 text-sm border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 text-[var(--color-accent)] hover:bg-[var(--color-accent)]/20",
              )}
            >
              <Sparkles size={16} />
              {content ? "Re-draft" : "Draft the deck"}
            </button>
            <button
              type="submit"
              disabled={busy !== "idle"}
              className={cn(
                btnBase,
                "h-14 px-7 text-sm bg-gradient-to-r from-[var(--color-accent)] to-emerald-400 text-[var(--color-on-accent)] shadow-[0_0_35px_-8px_var(--color-accent)] hover:brightness-110",
              )}
            >
              <Download size={16} />
              {content ? "Download .pptx" : "Generate & download"}
            </button>
          </div>
        </div>

        {range === "custom" ? (
          <div className="relative mt-6">
            <label className={labelCls}>Custom range</label>
            <DateRangePicker fromName="from" toName="to" />
          </div>
        ) : null}

        <div className="relative mt-6">
          <label className={labelCls}>Focus points for this meeting (optional — Claude weights these highly)</label>
          <textarea
            name="selected_notes"
            rows={2}
            disabled={busy !== "idle"}
            placeholder="e.g. Spotlight the new service-area pages · client asked about AI visibility last call · keep it under 15 minutes"
            className="w-full rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-bg)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40"
          />
        </div>

        {sources ? (
          <div className="relative mt-6">
            <label className={labelCls}>Claude builds from</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
              {sources.map((s) => {
                const Icon = SOURCE_ICONS[s.key] ?? FileText;
                return (
                  <div
                    key={s.key}
                    title={s.detail}
                    className={cn(
                      "rounded-xl border px-3 py-2.5 transition",
                      s.ok
                        ? "border-[var(--color-accent)]/25 bg-[var(--color-accent)]/[0.06]"
                        : "border-[var(--color-border)] opacity-60",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Icon size={13} className={s.ok ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)]"} />
                      <span className="text-xs font-semibold truncate">{s.label}</span>
                      <span
                        className={cn(
                          "ml-auto h-1.5 w-1.5 rounded-full shrink-0",
                          s.ok ? "bg-[var(--color-accent)]" : "bg-[var(--color-border-strong)]",
                        )}
                      />
                    </div>
                    <div className="mt-1 text-[10px] leading-tight text-[var(--color-text-muted)] truncate">
                      {s.detail}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="relative mt-6 flex items-center gap-3 border-t border-[var(--color-border)] pt-4">
          <FieldyPanelButton
            clientName={clients.find((c) => c.id === clientId)?.company_name}
            windowDays={
              range === "7d" ? 7 : range === "28d" ? 28 : range === "90d" ? 90 : range === "12m" ? 365 : 90
            }
            resetKey={clientId}
          />
          <p className="ml-auto text-xs text-[var(--color-text-muted)]">
            Fieldy opens scoped to this client &amp; window — untick the filter to browse everything.
            Tier, brand, and context come from the profile automatically.
          </p>
        </div>

        {savedDraftAvailable ? (
          <div className="relative mt-4 flex flex-wrap items-center gap-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5">
            <span className="text-xs text-amber-200">
              You have an unsaved draft for this client from a previous session.
            </span>
            <button type="button" onClick={restoreSavedDraft} className={ghostBtn}>
              Restore draft
            </button>
            <button type="button" onClick={discardSavedDraft} className={ghostBtn}>
              Dismiss
            </button>
          </div>
        ) : null}

        {pastDecks && pastDecks.length > 0 ? (
          <div className="relative mt-4 border-t border-[var(--color-border)] pt-4">
            <span className="text-[11px] uppercase tracking-widest text-[var(--color-text-muted)]">
              Past decks
            </span>
            <div className="mt-2 flex flex-wrap gap-2">
              {pastDecks.slice(0, 8).map((d) => (
                <button
                  key={d.id}
                  type="button"
                  disabled={busy !== "idle"}
                  onClick={() => void reopenDeck(d.id)}
                  title="Reopen this deck in the editor — no API credits used"
                  className={ghostBtn}
                >
                  {d.report_type} · {d.period_from ?? "?"} → {d.period_to ?? "?"}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[10px] text-[var(--color-text-muted)]">
              Every generated deck is saved — reopen one to tweak and re-download without a fresh draft.
            </p>
          </div>
        ) : null}

        {/* ---------- No-credits workflow: draft in the Claude app ---------- */}
        <div className="relative mt-4 flex flex-wrap items-center gap-2.5 border-t border-[var(--color-border)] pt-4">
          <span className="text-[11px] uppercase tracking-widest text-[var(--color-text-muted)]">
            Claude app workflow
          </span>
          <button type="submit" name="prompt_only" value="1" disabled={busy !== "idle"} className={ghostBtn}>
            Export data + prompt
          </button>
          <button type="button" onClick={() => setImportOpen((o) => !o)} disabled={busy !== "idle"} className={ghostBtn}>
            Import deck JSON
          </button>
          {content ? (
            <button type="button" onClick={copyDeckJson} className={ghostBtn}>
              Copy deck JSON
            </button>
          ) : null}
          <p className="basis-full text-[10px] leading-relaxed text-[var(--color-text-muted)]">
            Draft on your Claude subscription instead of API credits: Export downloads the full data + prompt as a
            .txt — drop it into the Claude desktop app, then paste the JSON it returns into Import. Editing and
            downloading an imported deck uses zero API credits.
          </p>
        </div>
        {importOpen ? (
          <div className="relative mt-3 space-y-2">
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={6}
              placeholder={'Paste the JSON Claude returned — { ... } or a ```json block'}
              className="w-full rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-bg)] px-4 py-3 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40"
            />
            <button type="button" onClick={handleImport} disabled={!importText.trim()} className={ghostBtn}>
              Load draft
            </button>
          </div>
        ) : null}
      </section>

      {busy !== "idle" ? (
        <ProgressPanel
          mode={busy}
          hasEditedDeck={Boolean(content)}
          elapsed={elapsed}
          onCancel={() => {
            abortReasonRef.current = "cancel";
            abortRef.current?.abort();
          }}
        />
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 text-red-300 text-sm px-4 py-3 whitespace-pre-wrap">
          {error}
        </div>
      ) : null}
      {ok ? (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-200 text-sm px-4 py-3">
          {ok}
        </div>
      ) : null}

      {/* ---------- EDITING STUDIO ---------- */}
      {content ? (
        <section className="animate-studio-rise space-y-5">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold tracking-tight">Your deck</h2>
            <Pill tone="ok">Click any text to edit</Pill>
            <button
              type="button"
              onClick={undo}
              disabled={undoDepth === 0}
              title="Undo the last edit (inline, chat, or editor)"
              className="ml-auto rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-hover)] transition disabled:opacity-40 disabled:pointer-events-none"
            >
              ↩ Undo{undoDepth ? ` (${undoDepth})` : ""}
            </button>
            <button
              type="button"
              onClick={() => {
                setContent(null);
                setStyle({});
                discardSavedDraft();
              }}
              className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] underline"
            >
              Discard draft
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-3">
            <span className="text-[11px] uppercase tracking-widest text-[var(--color-text-muted)]">
              Deck style
            </span>
            {(
              [
                ["brand_primary", "Primary"],
                ["brand_secondary", "Accent"],
                ["brand_tertiary", "Tertiary"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                {label}
                <input
                  type="color"
                  value={style[key] ?? "#888888"}
                  onChange={(e) => setStyle((s) => ({ ...s, [key]: e.target.value }))}
                  className="h-7 w-9 cursor-pointer rounded border border-[var(--color-border)] bg-transparent"
                />
              </label>
            ))}
            {(
              [
                ["display_font", "Headings"],
                ["body_font", "Body"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                {label}
                <select
                  value={style[key] ?? ""}
                  onChange={(e) =>
                    setStyle((s) => ({ ...s, [key]: e.target.value || undefined }))
                  }
                  className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-xs"
                >
                  <option value="">Brand default</option>
                  {FONTS.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </label>
            ))}
            {Object.values(style).some(Boolean) ? (
              <button
                type="button"
                onClick={() => setStyle({})}
                className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] underline"
              >
                Reset
              </button>
            ) : null}
            <span className="basis-full text-[10px] text-[var(--color-text-muted)]">
              Overrides apply to the downloaded .pptx — colors and fonts on the slides themselves.
            </span>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-6 items-start">
            <DeckSlidePreviews content={content} onChange={setContent} logoUrl={logos?.[clientId] ?? null} />
            <DeckChat
              content={content}
              onChange={setContent}
              className="xl:sticky xl:top-4"
            />
          </div>

          <details
            className="border-t border-[var(--color-border)] pt-4"
            onKeyDown={(e) => {
              // The editor's bare <input>s live inside this <form>; without
              // this, Enter triggers implicit submission — i.e. a full,
              // multi-minute deck generation from a stray keystroke.
              if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
                e.preventDefault();
              }
            }}
          >
            <summary className="cursor-pointer text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
              Manual field editor (every field, plus image slides)
            </summary>
            <div className="mt-4">
              <MonthlyContentEditor content={content} onChange={setContent} />
            </div>
          </details>
        </section>
      ) : null}
    </form>
  );
}
