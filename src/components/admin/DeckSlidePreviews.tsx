"use client";

// Read-only slide previews of the synthesized MonthlyContent, shown on
// /admin/reports after "Preview & edit". Mirrors the .pptx deck order —
// one 16:9 card per slide — so the admin sees roughly what the client
// will see before generating. Editing happens via the Claude chat panel
// (DeckChat) or the manual field editor; this component just renders.

import type { MonthlyContent } from "@/lib/deck/f1-monthly/deck-builder";

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

function Bullets({ items, max = 5 }: { items?: string[] | null; max?: number }) {
  const list = (items ?? []).filter(Boolean);
  if (!list.length) return null;
  return (
    <ul className="space-y-1">
      {list.slice(0, max).map((w, i) => (
        <li key={i} className="flex gap-1.5 text-[11px] leading-snug">
          <span className="text-[var(--color-accent)] shrink-0">›</span>
          <span className="line-clamp-2">{w}</span>
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

function buildSlides(c: MonthlyContent): SlideDef[] {
  const slides: SlideDef[] = [];

  slides.push({
    label: "Cover",
    body: (
      <div className="h-full flex flex-col items-center justify-center text-center gap-2">
        <div className="text-[10px] uppercase tracking-[0.25em] text-[var(--color-accent)]">
          F1 Media · Monthly Report
        </div>
        <div className="text-xl font-semibold leading-tight">{c.client ?? "Client"}</div>
        <div className="text-xs text-[var(--color-text-muted)]">Monthly SEO Performance Review</div>
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
            <p className="text-[11px] leading-snug text-[var(--color-text-muted)] line-clamp-4">
              {c.executiveSummary.intro}
            </p>
          ) : null}
          <Bullets items={c.executiveSummary.wins} />
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
              <span className="flex-1 truncate">{r.keyword}</span>
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
            <p className="text-[10px] text-[var(--color-text-muted)] line-clamp-2">
              {c.competitiveSnapshot.closing}
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
              <span>{ch.name}</span>
              <span className="tabular-nums text-[var(--color-text-muted)]">{ch.metric}</span>
            </div>
          ))}
          <Bullets items={c.crossChannelAi.aiVisibility} max={3} />
        </div>
      ),
    });
  }

  if (c.contentInsights) {
    slides.push({
      label: "Content insights",
      body: (
        <div className="space-y-2">
          <Bullets items={c.contentInsights.pagesCreated} max={3} />
          <Bullets items={c.contentInsights.pagesOptimized} max={3} />
          {c.contentInsights.linking ? (
            <p className="text-[10px] text-[var(--color-text-muted)] line-clamp-2">{c.contentInsights.linking}</p>
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
          <Bullets items={c.photoBacklink.refreshes} max={3} />
          {c.photoBacklink.backlinksBuilt ? (
            <p className="text-[11px] line-clamp-2">{c.photoBacklink.backlinksBuilt}</p>
          ) : null}
          {c.photoBacklink.toxicRemoved ? (
            <p className="text-[10px] text-[var(--color-text-muted)] line-clamp-2">{c.photoBacklink.toxicRemoved}</p>
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
          {c.postingSocial.flyers ? <p className="text-[11px] line-clamp-2">{c.postingSocial.flyers}</p> : null}
          <Bullets items={c.postingSocial.channels} max={4} />
          {c.postingSocial.youtube ? (
            <p className="text-[10px] text-[var(--color-text-muted)] line-clamp-2">{c.postingSocial.youtube}</p>
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
            <p className="text-[10px] text-[var(--color-text-muted)] line-clamp-2 pt-1">
              {c.rankingDetail.aiOverview}
            </p>
          ) : null}
        </div>
      ),
    });
  }

  for (const chart of c.charts ?? []) {
    const first = chart.series?.[0]?.values ?? [];
    slides.push({
      label: chart.title || "Chart",
      body: (
        <div className="h-full flex flex-col justify-center gap-2">
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
          {img.caption ? (
            <div className="text-[10px] text-[var(--color-text-muted)] line-clamp-1">{img.caption}</div>
          ) : null}
        </div>
      ),
    });
  }

  if (c.whatsNext?.length) {
    slides.push({
      label: "What's next",
      body: <Bullets items={c.whatsNext} max={6} />,
    });
  }

  if (c.questions) {
    slides.push({
      label: "Questions",
      body: (
        <div className="h-full flex flex-col items-center justify-center text-center gap-1.5">
          <div className="text-sm font-semibold">{c.questions.prompt ?? "Questions?"}</div>
          {c.questions.contact ? (
            <div className="text-[10px] text-[var(--color-text-muted)]">{c.questions.contact}</div>
          ) : null}
        </div>
      ),
    });
  }

  return slides;
}

export default function DeckSlidePreviews({ content }: { content: MonthlyContent }) {
  const slides = buildSlides(content);
  return (
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
  );
}
