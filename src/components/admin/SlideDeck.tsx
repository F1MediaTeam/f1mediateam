"use client";

// Slide-deck renderer. Takes the typed Slide[] from src/lib/slides.ts and
// renders one slide at a time. Arrow keys, space, and on-screen controls
// move between slides. Used by:
//   - /admin/meetings/[id]            → preview (scaled to fit a card)
//   - /admin/meetings/[id]/present    → full-screen presentation

import { useEffect, useRef, useState } from "react";
import type {
  ChartPoint,
  ContentSlideItem,
  EventSlideItem,
  KpiItem,
  Slide,
  TaskSlideItem,
} from "@/lib/slides";

interface Props {
  slides: Slide[];
  mode?: "present" | "preview";
  initialIndex?: number;
}

export default function SlideDeck({ slides, mode = "present", initialIndex = 0 }: Props) {
  const [idx, setIdx] = useState(Math.min(Math.max(initialIndex, 0), Math.max(slides.length - 1, 0)));

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        setIdx((i) => Math.min(i + 1, slides.length - 1));
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        setIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Home") {
        setIdx(0);
      } else if (e.key === "End") {
        setIdx(slides.length - 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slides.length]);

  if (slides.length === 0) {
    return (
      <div className="grid place-items-center h-full text-[var(--color-text-muted)]">
        No slides yet.
      </div>
    );
  }

  const slide = slides[idx];
  const isFull = mode === "present";

  return (
    <div
      className={
        isFull
          ? "fixed inset-0 z-50 bg-[var(--color-bg)] flex flex-col"
          : "relative w-full"
      }
    >
      <div className={isFull ? "flex-1 grid place-items-center px-10" : "px-2"}>
        <SlideFrame slide={slide} compact={!isFull} />
      </div>

      <DeckControls
        idx={idx}
        total={slides.length}
        onPrev={() => setIdx((i) => Math.max(i - 1, 0))}
        onNext={() => setIdx((i) => Math.min(i + 1, slides.length - 1))}
        full={isFull}
      />
    </div>
  );
}

// ---------------- chrome ----------------

function DeckControls({
  idx,
  total,
  onPrev,
  onNext,
  full,
}: {
  idx: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  full: boolean;
}) {
  return (
    <div
      className={
        (full
          ? "px-10 py-5 border-t border-[var(--color-border)] bg-[var(--color-bg-elev)]/60 backdrop-blur"
          : "mt-4 px-2") +
        " flex items-center justify-between gap-4 text-xs"
      }
    >
      <div className="text-[var(--color-text-muted)]">
        Slide <span className="text-[var(--color-text)] font-mono">{idx + 1}</span> / {total}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onPrev}
          disabled={idx === 0}
          className="rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg-elev)] hover:bg-[var(--color-bg-hover)] disabled:opacity-40 px-3 py-1.5"
        >
          ← Prev
        </button>
        <button
          onClick={onNext}
          disabled={idx === total - 1}
          className="rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg-elev)] hover:bg-[var(--color-bg-hover)] disabled:opacity-40 px-3 py-1.5"
        >
          Next →
        </button>
        {full ? (
          <a
            href="javascript:window.close()"
            className="ml-3 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg-elev)] hover:bg-[var(--color-bg-hover)] px-3 py-1.5"
          >
            Exit
          </a>
        ) : null}
      </div>
    </div>
  );
}

function SlideFrame({ slide, compact }: { slide: Slide; compact: boolean }) {
  return (
    <div
      className={
        "w-full max-w-[1100px] aspect-[16/9] rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elev)] shadow-2xl overflow-hidden " +
        (compact ? "" : "min-h-[420px]")
      }
    >
      <div className="w-full h-full p-10 flex flex-col">
        {renderSlide(slide)}
      </div>
    </div>
  );
}

// ---------------- slide renderers ----------------

