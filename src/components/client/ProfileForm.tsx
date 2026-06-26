"use client";

// Business profile on the client portal Settings page. The "name" here is
// the business name (clients.company_name) and the "email" is the email
// tied to this client's portal account (the customer-side user), not
// whoever happens to be signed in (which may be an impersonating admin).

import { useActionState } from "react";
import { updateProfileAction } from "@/app/client/actions";
import { Button } from "@/components/ui";

interface Props {
  initialCompanyName: string;
  accountEmail: string | null;
}

const initialState = { error: null as string | null, ok: null as string | null };

export default function ProfileForm({ initialCompanyName, accountEmail }: Props) {
  const [state, formAction, pending] = useActionState(updateProfileAction, initialState);

  const field =
    "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40 focus:border-[var(--color-accent)]/50";
  const readOnlyField =
    "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-2.5 text-sm text-[var(--color-text-muted)] cursor-not-allowed";
  const labelCls = "block text-[11px] uppercase tracking-widest text-[var(--color-text-muted)] mb-1.5";

  return (
    <form action={formAction} className="space-y-3.5">
      <div>
        <label htmlFor="company_name" className={labelCls}>Business name</label>
        <input
          id="company_name"
          name="company_name"
          required
          defaultValue={initialCompanyName}
          placeholder="Your business"
          className={field}
        />
        <p className="mt-1 text-[10px] text-[var(--color-text-subtle)]">
          Shows on your dashboard header and in reports we send.
        </p>
      </div>
      <div>
        <label htmlFor="email" className={labelCls}>Account email</label>
        <input
          id="email"
          value={accountEmail ?? "No portal account on file"}
          readOnly
          className={readOnlyField}
        />
        <p className="mt-1 text-[10px] text-[var(--color-text-subtle)]">
          Email tied to your portal sign-in. To change it, ask your F1 Media account manager.
        </p>
      </div>

      {state.error ? (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{state.error}</div>
      ) : null}
      {state.ok ? (
        <div className="rounded-lg border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 px-3 py-2 text-xs text-[var(--color-accent)]">{state.ok}</div>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}
