// What a paid-data panel shows in Free Mode.
//
// Not an error, not an empty state, and above all not fake numbers: a plain
// statement of what this feature would add, roughly what it costs, and why it
// cannot be done for free. Someone reading it should be able to decide whether
// to spend the money without asking anyone.

import type { PaidFeature } from "@/lib/pulse/mode";

export default function PaidFeatureNotice({
  title,
  feature,
  freeAlternative,
}: {
  title: string;
  feature: PaidFeature;
  /** What we DO show for free instead, when there is something. */
  freeAlternative?: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--color-border-strong)] p-5">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span
          className="rounded-full border px-2 py-0.5 text-[10px] font-medium"
          style={{ borderColor: "var(--color-border-strong)", color: "var(--color-text-muted)" }}
        >
          Available with data budget
        </span>
      </div>

      <p className="text-xs leading-relaxed text-[var(--color-text)]">{feature.adds}</p>

      <dl className="mt-3 space-y-1.5 text-[11px] leading-relaxed">
        <div className="flex gap-2">
          <dt className="w-20 shrink-0 text-[var(--color-text-subtle)]">Cost</dt>
          <dd className="text-[var(--color-text-muted)]">{feature.cost}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-20 shrink-0 text-[var(--color-text-subtle)]">Why paid</dt>
          <dd className="text-[var(--color-text-muted)]">{feature.why}</dd>
        </div>
        {freeAlternative ? (
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-[var(--color-text-subtle)]">Meanwhile</dt>
            <dd className="text-[var(--color-text-muted)]">{freeAlternative}</dd>
          </div>
        ) : null}
      </dl>

      <p className="mt-3 border-t border-[var(--color-border)] pt-2 text-[10px] leading-relaxed text-[var(--color-text-subtle)]">
        Nothing is estimated or filled in here. Turning this on later is adding a key — never a rebuild.
      </p>
    </div>
  );
}
