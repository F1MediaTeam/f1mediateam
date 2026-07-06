"use client";

// Slide previews of the synthesized MonthlyContent, shown on /admin/reports
// after "Preview & edit". One full-width page per slide, stacked vertically —
// read it top to bottom like a document. Every slide leads with its own
// headline (synthesis writes a data-specific takeaway into sectionTitles;
// click it to rewrite it — it prints on the .pptx slide too). Every text
// element, including the numbers, is click-to-edit in place: click, type,
// blur or Enter to commit, Escape to revert. Clearing a row's main text
// deletes the row (so does the × that appears on hover). Edits write straight
// back into the content object, so Generate renders exactly what's on screen.
//
// Charts follow the dataviz mark specs: 2px lines with ringed end-dots,
// ≤24px columns rounded only at the data end, hairline solid gridlines,
// clean-number y ticks, sparing direct labels, text in text tokens (never
// the series color). Series palette #2fa08f/#c98500/#9085e9 is validated
// (lightness band, chroma, CVD, contrast) against the dark surface #0d1117.
// Mixed-scale multi-series lines split into small multiples — never dual axes.

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

/* ------------------------------ charts ------------------------------ */

// Categorical slots validated against the dark chart surface (#0d1117):
// lightness band, chroma floor, CVD separation, and ≥3:1 contrast all pass.
// Color follows the series' position in the content object, never its rank.
const SERIES_COLORS = ["#2fa08f", "#c98500", "#9085e9"];
const seriesColor = (i: number) => SERIES_COLORS[i % SERIES_COLORS.length];
const SURFACE = "var(--color-bg-elev)"; // ring/gap color

function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${(n / 1e6).toFixed(abs >= 1e7 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(abs >= 1e4 ? 0 : 1).replace(/\.0$/, "")}K`;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// "2025-08" → "Aug '25" · "2026-06-09" → "Jun 9" · anything else truncated —
// long categorical labels never fight for space under a column chart (those
// charts render horizontally instead; this is the backstop).
function fmtTick(raw: string): string {
  const s = String(raw);
  const m = s.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (!m) return s.length > 12 ? `${s.slice(0, 11)}…` : s;
  const mon = MONTH_ABBR[Number(m[2]) - 1] ?? m[2];
  return m[3] ? `${mon} ${Number(m[3])}` : `${mon} '${m[1].slice(2)}`;
}

// Time-series labels get columns; anything else (domains, page names) reads
// better as horizontal bars with the label on its own line.
function isDateLike(labels: string[]): boolean {
  if (!labels.length) return false;
  return labels.filter((l) => /^\d{4}-\d{2}/.test(String(l))).length >= labels.length * 0.7;
}

