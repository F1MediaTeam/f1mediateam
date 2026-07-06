"use client";

// Slide previews of the synthesized MonthlyContent, shown on /admin/reports
// after "Preview & edit". One full-width page per slide, stacked vertically —
// read it top to bottom like a document. Every text element, including the
// numbers, is click-to-edit in place (Google-Slides style): click, type, blur
// or Enter to commit, Escape to revert. Clearing a row's main text deletes
// the row (so does the × that appears on hover). Edits write straight back
// into the content object, so Generate renders exactly what's on screen.

import { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { MonthlyContent } from "@/lib/deck/f1-monthly/deck-builder";

type Path = (string | number)[];
type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
type EditFn = (path: Path, value: string | number) => void;
type RemoveFn = (arrayPath: Path, index: number) => void;

function setAtPath(root: Json, path: Path, value: Json): Json {
  if (path.length === 0) return value;
  const [head, ...rest] = path;
  if (Array.isArray(root)) {
    const next = root.slice();
    next[head as number] = setAtPath(next[head as number] ?? null, rest, value);
    return next;
  }
  const obj = { ...(root as { [k: string]: Json }) };
  obj[head as string] = setAtPath(obj[head as string] ?? null, rest, value);
  return obj;
}

function removeAtPath(root: Json, arrayPath: Path, index: number): Json {
  const readArray = (node: Json, path: Path): Json[] => {
    let cur: Json = node;
    for (const key of path) cur = (cur as { [k: string]: Json })?.[key as string] ?? null;
    return Array.isArray(cur) ? cur : [];
  };
  const arr = readArray(root, arrayPath);
  return setAtPath(root, arrayPath, arr.filter((_, i) => i !== index));
}

// Reads what the user actually sees: innerText preserves line breaks that
// textContent would silently fuse ("line one" + <br> + "line two" must not
// commit as "line oneline two").
function readText(el: HTMLElement): string {
  return (el.innerText ?? "").replace(/\u00a0/g, " ").replace(/\s+$/, "").replace(/^\s+/, "");
}

// Inline-editable text. The DOM content is managed via a ref (not React
// children): external updates (Claude chat, manual editor) sync in whenever
// the element ISN'T focused, and an in-progress edit is never clobbered.
function EditableText({
  value,
  onCommit,
  className,
  multiline = false,
}: {
  value: string;
  onCommit?: (v: string) => void;
  className?: string;
  multiline?: boolean;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !onCommit) return;
    if (document.activeElement === el) return; // user is mid-edit
    if (readText(el) !== value) el.textContent = value;
  });

  if (!onCommit) return <span className={className}>{value}</span>;
  return (
    <span
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      onBlur={(e) => {
        const t = readText(e.currentTarget);
        if (t !== value) onCommit(t);
      }}
      onPaste={(e) => {
        // Plain text only — a rich paste from Docs/Word would inject HTML.
        e.preventDefault();
        document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
      }}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === "Enter") {
          e.preventDefault();
          if (multiline) document.execCommand("insertLineBreak");
          else e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          e.currentTarget.textContent = value;
          e.currentTarget.blur();
        }
      }}
      className={cn(
        "cursor-text rounded-sm outline-none transition hover:bg-white/[0.06] focus:bg-white/[0.08] focus:ring-1 focus:ring-[var(--color-accent)]/60",
        multiline && "whitespace-pre-line",
        className,
      )}
    />
  );
}

// Editable number — commits a real number back into the content object.
// Non-numeric input normalizes to 0 (the deck renders 0 positions as "—").
function EditableNum({
  value,
  onCommit,
  className,
}: {
  value: number | null | undefined;
  onCommit?: (v: number) => void;
  className?: string;
}) {
  return (
    <EditableText
      value={value != null ? String(value) : ""}
      onCommit={
        onCommit
          ? (v) => {
              const n = Number(v.replace(/[^\d.-]/g, ""));
              onCommit(Number.isFinite(n) ? n : 0);
            }
          : undefined
      }
      className={cn("tabular-nums", className)}
    />
  );
}

