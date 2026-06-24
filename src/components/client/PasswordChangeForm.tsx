"use client";

import { useActionState } from "react";
import { changePasswordAction } from "@/app/client/actions";
import { Button } from "@/components/ui";

const initial = { error: null as string | null, ok: null as string | null };

export default function PasswordChangeForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, initial);
  return (
    <form action={formAction} className="space-y-3">
      <label className="block">
        <span className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">
          New password
        </span>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
        />
      </label>
      <label className="block">
        <span className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">
          Confirm new password
        </span>
        <input
          name="confirm"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
        />
      </label>
      {state.error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{state.error}</div>
      ) : null}
      {state.ok ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">{state.ok}</div>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Updating…" : "Change password"}
      </Button>
    </form>
  );
}
