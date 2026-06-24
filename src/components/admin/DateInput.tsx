"use client";

import { useState, type ChangeEvent } from "react";

interface Props {
  name: string;
  defaultIso?: string;
}

function isoToMdy(iso: string | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return "";
  return `${m[2]}/${m[3]}/${m[1]}`;
}

function mdyToIso(mdy: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(mdy);
  if (!m) return "";
  return `${m[3]}-${m[1]}-${m[2]}`;
}

function formatDigits(digits: string, deleting: boolean): string {
  const d = digits.slice(0, 8);
  if (d.length === 0) return "";
  if (d.length < 2) return d;
  if (d.length === 2) return deleting ? d : `${d}/`;
  if (d.length < 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  if (d.length === 4) {
    const base = `${d.slice(0, 2)}/${d.slice(2)}`;
    return deleting ? base : `${base}/`;
  }
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

export default function DateInput({ name, defaultIso }: Props) {
  const [value, setValue] = useState(isoToMdy(defaultIso));

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const inputType = (e.nativeEvent as InputEvent).inputType ?? "";
    const deleting = inputType.startsWith("delete");
    const digits = e.target.value.replace(/\D/g, "");
    setValue(formatDigits(digits, deleting));
  };

  return (
    <div className="relative">
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        maxLength={10}
        placeholder="MM/DD/YYYY"
        value={value}
        onChange={handleChange}
        className="w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-elev)] hover:bg-[var(--color-bg-hover)] px-3.5 py-2.5 text-sm font-medium tabular-nums transition focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40 focus:border-[var(--color-accent)]/50 placeholder:text-[var(--color-text-muted)]/50"
      />
      <input type="hidden" name={name} value={mdyToIso(value)} />
    </div>
  );
}
