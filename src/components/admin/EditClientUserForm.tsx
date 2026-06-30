"use client";

import { useActionState } from "react";
import { updateClientUserAction } from "@/app/admin/actions";
import { Button } from "@/components/ui";

interface Props {
  clientId: string;
  userId: string;
  initialCompanyName: string;
  initialFullName: string | null;
  initialEmail: string;
}

const initial = { error: null as string | null, ok: null as string | null };

function genPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  const arr = new Uint32Array(12);
  crypto.getRandomValues(arr);
  for (const v of arr) out += chars[v % chars.length];
  return out;
}

export default function EditClientUserForm({
  clientId,
  userId,
  initialCompanyName,
  initialFullName,
  initialEmail,
}: Props) {
  const [state, formAction, pending] = useActionState(updateClientUserAction, initial);

  const field =
    "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40 focus:border-[var(--color-accent)]/50";
  const labelCls = "block text-[11px] uppercase tracking-widest text-[var(--color-text-muted)] mb-1.5";

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="client_id" value={clientId} />
      <input type="hidden" name="user_id" value={userId} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="block">
          <span className={labelCls}>Business name</span>
          <input
            name="company_name"
            type="text"
            required
            defaultValue={initialCompanyName}
            className={field}
          />
        </label>
        <label className="block">
          <span className={labelCls}>Full name</span>
          <input
            name="full_name"
            type="text"
            defaultValue={initialFullName ?? ""}
            placeholder="First Last"
            className={field}
          />
        </label>
      </div>

      <label className="block">
        <span className={labelCls}>Account email</span>
        <input
          name="email"
          type="email"
          required
          defaultValue={initialEmail}
          className={field}
        />
      </label>

      <label className="block">
        <span className={labelCls}>New password (leave blank to keep current)</span>
        <div className="flex gap-2">
          <input
            name="password"
            type="text"
            minLength={8}
            defaultValue=""
            placeholder="At least 8 characters"
            className={"flex-1 font-mono " + field}
            id="editpw-input"
          />
          <button
            type="button"
            onClick={(e) => {
              const input = e.currentTarget.parentElement?.querySelector("#editpw-input") as HTMLInputElement | null;
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

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
