"use client";

// Client-side form for the monthly-report generator. Wraps a normal <form>
// submit with a fetch() → blob → programmatic download so the admin stays on
// /admin/reports while the browser dumps the .pptx (or the dry-run .json) into
// its Downloads.
//
// Deliberately minimal: one row — company + a segmented time-frame control —
// then Generate. Everything else the pipeline derives server-side: tier from
// clients.tier, brand colors/fonts from brand-configs.json + clients.branding,
// services and voice from the onboarding profile, qualitative context from
// Fieldy.

import { useState } from "react";
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

const RANGES = [
  { value: "7d", label: "7 days" },
  { value: "28d", label: "28 days" },
  { value: "90d", label: "90 days" },
  { value: "ytd", label: "YTD" },
  { value: "custom", label: "Custom" },
] as const;

const labelCls =
  "block text-[11px] uppercase tracking-widest text-[var(--color-text-muted)] mb-2";

export default function GenerateReportForm({ clients, defaultClientId }: Props) {
  const [busy, setBusy] = useState<"idle" | "generate" | "preview">("idle");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [range, setRange] = useState<string>("28d");
  // Synthesized (then admin-edited) deck content. Set by "Preview & edit";
  // when present, Generate renders exactly this instead of re-synthesizing.
  const [content, setContent] = useState<MonthlyContent | null>(null);

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
        setOk("Deck synthesized — review and edit every section below, then Generate.");
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get("content-disposition") ?? "";
      const m = cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
      const filename = m?.[1] ?? "monthly-report.pptx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      setOk(`Downloaded ${filename}${content ? " (from your edited content)" : ""}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("idle");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <input type="hidden" name="range" value={range} />

      <div className="flex flex-col gap-5 lg:flex-row lg:items-end">
        <div className="flex-1 min-w-0 lg:max-w-sm">
          <label className={labelCls}>Company</label>
          <select
            name="client_id"
            required
            defaultValue={defaultClientId}
            className="h-12 w-full rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-bg)] px-4 text-base font-medium focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40"
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.company_name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls}>Time frame</label>
          <div className="inline-flex h-12 items-center rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-bg)] p-1">
            {RANGES.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRange(r.value)}
                className={cn(
                  "h-full rounded-lg px-3.5 text-sm font-medium transition whitespace-nowrap",
                  range === r.value
                    ? "bg-[var(--color-accent)] text-[var(--color-on-accent)]"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]",
                )}
              >
                {r.label}
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
          Tier, brand, and context are pulled from the client&apos;s profile automatically.
        </p>
      </div>

      {content ? (
        <div className="border-t border-[var(--color-border)] pt-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="text-sm font-semibold">Deck preview</div>
            <Pill tone="ok">Editable</Pill>
            <button
              type="button"
              onClick={() => setContent(null)}
              className="ml-auto text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] underline"
            >
              Discard edits
            </button>
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">
            This is what the .pptx will say. Ask Claude to change anything — or open the manual
            editor below for field-by-field edits and image slides. Generate when it reads right.
          </p>

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-6 items-start">
            <DeckSlidePreviews content={content} />
            <DeckChat
              content={content}
              onChange={setContent}
              className="xl:sticky xl:top-4"
            />
          </div>

          <details className="border-t border-[var(--color-border)] pt-4">
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
