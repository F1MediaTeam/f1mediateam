// SEO metric drill-in page. URL: /client/seo/<slug>
//
// Each slug renders its own detail view (trend chart + supporting data).
// Slugs come from src/components/shared/SeoMetricsRow.tsx. Metrics we don't
// yet collect surface a friendly "Coming soon" placeholder so the card on
// the overview is still clickable.

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireClient } from "@/lib/auth/session";
import { data } from "@/lib/data";
import ClientShell from "@/components/client/Shell";
import { Card, CardBody, CardHeader, Pill } from "@/components/ui";
import MetricCompare from "@/components/shared/MetricCompare";
import OrganicKeywordsPanel from "@/components/shared/OrganicKeywordsPanel";

interface SlugMeta {
  label: string;
  source: "available" | "coming_soon";
  metric?: string;
  unit?: string;
  invert?: boolean;
  aggregation?: "sum" | "average";
  hint?: string;
  /** Provider responsible for the data — surfaced in the breadcrumb pill. */
  provider?: string;
  /** What we still need to wire up to make this drill-in real. */
  pending?: string;
}

const SLUGS: Record<string, SlugMeta> = {
  visibility: {
    label: "Visibility",
    source: "available",
    metric: "visibility",
    aggregation: "average",
    provider: "Google Search Console",
    hint: "Share of search visibility across tracked keywords.",
  },
  "organic-traffic": {
    label: "Organic Traffic",
    source: "available",
    metric: "semrush_organic_traffic",
    aggregation: "sum",
    provider: "SEMrush",
    hint: "Estimated monthly organic visits across all ranked keywords.",
  },
  "organic-keywords": {
    label: "Organic Keywords",
    source: "available",
    metric: "semrush_organic_keywords",
    aggregation: "sum",
    provider: "SEMrush",
    hint: "Number of keyword phrases the domain ranks for in Google.",
  },
  "site-health": {
    label: "Site Health",
    source: "coming_soon",
    pending: "SEMrush Site Audit sync (Site Audit Bot config + audit_id table).",
  },
  "ai-visibility": {
    label: "AI Visibility",
    source: "coming_soon",
    pending: "AI search-engine tracking (e.g. SEMrush AI Visibility, Profound, or Otterly). Not yet on the F1 Media data plan.",
  },
  mentions: {
    label: "Mentions",
    source: "coming_soon",
    pending: "Brand monitoring sync (SEMrush Brand Monitoring or equivalent).",
  },
  backlinks: {
    label: "Backlinks",
    source: "coming_soon",
    pending: "SEMrush Backlinks API integration — adds new_backlinks / lost_backlinks / total_backlinks metrics.",
  },
};

export default async function SeoDrillIn({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await requireClient();
  const { slug } = await params;
  const meta = SLUGS[slug];
  if (!meta) notFound();

  const client = await data.getClient(session.client_id!);
  if (!client) notFound();

  return (
    <ClientShell session={session} client={client} active="/client">
      <div className="mb-6">
        <Link
          href="/client"
          className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          ← Back to overview
        </Link>
        <div className="mt-2 flex items-center gap-3 flex-wrap">
          <div className="text-xs uppercase tracking-widest text-[var(--color-text-muted)]">
            SEO drill-in
          </div>
          {meta.provider ? <Pill>{meta.provider}</Pill> : null}
        </div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{meta.label}</h1>
        {meta.hint ? (
          <p className="text-sm text-[var(--color-text-muted)] mt-1 max-w-2xl">{meta.hint}</p>
        ) : null}
      </div>

      {meta.source === "coming_soon" ? (
        <Card>
          <CardHeader title="Coming soon" />
          <CardBody>
            <p className="text-sm text-[var(--color-text-muted)] max-w-2xl">
              We don&apos;t collect this metric yet. {meta.pending}
            </p>
            <p className="text-xs text-[var(--color-text-subtle)] mt-4">
              Ask your F1 Media account lead if you&apos;d like this prioritised.
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-6">
          <MetricCompare
            clientId={client.id}
            metric={meta.metric!}
            label={meta.label}
            hint={meta.hint}
            invert={meta.invert}
            aggregation={meta.aggregation}
            unit={meta.unit}
          />

          {slug === "organic-keywords" ? (
            <Card>
              <CardHeader title="Top ranked keywords" subtitle="Live from SEMrush — sorted by traffic share" />
              <CardBody>
                <OrganicKeywordsPanel clientId={client.id} />
              </CardBody>
            </Card>
          ) : null}
        </div>
      )}
    </ClientShell>
  );
}