function renderSlide(slide: Slide): React.ReactNode {
  switch (slide.kind) {
    case "cover":
      return <CoverSlide slide={slide} />;
    case "kpi":
      return <KpiSlide slide={slide} />;
    case "trend":
      return <TrendSlide slide={slide} />;
    case "content":
      return <ContentSlide slide={slide} />;
    case "events":
      return <EventsSlide slide={slide} />;
    case "tasks":
      return <TasksSlide slide={slide} />;
    case "closing":
      return <ClosingSlide slide={slide} />;
  }
}

function SlideHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-6">
      <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-300/80 font-mono">
        {eyebrow}
      </div>
      <h2 className="mt-1 text-3xl font-semibold tracking-tight">{title}</h2>
    </div>
  );
}

function CoverSlide({ slide }: { slide: Extract<Slide, { kind: "cover" }> }) {
  const dateLabel = new Date(slide.date).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return (
    <div className="relative h-full flex flex-col justify-between">
      <div className="absolute inset-0 pointer-events-none opacity-50 bg-[radial-gradient(circle_at_top_right,_rgba(20,184,166,0.18),_transparent_55%)]" />
      <div className="relative flex items-start justify-between">
        {slide.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={slide.logoUrl}
            alt={`${slide.subtitle} logo`}
            className="w-24 h-24 rounded-2xl object-cover bg-white/5 ring-1 ring-[var(--color-border)]"
          />
        ) : (
          <div className="w-24 h-24 rounded-2xl grid place-items-center text-[var(--color-text-muted)] bg-white/5 ring-1 ring-[var(--color-border)] text-xs uppercase tracking-wider">
            {slide.subtitle.slice(0, 2)}
          </div>
        )}
        <div className="text-right text-xs text-[var(--color-text-muted)]">
          <div className="font-mono">{slide.rangeLabel}</div>
          <div className="mt-1">F1 Media · Client review</div>
        </div>
      </div>
      <div className="relative">
        <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-300/80 font-mono">
          {slide.subtitle}
        </div>
        <h1 className="mt-3 text-5xl font-semibold tracking-tight leading-tight">
          {slide.title}
        </h1>
        <div className="mt-6 text-sm text-[var(--color-text-muted)]">{dateLabel}</div>
      </div>
    </div>
  );
}

function KpiSlide({ slide }: { slide: Extract<Slide, { kind: "kpi" }> }) {
  return (
    <div className="flex flex-col h-full">
      <SlideHeader eyebrow={slide.subtitle} title={slide.title} />
      <div
        className={
          "grid gap-4 flex-1 " +
          (slide.items.length <= 3 ? "grid-cols-3" : "grid-cols-5")
        }
      >
        {slide.items.map((k) => (
          <KpiTile key={k.label} item={k} />
        ))}
      </div>
    </div>
  );
}

function KpiTile({ item }: { item: KpiItem }) {
  const color =
    item.direction === "up"
      ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/30"
      : item.direction === "down"
      ? "text-red-300 bg-red-500/10 border-red-500/30"
      : "text-[var(--color-text-muted)] bg-white/5 border-[var(--color-border)]";
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] p-5 flex flex-col justify-between">
      <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-muted)] font-mono">
        {item.label}
      </div>
      <div className="mt-3 font-mono text-4xl font-semibold">{item.value}</div>
      <div className={`mt-3 inline-flex items-center gap-1 self-start text-[11px] px-2 py-0.5 rounded-full border ${color}`}>
        {item.direction === "up" ? "▲" : item.direction === "down" ? "▼" : "—"}
        <span className="font-mono">{item.delta ?? "no change"}</span>
      </div>
    </div>
  );
}