// "2026-07-09 → 2026-07-17" → "July 9–17, 2026" (collapses shared month/year).
const MONTH_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function fmtPeriodPretty(period: string): string {
  const m = period.match(/(\d{4})-(\d{2})-(\d{2})\s*(?:→|to|-)\s*(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return period;
  const [, y1, mo1, d1, y2, mo2, d2] = m;
  const A = { y: +y1, mn: MONTH_FULL[+mo1 - 1], d: +d1 };
  const B = { y: +y2, mn: MONTH_FULL[+mo2 - 1], d: +d2 };
  if (A.y === B.y && A.mn === B.mn) return `${A.mn} ${A.d}–${B.d}, ${A.y}`;
  if (A.y === B.y) return `${A.mn} ${A.d} – ${B.mn} ${B.d}, ${A.y}`;
  return `${A.mn} ${A.d}, ${A.y} – ${B.mn} ${B.d}, ${B.y}`;
}

// Clean-number axis: 0 → a "nice" ceiling (1/2/2.5/5 × 10^k) in 4 steps.
function niceTicks(rawMax: number): number[] {
  const max = rawMax > 0 ? rawMax : 1;
  const steps = 4;
  const rough = max / steps;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s * steps >= max) ?? 10 * mag;
  return Array.from({ length: steps + 1 }, (_, i) => i * step);
}

// Evenly sampled label indices, always keeping the first and last.
function tickIndices(n: number, want: number): number[] {
  if (n <= want) return Array.from({ length: n }, (_, i) => i);
  const idx = new Set<number>();
  for (let i = 0; i < want; i++) idx.add(Math.round((i * (n - 1)) / (want - 1)));
  return [...idx].sort((a, b) => a - b);
}

interface SeriesDef {
  name: string;
  values: number[];
  colorIndex: number;
}

const CHART_W = 680;
const AXIS_LEFT = 48;
const AXIS_BOTTOM = 24;
const AXIS_TOP = 12;

// Shared frame: hairline solid gridlines one step off the surface, muted
// clean-number y ticks, sampled x labels. Text wears text tokens only.
function ChartFrame({
  height,
  ticks,
  labels,
  labelIdx,
  x,
  children,
}: {
  height: number;
  ticks: number[];
  labels: string[];
  labelIdx: number[];
  x: (i: number) => number;
  children: React.ReactNode;
}) {
  const innerH = height - AXIS_TOP - AXIS_BOTTOM;
  const yMax = ticks[ticks.length - 1] || 1;
  const y = (v: number) => AXIS_TOP + innerH - (v / yMax) * innerH;
  return (
    <svg viewBox={`0 0 ${CHART_W} ${height}`} className="w-full" role="img">
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={AXIS_LEFT}
            x2={CHART_W - 8}
            y1={y(t)}
            y2={y(t)}
            stroke="var(--color-border)"
            strokeWidth="1"
          />
          <text
            x={AXIS_LEFT - 8}
            y={y(t) + 3.5}
            textAnchor="end"
            fontSize="10.5"
            fill="var(--color-text-muted)"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {fmtNum(t)}
          </text>
        </g>
      ))}
      {labelIdx.map((i) => (
        <text
          key={i}
          x={x(i)}
          y={height - 7}
          textAnchor="middle"
          fontSize="10.5"
          fill="var(--color-text-muted)"
        >
          {fmtTick(labels[i] ?? String(i + 1))}
        </text>
      ))}
      {children}
    </svg>
  );
}

// Multi-series line chart: 2px round-joined lines, end dot with a 2px
// surface ring, end value in ink (identity comes from the legend beside it).
function LineChart({
  labels,
  series,
  height = 240,
}: {
  labels: string[];
  series: SeriesDef[];
  height?: number;
}) {
  const n = Math.max(...series.map((s) => s.values.length), 0);
  if (n < 2) return null;
  const innerH = height - AXIS_TOP - AXIS_BOTTOM;
  const right = 46; // room for end-value labels
  const innerW = CHART_W - AXIS_LEFT - right;
  const ticks = niceTicks(Math.max(...series.flatMap((s) => s.values), 1));
  const yMax = ticks[ticks.length - 1] || 1;
  const x = (i: number) => AXIS_LEFT + (n === 1 ? 0 : (i / (n - 1)) * innerW);
  const y = (v: number) => AXIS_TOP + innerH - (v / yMax) * innerH;
  const labelIdx = tickIndices(n, 6);

  return (
    <ChartFrame height={height} ticks={ticks} labels={labels} labelIdx={labelIdx} x={x}>
      {series.map((s) => {
        const pts = s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
        const last = s.values.length - 1;
        return (
          <g key={s.colorIndex}>
            <polyline
              points={pts}
              fill="none"
              stroke={seriesColor(s.colorIndex)}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {/* invisible fat hit-targets → native hover tooltips */}
            {s.values.map((v, i) => (
              <circle key={i} cx={x(i)} cy={y(v)} r="9" fill="transparent">
                <title>{`${fmtTick(labels[i] ?? String(i + 1))} — ${s.name}: ${fmtNum(v)}`}</title>
              </circle>
            ))}
            <circle
              cx={x(last)}
              cy={y(s.values[last])}
              r="4"
              fill={seriesColor(s.colorIndex)}
              stroke={SURFACE}
              strokeWidth="2"
            />
            <text
              x={x(last) + 9}
              y={y(s.values[last]) + 3.5}
              fontSize="11"
              fontWeight="600"
              fill="var(--color-text)"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {fmtNum(s.values[last])}
            </text>
          </g>
        );
      })}
    </ChartFrame>
  );
}

