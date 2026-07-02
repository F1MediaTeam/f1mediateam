"use client";

// Client-side form for the report generator. Wraps a normal <form> submit
// with a fetch() → blob → programmatic download so the admin stays on
// /admin/reports while the browser dumps the .pptx (or the dry-run .json)
// into its Downloads.
//
// Flow: pick company + meeting type (+ optional focus notes) → the readiness
// chips show exactly which data sources will feed Claude → Preview & edit
// synthesizes the deck → slides render as cards (click any text to edit
// in place), the Claude chat applies bigger changes (with screenshot
// support), the style bar overrides brand colors/fonts → Generate renders
// exactly what's on screen and downloads it.
//
// Everything else is derived server-side: tier from clients.tier, brand from
// brand-configs.json + clients.branding, services/voice from onboarding,
// meeting context from Fieldy.

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Button, Pill } from "@/components/ui";
import FieldyPanelButton from "@/components/admin/FieldyPanelButton";
import DateRangePicker from "@/components/admin/DateRangePicker";
import DeckSlidePreviews from "@/components/admin/DeckSlidePreviews";
import DeckChat from "@/components/admin/DeckChat";
import MonthlyContentEditor from "@/components/admin/MonthlyContentEditor";
import type { MonthlyContent } from "@/lib/deck/f1-monthly/deck-builder";
import type { Client } from "@/lib/types";

interface Props {
  clients: Client[];
  defaultClientId: string;
}

