"use client";

import { useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui";
import Time from "@/components/shared/Time";
import { formatLocation } from "@/lib/utils";
import type { LoginAudit } from "@/lib/types";

interface Props {
  audit: LoginAudit[];
}

export default function SignInHistoryCard({ audit }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <CardHeader
        title="Sign-in history"
        right={
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-elev)] hover:bg-[var(--color-bg-hover)] px-3 py-1.5 text-xs font-medium transition flex items-center gap-1.5"
          >
            {open ? "Hide" : `Show all (${audit.length})`}
            <span className={"transition-transform " + (open ? "rotate-180" : "")}>▾</span>
          </button>
        }
      />
      {open ? (
        <CardBody className="space-y-1.5 max-h-[420px] overflow-auto">
          {audit.length === 0 ? (
            <div className="text-xs text-[var(--color-text-muted)]">No history yet.</div>
          ) : (
            audit.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-2 text-xs"
              >
                <span className="font-mono">
                  <Time iso={a.logged_in_at} />
                </span>
                <span className="text-[var(--color-text-muted)]">{formatLocation(a)}</span>
              </div>
            ))
          )}
        </CardBody>
      ) : null}
    </Card>
  );
}
