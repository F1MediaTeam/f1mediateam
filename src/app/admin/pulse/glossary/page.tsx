// What every number in F1 Pulse means, in plain English.
//
// Written to be readable by a client, not just by us — which is the point.
// Half of what an agency sells is being able to explain the number, and a page
// you can send someone beats explaining it twice on a call.

import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import AdminShell from "@/components/admin/Shell";
import PulseHeader from "@/components/admin/pulse/PulseHeader";
import { GLOSSARY_GROUPS, SOURCE_LABEL, type GlossaryEntry } from "@/lib/pulse/glossary";

export const dynamic = "force-dynamic";

const SOURCE_TONE: Record<GlossaryEntry["source"], string> = {
  measured: "var(--color-ok)",
  computed: "var(--color-accent)",
  estimated: "var(--color-warn)",
  directional: "var(--color-text-muted)",
};

export default async function PulseGlossaryPage() {
  const session = await requireAdmin();

  return (
    <AdminShell session={session} active="/admin/pulse">
      <div className="mx-auto max-w-[900px] px-4 py-6 sm:px-6 lg:px-8 sm:py-8">
        <PulseHeader
          subtitle="What every number here means, in plain English."
          crumb={
            <div className="mb-1">
              <Link href="/admin/pulse" className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
                ← All sites
              </Link>
            </div>
          }
        />

        {/* The source classes, explained once, up front — every entry below
            carries one of these tags. */}
        <div
          data-panel=""
          className="mb-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4"
        >
          <h2 className="mb-2 text-sm font-semibold">Where numbers come from</h2>
          <p className="mb-3 text-xs leading-relaxed text-[var(--color-text-muted)]">
            Every figure in F1 Pulse carries one of these tags. They are never mixed into a single
            number — a measured count and a modelled estimate always appear side by side, each labelled.
          </p>
          <dl className="space-y-2">
            {(Object.keys(SOURCE_LABEL) as Array<GlossaryEntry["source"]>).map((k) => (
              <div key={k} className="flex flex-wrap items-baseline gap-2">
                <dt
                  className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium"
                  style={{ borderColor: SOURCE_TONE[k], color: SOURCE_TONE[k] }}
                >
                  {SOURCE_LABEL[k].label}
                </dt>
                <dd className="text-xs leading-relaxed text-[var(--color-text-muted)]">
                  {SOURCE_LABEL[k].blurb}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="space-y-6">
          {GLOSSARY_GROUPS.map((group) => (
            <section key={group.group}>
              <h2 className="text-sm font-semibold">{group.group}</h2>
              <p className="mb-3 mt-0.5 text-xs leading-relaxed text-[var(--color-text-muted)]">
                {group.blurb}
              </p>

              <div className="space-y-2">
                {group.entries.map((e) => (
                  <div
                    key={e.term}
                    data-panel=""
                    className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4"
                  >
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <h3 className="text-xs font-semibold">{e.term}</h3>
                      <span
                        className="rounded-full border px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider"
                        style={{ borderColor: SOURCE_TONE[e.source], color: SOURCE_TONE[e.source] }}
                      >
                        {SOURCE_LABEL[e.source].label}
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed">{e.what}</p>
                    <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-text-muted)]">{e.why}</p>
                    {e.formula ? (
                      <p className="mt-2 border-t border-[var(--color-border)] pt-2 text-[11px] leading-relaxed text-[var(--color-text-subtle)]">
                        <span className="font-medium">How it is worked out: </span>
                        {e.formula}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <p className="mt-6 text-[10px] leading-relaxed text-[var(--color-text-subtle)]">
          Anything F1 Media Team works out itself has its rule written above rather than hidden. None of
          these are presented as another company&apos;s metric.
        </p>
      </div>
    </AdminShell>
  );
}