function TrendSlide({ slide }: { slide: Extract<Slide, { kind: "trend" }> }) {
  return (
    <div className="flex flex-col h-full">
      <SlideHeader eyebrow={slide.subtitle} title={slide.title} />
      <div className="grid grid-cols-[1fr_220px] gap-6 flex-1">
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
          <LineChart points={slide.series} />
        </div>
        <div className="flex flex-col gap-3">
          <SummaryTile
            label={slide.summaryLeft.label}
            value={slide.summaryLeft.value}
            tone="neutral"
            delta={null}
          />
          <SummaryTile
            label={slide.summaryRight.label}
            value={slide.summaryRight.value}
            tone={slide.summaryRight.direction}
            delta={slide.summaryRight.delta}
          />
        </div>
      </div>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  delta,
  tone,
}: {
  label: string;
  value: string;
  delta: string | null;
  tone: "up" | "down" | "flat" | "neutral";
}) {
  const accent =
    tone === "up"
      ? "border-emerald-500/30 text-emerald-300"
      : tone === "down"
      ? "border-red-500/30 text-red-300"
      : "border-[var(--color-border)] text-[var(--color-text)]";
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] p-5 flex flex-col">
      <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-muted)] font-mono">{label}</div>
      <div className="mt-2 font-mono text-3xl font-semibold">{value}</div>
      {delta ? (
        <div className={`mt-2 inline-flex items-center gap-1 self-start text-[11px] px-2 py-0.5 rounded-full border ${accent}`}>
          <span className="font-mono">{delta}</span>
        </div>
      ) : null}
    </div>
  );
}

function ContentSlide({ slide }: { slide: Extract<Slide, { kind: "content" }> }) {
  return (
    <div className="flex flex-col h-full">
      <SlideHeader eyebrow={slide.subtitle} title={slide.title} />
      <div className="grid grid-cols-2 gap-3 flex-1 overflow-hidden content-start">
        {slide.cards.map((c, i) => (
          <ContentCardTile key={i} card={c} />
        ))}
      </div>
    </div>
  );
}

function ContentCardTile({ card }: { card: ContentSlideItem }) {
  const stageTone =
    card.stage === "posted"
      ? "border-emerald-500/30 text-emerald-300 bg-emerald-500/10"
      : card.stage === "pending"
      ? "border-amber-500/30 text-amber-300 bg-amber-500/10"
      : "border-sky-500/30 text-sky-300 bg-sky-500/10";
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4 flex flex-col gap-2 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium truncate">{card.title}</div>
        <span className={`shrink-0 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${stageTone}`}>
          {card.stage}
        </span>
      </div>
      {card.excerpt ? (
        <div className="text-xs text-[var(--color-text-muted)] line-clamp-3">{card.excerpt}</div>
      ) : null}
      <div className="mt-auto flex items-center justify-between text-[10px] font-mono text-[var(--color-text-muted)]">
        <span>{new Date(card.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
        {card.link ? (
          <a className="text-emerald-300 hover:underline truncate max-w-[55%]" href={card.link} target="_blank" rel="noreferrer">
            Open ↗
          </a>
        ) : null}
      </div>
    </div>
  );
}

function EventsSlide({ slide }: { slide: Extract<Slide, { kind: "events" }> }) {
  return (
    <div className="flex flex-col h-full">
      <SlideHeader eyebrow={slide.subtitle} title={slide.title} />
      <div className="flex-1 space-y-2 overflow-hidden">
        {slide.items.map((e, i) => <EventRow key={i} item={e} />)}
      </div>
    </div>
  );
}

function EventRow({ item }: { item: EventSlideItem }) {
  const accent =
    item.type === "deadline"
      ? "text-amber-300 border-amber-500/30 bg-amber-500/10"
      : "text-emerald-300 border-emerald-500/30 bg-emerald-500/10";
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3">
      <div className="flex items-center gap-3 min-w-0">
        <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${accent}`}>
          {item.type}
        </span>
        <div className="text-sm truncate">{item.title}</div>
      </div>
      <div className="text-xs font-mono text-[var(--color-text-muted)]">
        {new Date(item.date).toLocaleString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}
      </div>
    </div>
  );
}

function TasksSlide({ slide }: { slide: Extract<Slide, { kind: "tasks" }> }) {
  return (
    <div className="flex flex-col h-full">
      <SlideHeader eyebrow={slide.subtitle} title={slide.title} />
      <ul className="flex-1 space-y-2 overflow-hidden">
        {slide.items.map((t, i) => <TaskRow key={i} item={t} />)}
      </ul>
    </div>
  );
}

function TaskRow({ item }: { item: TaskSlideItem }) {
  return (
    <li className="flex items-center justify-between gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3">
      <div className="flex items-center gap-3 min-w-0">
        <span className="inline-block w-1.5 h-6 rounded-full bg-emerald-400" />
        <div className="text-sm truncate">{item.title}</div>
      </div>
      <div className="text-xs font-mono text-[var(--color-text-muted)]">
        {item.due
          ? `due ${new Date(item.due).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
          : "no due date"}
      </div>
    </li>
  );
}

