"use client";

import { useActionState } from "react";
import { createClientUserAction } from "@/app/admin/actions";
import { Button } from "@/components/ui";

interface State { error: string | null; ok?: string }
const initial: State = { error: null };

function genPassword(): string {
  // 12-char alphanumeric, easy to read out loud (no ambiguous chars).
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  const arr = new Uint32Array(12);
  crypto.getRandomValues(arr);
  for (const v of arr) out += chars[v % chars.length];
  return out;
}

export default function CreateClientUserForm({ clientId }: { clientId: string }) {
  const [state, formAction, pending] = useActionState(
    async (_p: State, f: FormData) => createClientUserAction(f),
    initial,
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="client_id" value={clientId} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">Email</span>
          <input
            name="email"
            type="email"
            required
            placeholder="owner@theircompany.com"
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">Full name (optional)</span>
          <input
            name="full_name"
            type="text"
            placeholder="First Last"
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
          />
        </label>
      </div>
      <label className="block">
        <span className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">
          Initial password (give to customer; they&apos;ll change it after first sign-in)
        </span>
        <div className="flex gap-2">
          <input
            name="password"
            type="text"
            required
            minLength={8}
            defaultValue=""
            placeholder="At least 8 characters"
            className="flex-1 font-mono rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
            id="newpw-input"
          />
          <button
            type="button"
            onClick={(e) => {
              const input = (e.currentTarget.parentElement?.querySelector("#newpw-input") as HTMLInputElement);
              if (input) input.value = genPassword();
            }}
            className="rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-elev)] hover:bg-[var(--color-bg-hover)] px-3 text-xs"
          >
            Generate
          </button>
        </div>
      </label>

      {state.error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{state.error}</div>
      ) : null}
      {state.ok ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">{state.ok}</div>
      ) : null}

      <Button type="submit" disabled={pending} className="w-full md:w-auto">
        {pending ? "Creating…" : "Create customer account"}
      </Button>
    </form>
  );
}
