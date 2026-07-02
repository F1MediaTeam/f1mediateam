"use client";

// Slide previews of the synthesized MonthlyContent, shown on /admin/reports
// after "Preview & edit". Mirrors the .pptx deck order — one 16:9 card per
// slide — and, when an onChange handler is provided, every text element is
// click-to-edit in place (Google-Slides style): click, type, blur or Enter
// to commit, Escape to revert. Edits write straight back into the content
// object, so Generate renders exactly what's on screen.
//
// Numbers that came from analytics (stat tiles, positions, click counts)
// are deliberately NOT inline-editable — change those through the Claude
// chat or the manual field editor so it's always an intentional act.

import { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { MonthlyContent } from "@/lib/deck/f1-monthly/deck-builder";

type Path = (string | number)[];
type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
type EditFn = (path: Path, value: string) => void;
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
        "cursor-text rounded-sm outline-none transition hover:bg-white/[0.06] focus:bg-white/[0.08] focus:ring-1 focus:ring-[var(--color-accent)]/60 focus:line-clamp-none",
        multiline && "whitespace-pre-line",
        className,
      )}
    />
  );
}

function Sparkline({ values, height = 40 }: { values: number[]; height?: number }) {
  if (values.length < 2) return null;
  const w = 220;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(height - ((v - min) / span) * height).toFixed(1)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full h-10" preserveAspectRatio="none">
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
    <div className="flex items-end gap-1 h-10">
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
  max = 5,
}: {
  items?: string[] | null;
  basePath: Path;
  edit?: EditFn;
  removeItem?: RemoveFn;
  max?: number;
}) {
  const list = (items ?? []).map((w, i) => ({ w, i })).filter(({ w }) => Boolean(w));
  if (!list.length) return null;
  return (
    <ul className="space-y-1">
      {list.slice(0, max).map(({ w, i }) => (
        <li key={i} className="flex gap-1.5 text-[11px] leading-snug">
          <span className="text-[var(--color-accent)] shrink-0">›</span>
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
            className="line-clamp-2"
            multiline
          />
        </li>
      ))}
      {list.length > max ? (
        <li className="text-[10px] text-[var(--color-text-muted)]">+{list.length - max} more</li>
      ) : null}
    </ul>
  );
}

function StatTile({ label, value, prior }: { label: string; value?: string; prior?: string | null }) {
  if (!value) return null;
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-white/[0.03] px-2.5 py-2">
      <div className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)]">{label}</div>
      <div className="text-base font-semibold tabular-nums leading-tight">{value}</div>
      {prior ? (
        <div className="text-[9px] text-[var(--color-text-muted)] tabular-nums">prev {prior}</div>
      ) : null}
    </div>
  );
}

interface SlideDef {
  label: string;
  body: React.ReactNode;
}