function ClosingSlide({ slide }: { slide: Extract<Slide, { kind: "closing" }> }) {
  return (
    <div className="flex flex-col h-full">
      <SlideHeader eyebrow={slide.subtitle} title={slide.title} />
      <ul className="space-y-3 text-lg flex-1">
        {slide.bullets.map((b, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="mt-2 inline-block w-2 h-2 rounded-full bg-emerald-400" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
      <div className="mt-6 text-xs uppercase tracking-[0.18em] text-[var(--color-text-muted)] font-mono">
        F1 Media · {new Date().getFullYear()}
      </div>
    </div>
  );
}

// ---------------- mini SVG line chart ----------------

function LineChart({ points }: { points: ChartPoint[] }) {
  // Native SVG, no dependencies. The slide deck is rendered fully client-side
  // so this avoids dragging react-pdf into the browser bundle.
  const W = 720;
  const H = 280;
  const PAD = { l: 44, r: 16, t: 16, b: 28 };

  if (points.length < 2) {
    return (
      <div className="h-[280px] grid place-items-center text-xs text-[var(--color-text-muted)]">
        Not enough data to draw a trend.
      </div>
    );
  }
  const xs = points.map((_, i) => i);
  const ys = points.map((p) => p.value);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const ySpan = maxY - minY || Math.max(Math.abs(maxY) * 0.1, 1);
  const yMin = minY - ySpan * 0.08;
  const yMax = maxY + ySpan * 0.08;

  const x = (i: number) => PAD.l + (i / (points.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - yMin) / (yMax - yMin)) * (H - PAD.t - PAD.b);

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(xs[i]).toFixed(1)} ${y(p.value).toFixed(1)}`)
    .join(" ");
  const areaD = `${pathD} L ${x(xs[xs.length - 1]).toFixed(1)} ${y(yMin).toFixed(1)} L ${x(xs[0]).toFixed(1)} ${y(yMin).toFixed(1)} Z`;

  // Y axis ticks (3 levels)
  const ticks = [yMin, (yMin + yMax) / 2, yMax];

  // X labels: just first / middle / last to avoid clutter
  const labelIdxs = [0, Math.floor((points.length - 1) / 2), points.length - 1];
  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  const fmtVal = (n: number) => {
    if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return n.toFixed(Math.abs(n) >= 10 ? 0 : 1);
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[280px]">
      <defs>
        <linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#34d399" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((t, i) => (
        <g key={i}>
          <line
            x1={PAD.l}
            x2={W - PAD.r}
            y1={y(t)}
            y2={y(t)}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={1}
          />
          <text
            x={PAD.l - 8}
            y={y(t) + 4}
            fontSize={10}
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fill="#7f8896"
            textAnchor="end"
          >
            {fmtVal(t)}
          </text>
        </g>
      ))}
      <path d={areaD} fill="url(#trendFill)" />
      <path d={pathD} fill="none" stroke="#34d399" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <circle key={i} cx={x(xs[i])} cy={y(p.value)} r={2.5} fill="#0b1015" stroke="#34d399" strokeWidth={1.5} />
      ))}
      {labelIdxs.map((i) => (
        <text
          key={i}
          x={x(xs[i])}
          y={H - 8}
          fontSize={10}
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          fill="#7f8896"
          textAnchor="middle"
        >
          {fmtDate(points[i].date)}
        </text>
      ))}
    </svg>
  );
}