// Column chart: ≤24px columns growing from a zero baseline, 4px rounded at
// the data end only, band air as the separator. Sparing direct labels —
// first, last, and the peak — everything else reads off the axis/tooltip.
function ColumnChart({
  labels,
  series,
  height = 240,
}: {
  labels: string[];
  series: SeriesDef[];
  height?: number;
}) {
  const n = Math.max(...series.map((s) => s.values.length), 0);
  if (!n) return null;
  const innerH = height - AXIS_TOP - AXIS_BOTTOM;
  const innerW = CHART_W - AXIS_LEFT - 16;
  const ticks = niceTicks(Math.max(...series.flatMap((s) => s.values), 1));
  const yMax = ticks[ticks.length - 1] || 1;
  const band = innerW / n;
  const k = series.length;
  const barW = Math.min(24, Math.max(3, (band * 0.72 - (k - 1) * 2) / k));
  const groupW = k * barW + (k - 1) * 2;
  const xBand = (i: number) => AXIS_LEFT + i * band + band / 2;
  const y = (v: number) => AXIS_TOP + innerH - (v / yMax) * innerH;
  const baseline = AXIS_TOP + innerH;
  const labelIdx = tickIndices(n, 8);

  // Selective direct labels (single-series only): first, last, peak.
  const labeled = new Set<number>();
  if (k === 1) {
    const vals = series[0].values;
    labeled.add(0);
    labeled.add(vals.length - 1);
    labeled.add(vals.indexOf(Math.max(...vals)));
  }

  return (
    <ChartFrame height={height} ticks={ticks} labels={labels} labelIdx={labelIdx} x={xBand}>
      {series.map((s, si) =>
        s.values.map((v, i) => {
          const bx = xBand(i) - groupW / 2 + si * (barW + 2);
          const by = y(Math.max(v, 0));
          const h = Math.max(baseline - by, v > 0 ? 2 : 0);
          const r = Math.min(4, barW / 2, h);
          return (
            <g key={`${si}-${i}`}>
              <path
                d={`M${bx},${baseline} L${bx},${by + r} Q${bx},${by} ${bx + r},${by} L${bx + barW - r},${by} Q${bx + barW},${by} ${bx + barW},${by + r} L${bx + barW},${baseline} Z`}
                fill={seriesColor(s.colorIndex)}
              >
                <title>{`${fmtTick(labels[i] ?? String(i + 1))} — ${s.name}: ${fmtNum(v)}`}</title>
              </path>
              {labeled.has(i) && k === 1 ? (
                <text
                  x={bx + barW / 2}
                  y={by - 5}
                  textAnchor="middle"
                  fontSize="10.5"
                  fontWeight="600"
                  fill="var(--color-text)"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {fmtNum(v)}
                </text>
              ) : null}
            </g>
          );
        }),
      )}
    </ChartFrame>
  );
}