// Ghost delete button, revealed when hovering its row (group/row) or the
// slide header (group). mousedown is swallowed so clicking it doesn't blur-
// commit a neighboring editable span first.
function RemoveBtn({ onClick, title = "Delete" }: { onClick?: () => void; title?: string }) {
  if (!onClick) return null;
  return (
    <button
      type="button"
      tabIndex={-1}
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-sm leading-none text-[var(--color-text-muted)] opacity-0 transition group-hover/row:opacity-100 hover:bg-red-500/15 hover:text-red-300"
    >
      ×
    </button>
  );
}

function Sparkline({ values, height = 80 }: { values: number[]; height?: number }) {
  if (values.length < 2) return null;
  const w = 440;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(height - ((v - min) / span) * height).toFixed(1)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full h-24" preserveAspectRatio="none">
      <polyline
        points={pts}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function MiniBars({ series }: { series: number[] }) {
  const max = Math.max(...series, 1);
  return (
    <div className="flex items-end gap-1.5 h-24">
      {series.slice(0, 24).map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm bg-[var(--color-accent)]/70"
          style={{ height: `${Math.max(4, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

function Bullets({
  items,
  basePath,
  edit,
  removeItem,
}: {
  items?: string[] | null;
  basePath: Path;
  edit?: EditFn;
  removeItem?: RemoveFn;
}) {
  const list = (items ?? []).map((w, i) => ({ w, i })).filter(({ w }) => Boolean(w));
  if (!list.length) return null;
  return (
    <ul className="space-y-2.5">
      {list.map(({ w, i }) => (
        <li key={i} className="group/row flex items-start gap-2.5 text-[15px] leading-relaxed">
          <span className="text-[var(--color-accent)] shrink-0 mt-px">›</span>
          <EditableText
            value={w}
            onCommit={
              edit
                ? (v) =>
                    // Clearing a bullet deletes it — a committed "" would
                    // otherwise render as a blank bullet in the .pptx.
                    v.trim() === "" && removeItem ? removeItem(basePath, i) : edit([...basePath, i], v)
                : undefined
            }
            className="flex-1"
            multiline
          />
          <RemoveBtn onClick={removeItem ? () => removeItem(basePath, i) : undefined} />
        </li>
      ))}
    </ul>
  );
}

// Stat tile with editable value + prior. Clearing the value removes the tile
// (both here and in the rendered .pptx, which filters empty stats).
function StatTile({
  label,
  value,
  prior,
  valuePath,
  priorPath,
  edit,
}: {
  label: string;
  value?: string;
  prior?: string | null;
  valuePath: Path;
  priorPath?: Path;
  edit?: EditFn;
}) {
  if (!value) return null;
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-white/[0.03] px-4 py-3.5">
      <div className="text-[11px] uppercase tracking-wider text-[var(--color-text-muted)]">{label}</div>
      <div className="mt-1 text-3xl font-semibold tabular-nums leading-tight">
        <EditableText value={value} onCommit={edit ? (v) => edit(valuePath, v) : undefined} />
      </div>
      {prior != null && priorPath ? (
        <div className="mt-1 text-xs text-[var(--color-text-muted)] tabular-nums">
          prev <EditableText value={prior} onCommit={edit ? (v) => edit(priorPath, v) : undefined} />
        </div>
      ) : null}
    </div>
  );
}

const noteCls = "text-sm leading-relaxed text-[var(--color-text-muted)]";
const rowCls = "group/row flex items-center gap-3 text-[15px]";

interface SlideDef {
  label: string;
  body: React.ReactNode;
  center?: boolean;
  onRemove?: () => void;
}

function buildSlides(c: MonthlyContent, edit?: EditFn, removeItem?: RemoveFn): SlideDef[] {
  const slides: SlideDef[] = [];

  slides.push({
    label: "Cover",
    center: true,
    body: (
      <div className="flex flex-col items-center justify-center text-center gap-4">
        <div className="text-xs uppercase tracking-[0.3em] text-[var(--color-accent)]">
          F1 Media · Performance Report
        </div>
        <div className="text-4xl sm:text-5xl font-semibold leading-tight">
          <EditableText
            value={c.client ?? "Client"}
            onCommit={edit ? (v) => edit(["client"], v) : undefined}
          />
        </div>
        <div className="text-base text-[var(--color-text-muted)]">Performance Review</div>
        {c.reportPeriod ? (
          <div className="mt-2 rounded-full border border-[var(--color-border)] px-4 py-1.5 text-sm tabular-nums text-[var(--color-text-muted)]">
            {c.reportPeriod}
          </div>
        ) : null}
      </div>
    ),
  });

  if (c.executiveSummary) {
    slides.push({
      label: "Executive summary",
      body: (
        <div className="space-y-5">
          {c.executiveSummary.intro ? (
            <p className="text-base leading-relaxed text-[var(--color-text-muted)]">
              <EditableText
                value={c.executiveSummary.intro}
                onCommit={edit ? (v) => edit(["executiveSummary", "intro"], v) : undefined}
                multiline
              />
            </p>
          ) : null}
          <Bullets items={c.executiveSummary.wins} basePath={["executiveSummary", "wins"]} edit={edit} removeItem={removeItem} />
        </div>
      ),
    });
  }

  const kwRows = c.keywordRankings?.rows ?? [];
  if (kwRows.length) {
    slides.push({
      label: "Keyword rankings",
      body: (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3 pb-1 text-[11px] uppercase tracking-wider text-[var(--color-text-muted)]">
              <span className="flex-1">Keyword</span>
              <span className="w-14 text-right">{c.keywordRankings?.priorLabel || "Prior"}</span>
              <span className="w-4" />
              <span className="w-14 text-right">{c.keywordRankings?.currentLabel || "Current"}</span>
              <span className="w-6" />
            </div>
            {kwRows.map((r, i) => (
              <div key={i} className={cn(rowCls, "border-b border-[var(--color-border)]/50 pb-1.5")}>
                <EditableText
                  value={r.keyword}
                  onCommit={
                    edit
                      ? (v) =>
                          v.trim() === "" && removeItem
                            ? removeItem(["keywordRankings", "rows"], i)
                            : edit(["keywordRankings", "rows", i, "keyword"], v)
                      : undefined
                  }
                  className="flex-1"
                />
                <EditableNum
                  value={r.prior}
                  onCommit={edit ? (v) => edit(["keywordRankings", "rows", i, "prior"], v) : undefined}
                  className="w-14 text-right text-[var(--color-text-muted)]"
                />
                <span className="w-4 text-center text-[var(--color-text-muted)]">→</span>
                <EditableNum
                  value={r.current}
                  onCommit={edit ? (v) => edit(["keywordRankings", "rows", i, "current"], v) : undefined}
                  className={cn(
                    "w-14 text-right font-semibold",
                    r.current <= r.prior && "text-[var(--color-accent)]",
                  )}
                />
                <RemoveBtn onClick={removeItem ? () => removeItem(["keywordRankings", "rows"], i) : undefined} />
              </div>
            ))}
          </div>
          {c.keywordRankings?.note ? (
            <p className={noteCls}>
              <EditableText
                value={c.keywordRankings.note}
                onCommit={edit ? (v) => edit(["keywordRankings", "note"], v) : undefined}
                multiline
              />
            </p>
          ) : null}
        </div>
      ),
    });
  }

  if (c.competitiveSnapshot) {
    slides.push({
      label: "Competitive snapshot",
      body: (
        <div className="space-y-4">
          <div className="space-y-1.5">
            {(c.competitiveSnapshot.competitors ?? []).map((comp, i) => (
              <div key={i} className={cn(rowCls, "border-b border-[var(--color-border)]/50 pb-1.5")}>
                <EditableText
                  value={comp.domain}
                  onCommit={
                    edit
                      ? (v) =>
                          v.trim() === "" && removeItem
                            ? removeItem(["competitiveSnapshot", "competitors"], i)
                            : edit(["competitiveSnapshot", "competitors", i, "domain"], v)
                      : undefined
                  }
                  className="flex-1"
                />
                <EditableText
                  value={comp.position}
                  onCommit={edit ? (v) => edit(["competitiveSnapshot", "competitors", i, "position"], v) : undefined}
                  className="tabular-nums text-[var(--color-text-muted)]"
                />
                <RemoveBtn
                  onClick={removeItem ? () => removeItem(["competitiveSnapshot", "competitors"], i) : undefined}
                />
              </div>
            ))}
          </div>
          {c.competitiveSnapshot.closing ? (
            <p className={noteCls}>
              <EditableText
                value={c.competitiveSnapshot.closing}
                onCommit={edit ? (v) => edit(["competitiveSnapshot", "closing"], v) : undefined}
                multiline
              />
            </p>
          ) : null}
        </div>
      ),
    });
  }

  if (c.organicTraffic) {
    const t = c.organicTraffic;
    slides.push({
      label: "Organic traffic",
      body: (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile label="Clicks" value={t.clicks?.value} prior={t.clicks?.prior} valuePath={["organicTraffic", "clicks", "value"]} priorPath={["organicTraffic", "clicks", "prior"]} edit={edit} />
            <StatTile label="Impressions" value={t.impressions?.value} prior={t.impressions?.prior} valuePath={["organicTraffic", "impressions", "value"]} priorPath={["organicTraffic", "impressions", "prior"]} edit={edit} />
            <StatTile label="CTR" value={t.ctr?.value} valuePath={["organicTraffic", "ctr", "value"]} edit={edit} />
            <StatTile label="Avg position" value={t.avgPosition?.value} valuePath={["organicTraffic", "avgPosition", "value"]} edit={edit} />
          </div>
          {t.note ? (
            <p className={noteCls}>
              <EditableText
                value={t.note}
                onCommit={edit ? (v) => edit(["organicTraffic", "note"], v) : undefined}
                multiline
              />
            </p>
          ) : null}
          {t.trend?.clicks?.length ? <Sparkline values={t.trend.clicks} /> : null}
        </div>
      ),
    });
  }

  if (c.crossChannelAi) {
    slides.push({
      label: "Cross-channel & AI",
      body: (
        <div className="space-y-4">
          <div className="space-y-1.5">
            {(c.crossChannelAi.channels ?? []).map((ch, i) => (
              <div key={i} className={cn(rowCls, "border-b border-[var(--color-border)]/50 pb-1.5")}>
                <EditableText
                  value={ch.name}
                  onCommit={
                    edit
                      ? (v) =>
                          v.trim() === "" && removeItem
                            ? removeItem(["crossChannelAi", "channels"], i)
                            : edit(["crossChannelAi", "channels", i, "name"], v)
                      : undefined
                  }
                  className="flex-1"
                />
                <EditableText
                  value={ch.metric}
                  onCommit={edit ? (v) => edit(["crossChannelAi", "channels", i, "metric"], v) : undefined}
                  className="tabular-nums text-[var(--color-text-muted)]"
                />
                <RemoveBtn onClick={removeItem ? () => removeItem(["crossChannelAi", "channels"], i) : undefined} />
              </div>
            ))}
          </div>
          <Bullets items={c.crossChannelAi.aiVisibility} basePath={["crossChannelAi", "aiVisibility"]} edit={edit} removeItem={removeItem} />
        </div>
      ),
    });
  }

  if (c.contentInsights) {
    slides.push({
      label: "Content insights",
      body: (
        <div className="space-y-5">
          <Bullets items={c.contentInsights.pagesCreated} basePath={["contentInsights", "pagesCreated"]} edit={edit} removeItem={removeItem} />
          <Bullets items={c.contentInsights.pagesOptimized} basePath={["contentInsights", "pagesOptimized"]} edit={edit} removeItem={removeItem} />
          {c.contentInsights.linking ? (
            <p className={noteCls}>
              <EditableText
                value={c.contentInsights.linking}
                onCommit={edit ? (v) => edit(["contentInsights", "linking"], v) : undefined}
                multiline
              />
            </p>
          ) : null}
        </div>
      ),
    });
  }

  if (c.photoBacklink) {
    slides.push({
      label: "Photos & backlinks",
      body: (
        <div className="space-y-5">
          <Bullets items={c.photoBacklink.refreshes} basePath={["photoBacklink", "refreshes"]} edit={edit} removeItem={removeItem} />
          {c.photoBacklink.backlinksBuilt ? (
            <p className="text-[15px] leading-relaxed">
              <EditableText
                value={c.photoBacklink.backlinksBuilt}
                onCommit={edit ? (v) => edit(["photoBacklink", "backlinksBuilt"], v) : undefined}
                multiline
              />
            </p>
          ) : null}
          {c.photoBacklink.toxicRemoved ? (
            <p className={noteCls}>
              <EditableText
                value={c.photoBacklink.toxicRemoved}
                onCommit={edit ? (v) => edit(["photoBacklink", "toxicRemoved"], v) : undefined}
                multiline
              />
            </p>
          ) : null}
        </div>
      ),
    });
  }

  if (c.postingSocial) {
    slides.push({
      label: "Posting & social",
      body: (
        <div className="space-y-5">
          {c.postingSocial.flyers ? (
            <p className="text-[15px] leading-relaxed">
              <EditableText
                value={c.postingSocial.flyers}
                onCommit={edit ? (v) => edit(["postingSocial", "flyers"], v) : undefined}
                multiline
              />
            </p>
          ) : null}
          <Bullets items={c.postingSocial.channels} basePath={["postingSocial", "channels"]} edit={edit} removeItem={removeItem} />
          {c.postingSocial.youtube ? (
            <p className={noteCls}>
              <EditableText
                value={c.postingSocial.youtube}
                onCommit={edit ? (v) => edit(["postingSocial", "youtube"], v) : undefined}
                multiline
              />
            </p>
          ) : null}
        </div>
      ),
    });
  }

  const topPages = c.rankingDetail?.topPages ?? [];
  if (topPages.length || c.rankingDetail?.aiOverview) {
    slides.push({
      label: "Ranking detail",
      body: (
        <div className="space-y-4">
          <div className="space-y-1.5">
            {topPages.map((p, i) => (
              <div key={i} className={cn(rowCls, "text-sm border-b border-[var(--color-border)]/50 pb-1.5")}>
                <EditableText
                  value={p.url}
                  onCommit={
                    edit
                      ? (v) =>
                          v.trim() === "" && removeItem
                            ? removeItem(["rankingDetail", "topPages"], i)
                            : edit(["rankingDetail", "topPages", i, "url"], v)
                      : undefined
                  }
                  className="flex-1 break-all text-[var(--color-text-muted)]"
                />
                {p.clicks != null ? (
                  <EditableNum
                    value={p.clicks}
                    onCommit={edit ? (v) => edit(["rankingDetail", "topPages", i, "clicks"], v) : undefined}
                  />
                ) : null}
                <RemoveBtn onClick={removeItem ? () => removeItem(["rankingDetail", "topPages"], i) : undefined} />
              </div>
            ))}
          </div>
          {c.rankingDetail?.aiOverview ? (
            <p className={noteCls}>
              <EditableText
                value={c.rankingDetail.aiOverview}
                onCommit={edit ? (v) => edit(["rankingDetail", "aiOverview"], v) : undefined}
                multiline
              />
            </p>
          ) : null}
        </div>
      ),
    });
  }

  for (const [ci, chart] of (c.charts ?? []).entries()) {
    const first = chart.series?.[0]?.values ?? [];
    slides.push({
      label: chart.title || "Chart",
      onRemove: removeItem ? () => removeItem(["charts"], ci) : undefined,
      body: (
        <div className="flex h-full flex-col justify-center gap-4">
          <div className="text-lg font-medium">
            <EditableText
              value={chart.title}
              onCommit={edit ? (v) => edit(["charts", ci, "title"], v) : undefined}
            />
          </div>
          {chart.type === "bar" ? <MiniBars series={first} /> : <Sparkline values={first} height={96} />}
          <div className="text-sm text-[var(--color-text-muted)]">
            {(chart.series ?? []).map((s, si) => (
              <span key={si}>
                {si > 0 ? " · " : ""}
                <EditableText
                  value={s.name}
                  onCommit={edit ? (v) => edit(["charts", ci, "series", si, "name"], v) : undefined}
                />
              </span>
            ))}
            {chart.source ? ` — ${chart.source}` : ""}
          </div>
        </div>
      ),
    });
  }

  for (const [i, img] of (c.images ?? []).entries()) {
    slides.push({
      label: img.title || `Image ${i + 1}`,
      center: true,
      onRemove: removeItem ? () => removeItem(["images"], i) : undefined,
      body: (
        <div className="flex flex-col items-center justify-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img.data} alt="" className="max-h-72 max-w-full rounded-lg object-contain" />
          <div className="text-sm text-[var(--color-text-muted)]">
            <EditableText
              value={img.caption ?? ""}
              onCommit={edit ? (v) => edit(["images", i, "caption"], v) : undefined}
            />
          </div>
        </div>
      ),
    });
  }

  if (c.whatsNext?.length) {
    slides.push({
      label: "What's next",
      body: <Bullets items={c.whatsNext} basePath={["whatsNext"]} edit={edit} removeItem={removeItem} />,
    });
  }

  if (c.questions) {
    slides.push({
      label: "Questions",
      center: true,
      body: (
        <div className="flex flex-col items-center justify-center text-center gap-3">
          <div className="text-3xl font-semibold">
            <EditableText
              value={c.questions.prompt ?? "Questions?"}
              onCommit={edit ? (v) => edit(["questions", "prompt"], v) : undefined}
            />
          </div>
          {c.questions.contact ? (
            <div className="text-sm text-[var(--color-text-muted)]">
              <EditableText
                value={c.questions.contact}
                onCommit={edit ? (v) => edit(["questions", "contact"], v) : undefined}
              />
            </div>
          ) : null}
        </div>
      ),
    });
  }

  return slides;
}

export default function DeckSlidePreviews({
  content,
  onChange,
}: {
  content: MonthlyContent;
  onChange?: (content: MonthlyContent) => void;
}) {
  const edit: EditFn | undefined = onChange
    ? (path, value) => onChange(setAtPath(content as unknown as Json, path, value) as unknown as MonthlyContent)
    : undefined;
  const removeItem: RemoveFn | undefined = onChange
    ? (arrayPath, index) =>
        onChange(removeAtPath(content as unknown as Json, arrayPath, index) as unknown as MonthlyContent)
    : undefined;
  const slides = buildSlides(content, edit, removeItem);
  return (
    <div className="space-y-4">
      {onChange ? (
        <p className="text-xs text-[var(--color-text-muted)]">
          Click anything on a slide to edit it — text and numbers alike. Enter or click away to
          save, Esc to cancel. Clear a line (or hit its ×) to delete it.
        </p>
      ) : null}
      <div className="space-y-8">
        {slides.map((s, i) => (
          <div
            key={`${s.label}-${i}`}
            className="group rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elev)] overflow-hidden shadow-xl shadow-black/25 transition duration-200 hover:border-[var(--color-accent)]/40"
          >
            <div className="flex items-center gap-2.5 border-b border-[var(--color-border)] bg-gradient-to-r from-[var(--color-accent)]/[0.08] to-transparent px-4 py-2">
              <span className="rounded bg-[var(--color-accent)]/15 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-[var(--color-accent)]">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="text-[11px] uppercase tracking-wider text-[var(--color-text-muted)]">
                {s.label}
              </span>
              <span className="ml-auto text-[10px] uppercase tracking-wider text-[var(--color-accent)] opacity-0 transition group-hover:opacity-100">
                editable
              </span>
              {s.onRemove ? (
                <button
                  type="button"
                  onClick={s.onRemove}
                  title="Remove this slide"
                  className="grid h-6 w-6 place-items-center rounded-md text-sm leading-none text-[var(--color-text-muted)] opacity-0 transition group-hover:opacity-100 hover:bg-red-500/15 hover:text-red-300"
                >
                  ×
                </button>
              ) : null}
            </div>
            <div
              className={cn(
                "min-h-[420px] p-6 sm:p-10",
                s.center && "grid place-items-center",
              )}
            >
              {s.body}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
