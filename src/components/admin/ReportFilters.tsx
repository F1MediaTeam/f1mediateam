"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import DateInput from "@/components/admin/DateInput";

export type ReportRange = "daily" | "weekly" | "monthly" | "yearly" | "all" | "custom";

const RANGES: { value: ReportRange; label: string }[] = [
  { value: "daily",   label: "Today" },
  { value: "weekly",  label: "7 days" },
  { value: "monthly", label: "30 days" },
  { value: "yearly",  label: "1 year" },
  { value: "all",     label: "All time" },
  { value: "custom",  label: "Custom" },
];

interface Props {
  clients: { id: string; company_name: string }[];
  defaultClientId: string;
  defaultRange: ReportRange;
  defaultFrom: string;
  defaultTo: string;
}

export default function ReportFilters({
  clients,
  defaultClientId,
  defaultRange,
  defaultFrom,
  defaultTo,
}: Props) {
  const [range, setRange] = useState<ReportRange>(defaultRange);

  return (
    <form className="flex flex-col gap-5" method="GET">
      <div className="grid grid-cols-1 md:grid-cols-[minmax(220px,1fr)_auto] gap-5 items-end">
        <div className="space-y-1.5">
          <label className="block text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]">
            Client
          </label>
          <div className="relative">
            <select
              name="client"
              defaultValue={defaultClientId}
              className="w-full appearance-none rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-elev)] hover:bg-[var(--color-bg-hover)] px-3.5 py-2.5 pr-10 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40 focus:border-[var(--color-accent)]/50"
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company_name}
                </option>
              ))}
            </select>
            <svg
              aria-hidden
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
              width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]">
            Time frame
          </label>
          <div className="inline-flex rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-elev)] p-1 gap-1">
            {RANGES.map((r) => {
              const active = range === r.value;
              return (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRange(r.value)}
                  className={cn(
                    "px-3.5 py-1.5 text-xs font-medium rounded-md transition tracking-wide",
                    active
                      ? "bg-[var(--color-accent)] text-black shadow-sm"
                      : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-hover)]",
                  )}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
          <input type="hidden" name="range" value={range} />
        </div>
      </div>

      <div
        className={cn(
          "grid grid-cols-1 md:grid-cols-2 gap-4 transition-all",
          range === "custom"
            ? "opacity-100 max-h-40"
            : "opacity-0 max-h-0 overflow-hidden pointer-events-none",
        )}
        aria-hidden={range !== "custom"}
      >
        <div className="space-y-1.5">
          <label className="block text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]">
            From
          </label>
          <DateInput name="from" defaultIso={defaultFrom} />
        </div>
        <div className="space-y-1.5">
          <label className="block text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]">
            To
          </label>
          <DateInput name="to" defaultIso={defaultTo} />
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" className="px-6">Generate</Button>
      </div>
    </form>
  );
}