const MEETING_TYPES = [
  { value: "weekly", label: "Weekly", range: "7d" },
  { value: "monthly", label: "Monthly", range: "28d" },
  { value: "quarterly", label: "Quarterly", range: "90d" },
  { value: "yearly", label: "Yearly", range: "12m" },
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

const labelCls =
  "block text-[11px] uppercase tracking-widest text-[var(--color-text-muted)] mb-2";

export default function GenerateReportForm({ clients, defaultClientId }: Props) {
  const [busy, setBusy] = useState<"idle" | "generate" | "preview">("idle");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [clientId, setClientId] = useState(defaultClientId);
  const [meetingType, setMeetingType] = useState<string>("monthly");
  const [readiness, setReadiness] = useState<{ clientId: string; sources: SourceStatus[] } | null>(null);
  const [style, setStyle] = useState<DeckStyle>({});
  // Synthesized (then admin-edited) deck content. Set by "Preview & edit";
  // when present, Generate renders exactly this instead of re-synthesizing.
  const [content, setContent] = useState<MonthlyContent | null>(null);

  const range = MEETING_TYPES.find((t) => t.value === meetingType)?.range ?? "28d";

  // Data-readiness chips for the selected client. Stored with the client id
  // it was fetched for, so switching clients hides stale chips without a
  // synchronous reset in the effect.
  useEffect(() => {
    let stale = false;
    if (!clientId) return;
    fetch(`/api/report-readiness/${clientId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { sources?: SourceStatus[] } | null) => {
        if (!stale && json?.sources) setReadiness({ clientId, sources: json.sources });
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [clientId]);
  const sources = readiness?.clientId === clientId ? readiness.sources : null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setOk(null);
    const form = e.currentTarget;
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const isPreview = submitter?.getAttribute("name") === "dryrun";
    const fd = new FormData(form);
    if (range === "custom" && (!fd.get("from") || !fd.get("to"))) {
      setError("Pick a start and end date for the custom range.");
      return;
    }
    if (isPreview) fd.set("dryrun", "1");
    else if (content) fd.set("content_json", JSON.stringify(content));
    setBusy(isPreview ? "preview" : "generate");
    try {
      const res = await fetch("/api/monthly-report", { method: "POST", body: fd });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      if (isPreview) {
        const json = (await res.json()) as { content: MonthlyContent };
        setContent(json.content);
        setOk("Deck synthesized — click any slide text to edit, or ask Claude below.");
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
      setOk(`Downloaded ${filename}${content ? " (from your edited deck)" : ""}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("idle");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <input type="hidden" name="range" value={range} />
      <input type="hidden" name="report_type" value={meetingType} />
      {/* Style overrides only ride along while the deck they were chosen for
          is on screen — never silently into a fresh synthesis. */}
      {content
        ? Object.entries(style).map(([k, v]) =>
            v ? <input key={k} type="hidden" name={k} value={v} /> : null,
          )
        : null}

      <div className="flex flex-col gap-5 lg:flex-row lg:items-end">
        <div className="flex-1 min-w-0 lg:max-w-sm">
          <label className={labelCls}>Company</label>
          <select
            name="client_id"
            required
            value={clientId}
            onChange={(e) => {
              setClientId(e.target.value);
              // A previewed deck belongs to the client it was built for.
              setContent(null);
              setStyle({});
            }}
            className="h-12 w-full rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-bg)] px-4 text-base font-medium focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40"
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.company_name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls}>Meeting type</label>
          <div className="inline-flex h-12 items-center rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-bg)] p-1">
            {MEETING_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => {
                  setMeetingType(t.value);
                  // The previewed deck was synthesized for the old window.
                  if (t.value !== meetingType) setContent(null);
                }}
                className={cn(
                  "h-full rounded-lg px-3.5 text-sm font-medium transition whitespace-nowrap",
                  meetingType === t.value
                    ? "bg-[var(--color-accent)] text-[var(--color-on-accent)]"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <Button
          type="submit"
          className="h-12 px-8 text-base lg:ml-auto"
          disabled={busy !== "idle"}
        >
          {busy === "generate" ? "Generating…" : content ? "Generate .pptx (edited)" : "Generate .pptx"}
        </Button>
      </div>

      {range === "custom" ? (
        <div>
          <label className={labelCls}>Custom range</label>
          <DateRangePicker fromName="from" toName="to" />
        </div>
      ) : null}

      {sources ? (
        <div>
          <label className={labelCls}>What Claude will build from</label>
          <div className="flex flex-wrap gap-2">
            {sources.map((s) => (
              <span
                key={s.key}
                title={s.detail}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px]",
                  s.ok
                    ? "border-[var(--color-accent)]/40 text-[var(--color-accent)] bg-[var(--color-accent)]/10"
                    : "border-[var(--color-border)] text-[var(--color-text-muted)]",
                )}
              >
                <span className="font-medium">{s.ok ? "✓" : "—"}</span>
                {s.label}
                <span className={cn("hidden md:inline", s.ok ? "opacity-70" : "")}>· {s.detail}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <label className={labelCls}>Focus points for this meeting (optional — Claude weights these highly)</label>
        <textarea
          name="selected_notes"
          rows={2}
          placeholder="e.g. Spotlight the new service-area pages · client asked about AI visibility last call · keep it under 15 minutes"
          className="w-full rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-bg)] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40"
        />
      </div>

      {error ? (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 text-red-300 text-sm px-3 py-2 whitespace-pre-wrap">
          {error}
        </div>
      ) : null}
      {ok ? (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-200 text-sm px-3 py-2">
          {ok}
        </div>
      ) : null}

      <div className="flex items-center gap-3 border-t border-[var(--color-border)] pt-4">
        <FieldyPanelButton />
        <Button
          type="submit"
          name="dryrun"
          value="1"
          variant="secondary"
          disabled={busy !== "idle"}
        >
          {busy === "preview" ? "Synthesizing…" : content ? "Re-synthesize" : "Preview & edit"}
        </Button>
        <p className="ml-auto hidden md:block text-xs text-[var(--color-text-muted)]">
          Tier, brand, and context come from the client&apos;s profile automatically.
        </p>
      </div>

      {content ? (
        <div className="border-t border-[var(--color-border)] pt-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="text-sm font-semibold">Deck preview</div>
            <Pill tone="ok">Click to edit</Pill>
            <button
              type="button"
              onClick={() => {
                setContent(null);
                setStyle({});
              }}
              className="ml-auto text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] underline"
            >
              Discard edits
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-4 py-3">
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
              Overrides apply to the generated .pptx — colors and fonts on the slides themselves.
            </span>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-6 items-start">
            <DeckSlidePreviews content={content} onChange={setContent} />
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
        </div>
      ) : null}
    </form>
  );
}
