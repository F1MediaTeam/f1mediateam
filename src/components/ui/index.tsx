// Small set of UI primitives used across admin + client.
// Tailwind utility classes only; no extra runtime.

import { cn } from "@/lib/utils";

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-lg shadow-black/20",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  right,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 px-4 pt-5 pb-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:px-6">
      <div className="min-w-0">
        <div className="text-base font-semibold tracking-tight">{title}</div>
        {subtitle ? (
          <div className="text-xs text-[var(--color-text-muted)] mt-0.5">{subtitle}</div>
        ) : null}
      </div>
      {right ? <div className="min-w-0 max-w-full sm:shrink-0">{right}</div> : null}
    </div>
  );
}

export function CardBody({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("px-4 pb-6 sm:px-6", className)}>{children}</div>;
}

export function Stat({
  label,
  value,
  sub,
  trend,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  trend?: { direction: "up" | "down" | "flat"; label: string };
}) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-5 py-4">
      <div className="text-[11px] uppercase tracking-wider text-[var(--color-text-muted)]">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 flex items-center gap-2 text-xs">
        {trend ? (
          <span
            className={cn(
              "font-mono",
              trend.direction === "up" && "text-[var(--color-up)]",
              trend.direction === "down" && "text-[var(--color-down)]",
              trend.direction === "flat" && "text-[var(--color-text-muted)]",
            )}
          >
            {trend.label}
          </span>
        ) : null}
        {sub ? <span className="text-[var(--color-text-muted)]">{sub}</span> : null}
      </div>
    </div>
  );
}

export function Pill({
  children,
  tone = "default",
  className,
}: {
  children: React.ReactNode;
  tone?: "default" | "accent" | "warn" | "danger" | "ok";
  className?: string;
}) {
  // All status pills collapse to the brand teal — the label text communicates
  // the stage, the color stays consistent so the dashboard reads as one
  // palette. Danger keeps the red treatment so destructive states stay legible.
  const brand =
    "border-[var(--color-accent)]/40 text-[var(--color-accent)] bg-[var(--color-accent)]/10";
  const tones: Record<string, string> = {
    default: "border-[var(--color-border)] text-[var(--color-text-muted)]",
    accent: brand,
    ok: brand,
    warn: brand,
    danger: "border-red-500/30 text-red-300 bg-red-500/10",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
}) {
  const sizes = {
    sm: "h-8 px-3 text-xs",
    md: "h-10 px-4 text-sm",
  } as const;
  const variants = {
    primary:
      "bg-[var(--color-accent)] text-black hover:brightness-110 disabled:opacity-60",
    secondary:
      "border border-[var(--color-border-strong)] bg-[var(--color-bg-elev)] hover:bg-[var(--color-bg-hover)]",
    ghost:
      "hover:bg-[var(--color-bg-hover)]",
    danger:
      "border border-red-500/40 text-red-300 hover:bg-red-500/10",
  } as const;
  return (
    <button
      {...rest}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium tracking-wide transition",
        sizes[size],
        variants[variant],
        className,
      )}
    />
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/30",
        props.className,
      )}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/30",
        props.className,
      )}
    />
  );
}

export function Select({ children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...rest}
      className={cn(
        "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/30",
        rest.className,
      )}
    >
      {children}
    </select>
  );
}

export function Divider() {
  return <div className="h-px w-full bg-[var(--color-border)]" />;
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--color-border)] px-6 py-10 text-center">
      <div className="text-sm font-medium">{title}</div>
      {description ? (
        <div className="mt-1 text-xs text-[var(--color-text-muted)]">{description}</div>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
