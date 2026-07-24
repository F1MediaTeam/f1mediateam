"use client";

// Add-on request form. Posts through requestAddOnAction, which drops the
// request into the client's message thread so the team sees it in Messages.
//
// Shows an inline confirmation rather than navigating away, so the client can
// send a second request without hunting for the page again.

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { requestAddOnAction } from "@/app/client/actions";
import { requestableMonths, type AddOn } from "@/lib/addons";

export default function AddOnRequestForm({
  addOns,
  preselected,
}: {
  addOns: AddOn[];
  /** name of the add-on whose "Request" button was clicked, if any */
  preselected?: string;
}) {
  const months = requestableMonths();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await requestAddOnAction(formData);
      if (res.error) setError(res.error);
      else setSent(true);
    });
  }

  if (sent) {
    return (
      <div className="rounded-xl border border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] p-4">
        <div className="text-sm font-semibold text-[var(--color-accent)]">Request sent</div>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          It&apos;s landed with the F1 Media team and they&apos;ll come back to you with pricing and
          timing. You can follow the conversation in Messages.
        </p>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="mt-3 text-xs font-medium text-[var(--color-accent)] hover:underline"
        >
          Request something else
        </button>
      </div>
    );
  }

  const field =
    "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40 focus:border-[var(--color-accent)]/50";

  return (
    <form action={submit} className="space-y-3">
      <div>
        <label htmlFor="addon-month" className="mb-1 block text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
          Which month is this for?
        </label>
        <select id="addon-month" name="month" className={field} defaultValue={months[0]?.label}>
          {months.map((m) => (
            <option key={m.value} value={m.label}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      {addOns.length > 0 ? (
        <div>
          <label htmlFor="addon-service" className="mb-1 block text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
            Service
          </label>
          <select id="addon-service" name="add_on" className={field} defaultValue={preselected ?? ""}>
            <option value="">Something else — described below</option>
            {addOns.map((a) => (
              <option key={a.id} value={a.name}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div>
        <label htmlFor="addon-details" className="mb-1 block text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
          What would you like added?
        </label>
        <textarea
          id="addon-details"
          name="details"
          rows={4}
          placeholder="Describe what you're after and we'll come back with pricing and timing."
          className={field + " resize-y"}
        />
      </div>

      {error ? <div className="text-xs text-red-400">{error}</div> : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send request"}
      </Button>
    </form>
  );
}
