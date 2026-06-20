"use client";

import { useTransition } from "react";
import { acceptDisclaimerAction } from "@/app/client/actions";

export default function DisclaimerGate({
  text,
  version,
  userName,
}: {
  text: string;
  version: string;
  userName: string;
}) {
  const [pending, start] = useTransition();
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-8 shadow-2xl shadow-black/50">
        <div className="text-xs font-mono uppercase tracking-widest text-[var(--color-text-muted)]">
          F1 Media — Portal terms · {version}
        </div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">
          Welcome, {userName}
        </h2>
        <div className="mt-6 max-h-72 overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-4 text-sm leading-relaxed text-[var(--color-text-muted)] whitespace-pre-line">
          {text}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            start(() => acceptDisclaimerAction());
          }}
          className="mt-6"
        >
          <button
            disabled={pending}
            className="w-full rounded-lg bg-[var(--color-accent)] py-3 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-60"
          >
            {pending ? "Saving…" : "I understand — continue to portal"}
          </button>
        </form>
      </div>
    </div>
  );
}
