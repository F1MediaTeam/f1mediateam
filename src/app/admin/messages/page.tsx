// Admin inbox — one rich row per client thread: avatar initials, last-message
// preview, relative timestamp, unread badge. Threads are keyed by the client
// company (client_id), so any customer-side user on the same account posts
// into the same conversation. Unread first, then most recently active.

import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";
import AdminShell from "@/components/admin/Shell";

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function AdminMessagesInbox() {
  const session = await requireAdmin();
  const [clients, unreadByClient, latestByClient] = await Promise.all([
    data.listClients(),
    data.listUnreadCountsByClient(),
    data.listLatestMessagesByClient(),
  ]);

  // Unread first, then most recently active, then alphabetical.
  const sorted = [...clients].sort((a, b) => {
    const ua = unreadByClient.get(a.id) ?? 0;
    const ub = unreadByClient.get(b.id) ?? 0;
    if ((ua > 0) !== (ub > 0)) return ub - ua;
    const ta = latestByClient.get(a.id)?.created_at ?? "";
    const tb = latestByClient.get(b.id)?.created_at ?? "";
    if (ta !== tb) return tb.localeCompare(ta);
    return a.company_name.localeCompare(b.company_name);
  });

  const totalUnread = Array.from(unreadByClient.values()).reduce((a, n) => a + n, 0);
  const activeThreads = sorted.filter((c) => latestByClient.has(c.id)).length;

  return (
    <AdminShell session={session} active="/admin/messages">
      <div className="px-6 sm:px-8 py-8 max-w-5xl">
        <div className="mb-8">
          <div className="text-xs uppercase tracking-widest text-[var(--color-text-muted)]">Inbox</div>
          <h1 className="text-3xl font-semibold tracking-tight mt-1">Client messages</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[var(--color-text-muted)]">
            {totalUnread > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 border border-red-500/40 text-red-300 px-2.5 py-0.5 text-xs font-semibold">
                {totalUnread} unread
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] px-2.5 py-0.5 text-xs">
                All caught up
              </span>
            )}
            <span>
              {sorted.length} client{sorted.length === 1 ? "" : "s"} · {activeThreads} active thread{activeThreads === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        {sorted.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--color-border)] px-6 py-14 text-center text-sm text-[var(--color-text-muted)]">
            No clients yet — threads appear here as soon as a client account exists.
          </div>
        ) : (
          <ul className="space-y-3">
            {sorted.map((c) => {
              const unread = unreadByClient.get(c.id) ?? 0;
              const last = latestByClient.get(c.id);
              const hasUnread = unread > 0;
              return (
                <li key={c.id}>
                  <Link
                    href={`/admin/messages/${c.id}`}
                    className={[
                      "group relative flex items-center gap-4 rounded-2xl border px-5 py-4 transition-colors",
                      hasUnread
                        ? "border-[var(--color-accent)]/45 bg-[var(--color-accent)]/[0.07] hover:bg-[var(--color-accent)]/[0.12]"
                        : "border-[var(--color-border)] bg-[var(--color-bg-card)] hover:bg-[var(--color-bg-hover)]",
                    ].join(" ")}
                  >
                    {/* Avatar */}
                    <span
                      className={[
                        "grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-bold tracking-wide",
                        hasUnread
                          ? "bg-[var(--color-accent)] text-[var(--color-on-accent)]"
                          : "border border-[var(--color-border-strong)] bg-[var(--color-bg-elev)] text-[var(--color-accent)]",
                      ].join(" ")}
                    >
                      {initials(c.company_name)}
                    </span>

                    {/* Name + preview */}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className={["truncate text-[15px]", hasUnread ? "font-semibold" : "font-medium"].join(" ")}>
                          {c.company_name}
                        </span>
                        {hasUnread ? (
                          <span className="shrink-0 rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-white">
                            {unread > 99 ? "99+" : unread} new
                          </span>
                        ) : null}
                      </span>
                      <span
                        className={[
                          "mt-0.5 block truncate text-sm",
                          hasUnread ? "text-[var(--color-text)]" : "text-[var(--color-text-muted)]",
                        ].join(" ")}
                      >
                        {last
                          ? `${last.from_role === "admin" ? "You: " : ""}${last.body || "Sent an attachment"}`
                          : "No messages yet — start the conversation."}
                      </span>
                    </span>

                    {/* Time + affordance */}
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-xs tabular-nums text-[var(--color-text-muted)]">
                        {last ? timeAgo(last.created_at) : "—"}
                      </span>
                      <span className="text-xs font-medium text-[var(--color-accent)] opacity-70 transition-opacity group-hover:opacity-100">
                        Open →
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AdminShell>
  );
}
