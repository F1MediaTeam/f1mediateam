"use client";

// Client-side form for the monthly-report generator. Wraps a normal <form>
// submit with a fetch() → blob → programmatic download so the admin stays on
// /admin/reports while the browser dumps the .pptx (or the dry-run .json) into
// its Downloads. The DOM-shape mirrors the previous server-rendered form so
// the on-brand styling is preserved.

import { useState } from "react";
import { Button, Pill } from "@/components/ui";
import FieldyPanelButton from "@/components/admin/FieldyPanelButton";
import MonthlyContentEditor from "@/components/admin/MonthlyContentEditor";
import type { MonthlyContent } from "@/lib/deck/f1-monthly/deck-builder";
import type { Client } from "@/lib/types";

interface Props {
  clients: Client[];
  defaultClientId: string;
  defaultTier: "1" | "2" | "3";
}

const fieldCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40";
const labelCls = "block text-[11px] uppercase tracking-widest text-[var(--color-text-muted)] mb-1.5";

export default function GenerateReportForm({ clients, defaultClientId, defaultTier }: Props) {
  const [busy, setBusy] = useState<"idle" | "generate" | "preview">("idle");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Company</label>
          <select name="client_id" required defaultValue={defaultClientId} className={fieldCls}>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.company_name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Time frame</label>
          <select name="range" defaultValue="28d" className={fieldCls}>
            <option value="7d">Last 7 days</option>
            <option value="28d">Last 28 days</option>
            <option value="90d">Last 90 days</option>
            <option value="ytd">Year to date</option>
            <option value="custom">Custom range…</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Custom from</label>
          <input type="date" name="from" className={fieldCls} />
        </div>
        <div>
          <label className={labelCls}>Custom to</label>
          <input type="date" name="to" className={fieldCls} />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Tier</label>
          <select name="tier" defaultValue={defaultTier} className={fieldCls}>
            <option value="1">1 — Foundation Visibility (10 slides)</option>
            <option value="2">2 — Growth &amp; Authority (11)</option>
            <option value="3">3 — Market Domination (12)</option>
          </select>
          <p className="mt-1 text-[10px] text-[var(--color-text-subtle)]">
            Auto-set from the client&apos;s profile — override here for a one-off run.
          </p>
        </div>
        <div>
          <label className={labelCls}>Brand key</label>
          <input
            type="text"
            name="brand_key"
            placeholder="bucketsofink, precisiongraphics, skabelund, f1, default…"
            className={fieldCls}
          />
          <p className="mt-1 text-[10px] text-[var(--color-text-subtle)]">
            Looks up colors + fonts in <code>brand-configs.json</code>. Leave blank to derive from the company name.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Industry</label>
          <input type="text" name="industry" placeholder="DTF &amp; Embroidery Supplies / E-Commerce" className={fieldCls} />
        </div>
        <div>
          <label className={labelCls}>Services</label>
          <input type="text" name="services" placeholder="SEO, Web Dev, Backlink Management" className={fieldCls} />
        </div>
      </div>
      <details className="text-xs text-[var(--color-text-muted)] border-t border-[var(--color-border)] pt-4">
        <summary className="cursor-pointer">Brand overrides (optional — beats brand_key)</summary>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>Primary</label>
            <input type="color" name="brand_primary" className="h-[42px] w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]" />
          </div>
          <div>
            <label className={labelCls}>Secondary</label>
            <input type="color" name="brand_secondary" className="h-[42px] w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]" />
          </div>
          <div>
            <label className={labelCls}>Tertiary</label>
            <input type="color" name="brand_tertiary" className="h-[42px] w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]" />
          </div>
          <div className="md:col-span-3">
            <label className={labelCls}>Logo URL</label>
            <input type="url" name="logo_url" placeholder="https://…/logo.png" className={fieldCls} />
          </div>
        </div>
      </details>

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

      <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-end pt-2">
        <FieldyPanelButton />
        <Button
          type="submit"
          name="dryrun"
          value="1"
          variant="secondary"
          className="px-6"
          disabled={busy !== "idle"}
        >
          {busy === "preview" ? "Synthesizing…" : content ? "Re-synthesize" : "Preview & edit"}
        </Button>
        <Button
          type="submit"
          className="px-8"
          disabled={busy !== "idle"}
        >
          {busy === "generate" ? "Generating…" : content ? "Generate .pptx (edited)" : "Generate .pptx"}
        </Button>
      </div>

      {content ? (
        <div className="border-t border-[var(--color-border)] pt-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="text-sm font-semibold">Deck content</div>
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
            This is exactly what the .pptx will say — every field below is editable, and image
            slides you add render after the charts. Generate when it reads right.
          </p>
          <MonthlyContentEditor content={content} onChange={setContent} />
        </div>
      ) : null}
    </form>
  );
}
