"use client";

// Download chips for the reports page. Lives client-side so we can pass the
// browser's IANA timezone (Intl) into the export URL — every datetime in the
// generated XLSX renders in the viewer's local time.

import { useMemo } from "react";

interface Props {
  clientId: string;
  fromIso?: string;
  toIso?: string;
  spFrom?: string;
  spTo?: string;
  range: string;
  sections: Array<[string, string]>;
}

export default function ExportLinks({ clientId, fromIso, toIso, spFrom, spTo, range, sections }: Props) {
  const tz = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return "America/Los_Angeles";
    }
  }, []);

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
      {sections.map(([sec, label]) => {
        const params = new URLSearchParams();
        if (spFrom) params.set("from", spFrom);
        if (spTo) params.set("to", spTo);
        if (range !== "custom") {
          if (!spFrom && fromIso) params.set("from", fromIso);
          if (!spTo && toIso) params.set("to", toIso);
        }
        params.set("tz", tz);
        const href = `/api/export/${clientId}/${sec}?${params.toString()}`;
        return (
          <a
            key={sec}
            href={href}
            download
            className="rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-elev)] hover:bg-[var(--color-bg-hover)] hover:border-[var(--color-accent)]/40 px-3 py-2.5 text-sm transition flex items-center justify-between"
          >
            <span>{label}</span>
            <span className="text-[var(--color-text-muted)] text-xs">.pdf ↓</span>
          </a>
        );
      })}
    </div>
  );
}