function buildSlides(c: MonthlyContent, edit?: EditFn, removeItem?: RemoveFn): SlideDef[] {
  const slides: SlideDef[] = [];

  slides.push({
    label: "Cover",
    body: (
      <div className="h-full flex flex-col items-center justify-center text-center gap-2">
        <div className="text-[10px] uppercase tracking-[0.25em] text-[var(--color-accent)]">
          F1 Media · Performance Report
        </div>
        <div className="text-xl font-semibold leading-tight">
          <EditableText
            value={c.client ?? "Client"}
            onCommit={edit ? (v) => edit(["client"], v) : undefined}
          />
        </div>
        <div className="text-xs text-[var(--color-text-muted)]">Performance Review</div>
        {c.reportPeriod ? (
          <div className="mt-1 rounded-full border border-[var(--color-border)] px-3 py-1 text-[10px] tabular-nums text-[var(--color-text-muted)]">
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
        <div className="space-y-2">
          {c.executiveSummary.intro ? (
            <p className="text-[11px] leading-snug text-[var(--color-text-muted)]">
              <EditableText
                value={c.executiveSummary.intro}
                onCommit={edit ? (v) => edit(["executiveSummary", "intro"], v) : undefined}
                className="line-clamp-4"
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
        <div className="space-y-1">
          {kwRows.slice(0, 6).map((r, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px]">
              <EditableText
                value={r.keyword}
                onCommit={edit ? (v) => edit(["keywordRankings", "rows", i, "keyword"], v) : undefined}
                className="flex-1 truncate"
              />
              <span className="tabular-nums text-[var(--color-text-muted)]">{r.prior}</span>
              <span className="text-[var(--color-text-muted)]">→</span>
              <span
                className={
                  r.current <= r.prior
                    ? "tabular-nums font-semibold text-[var(--color-accent)]"
                    : "tabular-nums font-semibold"
                }
              >
                {r.current}
              </span>
            </div>
          ))}
          {kwRows.length > 6 ? (
            <div className="text-[10px] text-[var(--color-text-muted)]">+{kwRows.length - 6} more keywords</div>
          ) : null}
          {c.keywordRankings?.note ? (
            <p className="text-[10px] text-[var(--color-text-muted)] pt-1">
              <EditableText
                value={c.keywordRankings.note}
                onCommit={edit ? (v) => edit(["keywordRankings", "note"], v) : undefined}
                className="line-clamp-2"
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
        <div className="space-y-2">
          {(c.competitiveSnapshot.competitors ?? []).slice(0, 4).map((comp, i) => (
            <div key={i} className="flex items-center justify-between text-[11px]">
              <span className="truncate">{comp.domain}</span>
              <span className="tabular-nums text-[var(--color-text-muted)]">{comp.position}</span>
            </div>
          ))}
          {c.competitiveSnapshot.closing ? (
            <p className="text-[10px] text-[var(--color-text-muted)]">
              <EditableText
                value={c.competitiveSnapshot.closing}
                onCommit={edit ? (v) => edit(["competitiveSnapshot", "closing"], v) : undefined}
                className="line-clamp-2"
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
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-1.5">
            <StatTile label="Clicks" value={t.clicks?.value} prior={t.clicks?.prior} />
            <StatTile label="Impressions" value={t.impressions?.value} prior={t.impressions?.prior} />
            <StatTile label="CTR" value={t.ctr?.value} />
            <StatTile label="Avg position" value={t.avgPosition?.value} />
          </div>
          {t.note ? (
            <p className="text-[10px] text-[var(--color-text-muted)]">
              <EditableText
                value={t.note}
                onCommit={edit ? (v) => edit(["organicTraffic", "note"], v) : undefined}
                className="line-clamp-2"
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
        <div className="space-y-2">
          {(c.crossChannelAi.channels ?? []).slice(0, 4).map((ch, i) => (
            <div key={i} className="flex items-center justify-between text-[11px]">
              <EditableText
                value={ch.name}
                onCommit={edit ? (v) => edit(["crossChannelAi", "channels", i, "name"], v) : undefined}
              />
              <span className="tabular-nums text-[var(--color-text-muted)]">{ch.metric}</span>
            </div>
          ))}
          <Bullets items={c.crossChannelAi.aiVisibility} basePath={["crossChannelAi", "aiVisibility"]} edit={edit} removeItem={removeItem} max={3} />
        </div>
      ),
    });
  }

  if (c.contentInsights) {
    slides.push({
      label: "Content insights",
      body: (
        <div className="space-y-2">
          <Bullets items={c.contentInsights.pagesCreated} basePath={["contentInsights", "pagesCreated"]} edit={edit} removeItem={removeItem} max={3} />
          <Bullets items={c.contentInsights.pagesOptimized} basePath={["contentInsights", "pagesOptimized"]} edit={edit} removeItem={removeItem} max={3} />
          {c.contentInsights.linking ? (
            <p className="text-[10px] text-[var(--color-text-muted)]">
              <EditableText
                value={c.contentInsights.linking}
                onCommit={edit ? (v) => edit(["contentInsights", "linking"], v) : undefined}
                className="line-clamp-2"
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
        <div className="space-y-2">
          <Bullets items={c.photoBacklink.refreshes} basePath={["photoBacklink", "refreshes"]} edit={edit} removeItem={removeItem} max={3} />
          {c.photoBacklink.backlinksBuilt ? (
            <p className="text-[11px]">
              <EditableText
                value={c.photoBacklink.backlinksBuilt}
                onCommit={edit ? (v) => edit(["photoBacklink", "backlinksBuilt"], v) : undefined}
                className="line-clamp-2"
                multiline
              />
            </p>
          ) : null}
          {c.photoBacklink.toxicRemoved ? (
            <p className="text-[10px] text-[var(--color-text-muted)]">
              <EditableText
                value={c.photoBacklink.toxicRemoved}
                onCommit={edit ? (v) => edit(["photoBacklink", "toxicRemoved"], v) : undefined}
                className="line-clamp-2"
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
        <div className="space-y-2">
          {c.postingSocial.flyers ? (
            <p className="text-[11px]">
              <EditableText
                value={c.postingSocial.flyers}
                onCommit={edit ? (v) => edit(["postingSocial", "flyers"], v) : undefined}
                className="line-clamp-2"
                multiline
              />
            </p>
          ) : null}
          <Bullets items={c.postingSocial.channels} basePath={["postingSocial", "channels"]} edit={edit} removeItem={removeItem} max={4} />
          {c.postingSocial.youtube ? (
            <p className="text-[10px] text-[var(--color-text-muted)]">
              <EditableText
                value={c.postingSocial.youtube}
                onCommit={edit ? (v) => edit(["postingSocial", "youtube"], v) : undefined}
                className="line-clamp-2"
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
        <div className="space-y-1">
          {topPages.slice(0, 5).map((p, i) => (
            <div key={i} className="flex items-center gap-2 text-[10px]">
              <span className="flex-1 truncate text-[var(--color-text-muted)]">{p.url}</span>
              {p.clicks != null ? <span className="tabular-nums">{p.clicks}</span> : null}
            </div>
          ))}
          {c.rankingDetail?.aiOverview ? (
            <p className="text-[10px] text-[var(--color-text-muted)] pt-1">
              <EditableText
                value={c.rankingDetail.aiOverview}
                onCommit={edit ? (v) => edit(["rankingDetail", "aiOverview"], v) : undefined}
                className="line-clamp-2"
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
      body: (
        <div className="h-full flex flex-col justify-center gap-2">
          <div className="text-[11px] font-medium">
            <EditableText
              value={chart.title}
              onCommit={edit ? (v) => edit(["charts", ci, "title"], v) : undefined}
            />
          </div>
          {chart.type === "bar" ? <MiniBars series={first} /> : <Sparkline values={first} height={56} />}
          <div className="text-[10px] text-[var(--color-text-muted)]">
            {chart.series?.map((s) => s.name).join(" · ")}
            {chart.source ? ` — ${chart.source}` : ""}
          </div>
        </div>
      ),
    });
  }

  for (const [i, img] of (c.images ?? []).entries()) {
    slides.push({
      label: img.title || `Image ${i + 1}`,
      body: (
        <div className="h-full flex flex-col items-center justify-center gap-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img.data} alt="" className="max-h-24 max-w-full rounded object-contain" />
          <div className="text-[10px] text-[var(--color-text-muted)]">
            <EditableText
              value={img.caption ?? ""}
              onCommit={edit ? (v) => edit(["images", i, "caption"], v) : undefined}
              className="line-clamp-1"
            />
          </div>
        </div>
      ),
    });
  }

  if (c.whatsNext?.length) {
    slides.push({
      label: "What's next",
      body: <Bullets items={c.whatsNext} basePath={["whatsNext"]} edit={edit} removeItem={removeItem} max={6} />,
    });
  }

  if (c.questions) {
    slides.push({
      label: "Questions",
      body: (
        <div className="h-full flex flex-col items-center justify-center text-center gap-1.5">
          <div className="text-sm font-semibold">
            <EditableText
              value={c.questions.prompt ?? "Questions?"}
              onCommit={edit ? (v) => edit(["questions", "prompt"], v) : undefined}
            />
          </div>
          {c.questions.contact ? (
            <div className="text-[10px] text-[var(--color-text-muted)]">
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
    <div className="space-y-3">
      {onChange ? (
        <p className="text-[11px] text-[var(--color-text-muted)]">
          Click any text on a slide to edit it directly — Enter or click away to save, Esc to
          cancel. Metrics stay locked; change those via chat or the manual editor.
        </p>
      ) : null}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {slides.map((s, i) => (
          <div
            key={`${s.label}-${i}`}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elev)] overflow-hidden"
          >
            <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-1.5">
              <span className="rounded bg-[var(--color-accent)]/15 px-1.5 py-0.5 text-[9px] font-semibold tabular-nums text-[var(--color-accent)]">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                {s.label}
              </span>
            </div>
            <div className="aspect-[16/9] p-3 overflow-hidden">{s.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
