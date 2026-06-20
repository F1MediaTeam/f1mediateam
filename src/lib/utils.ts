import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(n: number, opts?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat("en-US", opts).format(n);
}

export function formatPercentChange(from: number, to: number): {
  pct: number;
  label: string;
  direction: "up" | "down" | "flat";
} {
  if (from === 0) {
    const flat = to === 0;
    return { pct: 0, label: flat ? "—" : "new", direction: flat ? "flat" : "up" };
  }
  const pct = ((to - from) / Math.abs(from)) * 100;
  const direction: "up" | "down" | "flat" =
    Math.abs(pct) < 0.05 ? "flat" : pct > 0 ? "up" : "down";
  const label = `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
  return { pct, label, direction };
}

export function formatBytes(n: number | null | undefined): string {
  if (!n && n !== 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Renders a date for server output. Important: a bare "YYYY-MM-DD" parsed by
// `new Date()` is interpreted as UTC midnight, which shifts back one calendar
// day in any timezone west of UTC. Detect that shape and parse as local.
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });
  }
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function isoDate(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function formatLocation(
  a: { city?: string | null; region?: string | null; country?: string | null } | null | undefined,
): string {
  if (!a) return "—";
  const parts = [a.city, a.region].filter(Boolean) as string[];
  if (parts.length === 0) return a.country ?? "—";
  return parts.join(", ");
}
