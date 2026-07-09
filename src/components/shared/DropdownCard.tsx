// Collapsible card section: native <details> so it works in server components
// without client JS. Collapsed by default — the header row carries the title
// and count, expanding reveals the full content.

import { Card } from "@/components/ui";

export default function DropdownCard({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <details className="group">
        <summary className="flex cursor-pointer select-none items-center justify-between gap-4 px-4 py-5 sm:px-6 list-none [&::-webkit-details-marker]:hidden rounded-2xl transition-colors hover:bg-[var(--color-bg-hover)]">
          <span className="min-w-0">
            <span className="block text-base font-semibold tracking-tight">{title}</span>
            <span className="mt-0.5 block text-xs text-[var(--color-text-muted)]">{subtitle}</span>
          </span>
          <span
            aria-hidden
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[var(--color-border-strong)] text-[var(--color-text-muted)] transition-transform group-open:rotate-180"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </span>
        </summary>
        <div className="px-4 pb-6 sm:px-6 border-t border-[var(--color-border)] pt-4">
          {children}
        </div>
      </details>
    </Card>
  );
}
