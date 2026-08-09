"use client";

// Assigns one designated colour to a client.
//
// The twelve swatches are the built-in palette, chosen to stay distinguishable
// at the size of a calendar chip. A custom hex is allowed for matching a
// client's actual brand. Clearing goes back to the colour derived from the
// client's id — never to no colour at all, so the calendar is never blank.

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { CLIENT_PALETTE, clientColor, colorFromHex, isHexColor } from "@/lib/client-color";
import { setClientColorAction } from "@/app/admin/actions";

export default function ClientColorPicker({
  clientId,
  companyName,
  current,
}: {
  clientId: string;
  companyName: string;
  current: string | null;
}) {
  const [value, setValue] = useState<string | null>(current);
  const [custom, setCustom] = useState(isHexColor(current) ? current : "");
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // What the calendar will actually draw: the chosen colour, or the derived
  // one when nothing is set.
  const preview = clientColor({ id: clientId, ui_color: value });
  const isDerived = !isHexColor(value);

  function save(hex: string | null) {
    setValue(hex);
    setNote(null);
    startTransition(async () => {
      const res = await setClientColorAction({ clientId, hex });
      setNote(res.error ?? "Saved.");
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div
          className="flex h-11 min-w-[150px] items-center justify-center rounded-lg px-3 text-xs font-semibold"
          style={{ background: preview.solid, color: preview.onSolid }}
        >
          {companyName}
        </div>
        <p className="text-[11px] leading-relaxed text-[var(--color-text-muted)]">
          {isDerived
            ? "No colour chosen — this one is derived from the client's id and stays the same as clients are added."
            : "This colour is used behind the client's calendar entries and anywhere they're listed."}
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {CLIENT_PALETTE.map((hex) => {
          const c = colorFromHex(hex);
          const active = value?.toLowerCase() === hex;
          return (
            <button
              key={hex}
              type="button"
              onClick={() => save(hex)}
              disabled={pending}
              aria-label={`Use ${hex}`}
              aria-pressed={active}
              title={hex}
              className="h-8 w-8 rounded-md ring-offset-2 ring-offset-[var(--color-bg-card)] transition hover:scale-110 disabled:opacity-50"
              style={{
                background: c.solid,
                boxShadow: active ? `0 0 0 2px var(--color-text)` : "none",
              }}
            />
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="#22b8cf"
          aria-label="Custom hex colour"
          className="h-9 w-28 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-2.5 font-mono text-xs outline-none focus:border-[var(--color-border-strong)]"
        />
        <Button
          variant="secondary"
          size="sm"
          type="button"
          disabled={pending || !isHexColor(custom)}
          onClick={() => save(custom.trim().toLowerCase())}
        >
          Use this
        </Button>
        {!isDerived ? (
          <Button variant="ghost" size="sm" type="button" disabled={pending} onClick={() => save(null)}>
            Clear
          </Button>
        ) : null}
        {note ? (
          <span className="text-[11px] text-[var(--color-text-muted)]">{pending ? "Saving…" : note}</span>
        ) : null}
      </div>
    </div>
  );
}
