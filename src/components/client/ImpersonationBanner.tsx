import { endImpersonateAction } from "@/app/admin/actions";

export default function ImpersonationBanner({ clientName }: { clientName: string }) {
  return (
    <div className="border-b border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 backdrop-blur">
      <div className="max-w-7xl mx-auto px-6 py-2.5 flex items-center justify-between gap-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-[var(--color-accent)] animate-pulse" />
          <span className="text-[var(--color-accent)]">
            Viewing as <span className="font-semibold">{clientName}</span>. Their settings page records this session.
          </span>
        </div>
        <form action={endImpersonateAction}>
          <button className="rounded-md border border-[var(--color-accent)]/50 hover:bg-[var(--color-accent)]/20 px-3 py-1 text-xs font-medium text-[var(--color-accent)]">
            Exit view-as
          </button>
        </form>
      </div>
    </div>
  );
}