// Horizontal bars for categorical data (competitor domains, page names):
// the label gets a full line so nothing collides, the bar grows from the
// left, and every value sits at its tip.
function HBarChart({ labels, series }: { labels: string[]; series: SeriesDef[] }) {
  const s = series[0];
  if (!s?.values.length) return null;
  const max = Math.max(...s.values, 1);
  return (
    <div className="space-y-2.5">
      {s.values.map((v, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,230px)_1fr] items-center gap-3">
          <span
            className="truncate text-[13px] text-[var(--color-text-muted)]"
            title={String(labels[i] ?? "")}
          >
            {labels[i] ?? `#${i + 1}`}
          </span>
          <div className="flex min-w-0 items-center gap-2.5">
            <div
              className="h-[14px] shrink-0 rounded-r-[4px]"
              style={{
                width: `${Math.max((v / max) * 100, 0.5)}%`,
                maxWidth: "calc(100% - 44px)",
                backgroundColor: seriesColor(s.colorIndex),
              }}
              title={`${labels[i] ?? ""}: ${fmtNum(v)}`}
            />
            <span className="text-[13px] font-semibold tabular-nums">{fmtNum(v)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// Legend: colored key dot + name in text tokens. Present whenever ≥2 series
// share a plot; series names stay editable here.
function Legend({
  series,
  onRename,
}: {
  series: SeriesDef[];
  onRename?: (index: number, name: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
      {series.map((s, si) => (
        <span key={si} className="inline-flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: seriesColor(s.colorIndex) }}
          />
          <EditableText value={s.name} onCommit={onRename ? (v) => onRename(si, v) : undefined} />
        </span>
      ))}
    </div>
  );
}

/* ----------------------------- slide bits ----------------------------- */

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

// Stock slide headings — mirror the .pptx section titles exactly, so what the
// preview shows is what prints when there's no override.
const STOCK_TITLES: Record<string, string> = {
  executiveSummary: "Executive Summary",
  keywordRankings: "Keyword Rankings",
  competitiveSnapshot: "Competitive Snapshot",
  organicTraffic: "Organic Traffic",
  crossChannelAi: "Cross-Channel & AI Visibility",
  contentInsights: "Content & Insights",
  photoBacklink: "Photo & Backlink Optimization",
  postingSocial: "Pages & Posting / Social",
  rankingDetail: "Webpage Ranking Detail",
  whatsNext: "What's Next",
};

interface SlideDef {
  label: string;
  body: React.ReactNode;
  center?: boolean;
  onRemove?: () => void;
}

// Cover date line, matching the hand-built meeting decks: "7/6/2026 Meeting".
function fmtMeetingLine(c: MonthlyContent): string {
  const m = String(c.meetingDate || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${+m[2]}/${+m[3]}/${m[1]} Meeting`;
  return fmtPeriodPretty(c.reportPeriod ?? "");
}

function buildSlides(c: MonthlyContent, edit?: EditFn, removeItem?: RemoveFn, logoUrl?: string | null): SlideDef[] {
  const slides: SlideDef[] = [];

  const titleOf = (key: string) => c.sectionTitles?.[key] || STOCK_TITLES[key] || key;
  // The big headline at the top of a section slide. Edits write to
  // sectionTitles.<key>, which the .pptx builder prints as the slide title.
  const Heading = ({ sectionKey }: { sectionKey: string }) => (
    <h3 className="mb-6 text-2xl sm:text-[28px] font-semibold tracking-tight leading-snug">
      <EditableText
        value={titleOf(sectionKey)}
        onCommit={edit ? (v) => edit(["sectionTitles", sectionKey], v) : undefined}
        multiline
      />
    </h3>
  );

  slides.push({
    label: "Cover",
    center: true,
    body: (
      <div className="flex flex-col items-center justify-center text-center gap-10">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={c.client ?? "Client logo"}
            className="h-auto max-h-72 w-[62%] max-w-[640px] object-contain"
          />
        ) : (
          <div className="text-5xl sm:text-6xl font-semibold leading-tight">
            <EditableText
              value={c.client ?? "Client"}
              onCommit={edit ? (v) => edit(["client"], v) : undefined}
            />
          </div>
        )}
        <div className="text-2xl sm:text-3xl text-[var(--color-text)]">{fmtMeetingLine(c)}</div>
      </div>
    ),
  });

  if (c.executiveSummary) {
    slides.push({
      label: titleOf("executiveSummary"),
      body: (
        <div>
          <Heading sectionKey="executiveSummary" />
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
        </div>
      ),
    });
  }

  const kwRows = c.keywordRankings?.rows ?? [];
  if (kwRows.length) {
    slides.push({
      label: titleOf("keywordRankings"),
      body: (
        <div>
          <Heading sectionKey="keywordRankings" />
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
        </div>
      ),
    });
  }

  if (c.competitiveSnapshot) {
    slides.push({
      label: titleOf("competitiveSnapshot"),
      body: (
        <div>
          <Heading sectionKey="competitiveSnapshot" />
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
        </div>
      ),
    });
  }

  if (c.organicTraffic) {
    const t = c.organicTraffic;
    const trendVals = t.trend?.clicks ?? [];
    slides.push({
      label: titleOf("organicTraffic"),
      body: (
        <div>
          <Heading sectionKey="organicTraffic" />
          <div className="space-y-6">
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
            {trendVals.length >= 2 ? (
              <div className="space-y-2">
                <LineChart
                  labels={t.trend?.labels ?? []}
                  series={[{ name: "Clicks", values: trendVals, colorIndex: 0 }]}
                  height={200}
                />
                <div className="text-xs text-[var(--color-text-muted)]">Daily clicks — Google Search Console</div>
              </div>
            ) : null}
          </div>
        </div>
      ),
    });
  }

  if (c.crossChannelAi) {
    slides.push({
      label: titleOf("crossChannelAi"),
      body: (
        <div>
          <Heading sectionKey="crossChannelAi" />
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
        </div>
      ),
    });
  }

  if (c.contentInsights) {
    const groupLabel = "text-[11px] uppercase tracking-wider text-[var(--color-text-muted)] mb-2";
    slides.push({
      label: titleOf("contentInsights"),
      body: (
        <div>
          <Heading sectionKey="contentInsights" />
          <div className="space-y-6">
            {c.contentInsights.posted?.length ? (
              <div>
                <div className={groupLabel}>Posted &amp; live</div>
                <Bullets items={c.contentInsights.posted} basePath={["contentInsights", "posted"]} edit={edit} removeItem={removeItem} />
              </div>
            ) : null}
            {c.contentInsights.approved?.length ? (
              <div>
                <div className={groupLabel}>Approved &amp; up next</div>
                <Bullets items={c.contentInsights.approved} basePath={["contentInsights", "approved"]} edit={edit} removeItem={removeItem} />
              </div>
            ) : null}
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
        </div>
      ),
    });
  }

  if (c.photoBacklink) {
    slides.push({
      label: titleOf("photoBacklink"),
      body: (
        <div>
          <Heading sectionKey="photoBacklink" />
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
        </div>
      ),
    });
  }

  if (c.postingSocial) {
    slides.push({
      label: titleOf("postingSocial"),
      body: (
        <div>
          <Heading sectionKey="postingSocial" />
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
        </div>
      ),
    });
  }

  const topPages = c.rankingDetail?.topPages ?? [];
  if (topPages.length || c.rankingDetail?.aiOverview) {
    slides.push({
      label: titleOf("rankingDetail"),
      body: (
        <div>
          <Heading sectionKey="rankingDetail" />
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
        </div>
      ),
    });
  }

  for (const [ci, chart] of (c.charts ?? []).entries()) {
    const series: SeriesDef[] = (chart.series ?? [])
      .map((s, si) => ({ name: s?.name || `Series ${si + 1}`, values: (s?.values ?? []).filter((v) => Number.isFinite(v)), colorIndex: si }))
      .filter((s) => s.values.length > 0);
    if (!series.length) continue;
    // Mixed scales on one axis flatten the smaller series into a floor line
    // (and a second axis is off the table) — split into small multiples when
    // the biggest series dwarfs the smallest by ~6× or more.
    const maxes = series.map((s) => Math.max(...s.values, 0));
    const smallMultiples =
      chart.type !== "bar" &&
      series.length > 1 &&
      Math.max(...maxes) / Math.max(Math.min(...maxes), 1) > 6;
    // Categorical bars (domains, page names) go horizontal — long labels get
    // a full line each instead of colliding under columns.
    const horizontal = chart.type === "bar" && series.length === 1 && !isDateLike(chart.labels ?? []);
    const Chart = chart.type === "bar" ? ColumnChart : LineChart;
    const rename = edit ? (si: number, v: string) => edit(["charts", ci, "series", si, "name"], v) : undefined;

    slides.push({
      label: chart.title || "Chart",
      onRemove: removeItem ? () => removeItem(["charts"], ci) : undefined,
      body: (
        <div>
          <h3 className="mb-6 text-2xl sm:text-[28px] font-semibold tracking-tight leading-snug">
            <EditableText
              value={chart.title}
              onCommit={edit ? (v) => edit(["charts", ci, "title"], v) : undefined}
              multiline
            />
          </h3>
          {smallMultiples ? (
            <div className="space-y-7">
              {series.map((s, si) => (
                <div key={si} className="space-y-1.5">
                  <span className="inline-flex items-center gap-2 text-sm font-medium">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: seriesColor(s.colorIndex) }}
                    />
                    <EditableText value={s.name} onCommit={rename ? (v) => rename(si, v) : undefined} />
                  </span>
                  <Chart labels={chart.labels ?? []} series={[s]} height={170} />
                </div>
              ))}
            </div>
          ) : horizontal ? (
            <HBarChart labels={chart.labels ?? []} series={series} />
          ) : (
            <div className="space-y-3">
              <Chart labels={chart.labels ?? []} series={series} />
              {series.length > 1 ? <Legend series={series} onRename={rename} /> : null}
            </div>
          )}
          {chart.source ? (
            <div className="mt-4 text-xs text-[var(--color-text-muted)]">Source: {chart.source}</div>
          ) : null}
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
      label: titleOf("whatsNext"),
      body: (
        <div>
          <Heading sectionKey="whatsNext" />
          <Bullets items={c.whatsNext} basePath={["whatsNext"]} edit={edit} removeItem={removeItem} />
        </div>
      ),
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
  logoUrl,
}: {
  content: MonthlyContent;
  onChange?: (content: MonthlyContent) => void;
  /** Client logo (dark-theme variant) for the cover slide. */
  logoUrl?: string | null;
}) {
  const edit: EditFn | undefined = onChange
    ? (path, value) => onChange(setAtPath(content as unknown as Json, path, value) as unknown as MonthlyContent)
    : undefined;
  const removeItem: RemoveFn | undefined = onChange
    ? (arrayPath, index) =>
        onChange(removeAtPath(content as unknown as Json, arrayPath, index) as unknown as MonthlyContent)
    : undefined;
  const slides = buildSlides(content, edit, removeItem, logoUrl);
  return (
    <div className="space-y-4">
      {onChange ? (
        <p className="text-xs text-[var(--color-text-muted)]">
          Click anything on a slide to edit it — headlines, text, and numbers alike. Enter or
          click away to save, Esc to cancel. Clear a line (or hit its ×) to delete it.
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
              <span className="truncate text-[11px] uppercase tracking-wider text-[var(--color-text-muted)]">
                {s.label}
              </span>
              <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wider text-[var(--color-accent)] opacity-0 transition group-hover:opacity-100">
                editable
              </span>
              {s.onRemove ? (
                <button
                  type="button"
                  onClick={s.onRemove}
                  title="Remove this slide"
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-sm leading-none text-[var(--color-text-muted)] opacity-0 transition group-hover:opacity-100 hover:bg-red-500/15 hover:text-red-300"
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
