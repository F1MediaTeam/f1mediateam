// Admin inbox — styled like the iPhone Messages list: flat rows with inset
// hairlines, unread dot on the far left, big circular avatar, bold name with
// a right-aligned timestamp + chevron, two-line preview. Threads are keyed
// by the client company (client_id), so any customer-side user on the same
// account posts into the same conversation. Unread first, then most recent.

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

/* iMessage-style stamp: time today, "Yesterday", weekday inside a week,
   short date beyond that. */
function timeLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.floor((startOfToday.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86_400_000);
  if (days <= 0) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString("en-US", { weekday: "long" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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

  return (
    <AdminShell session={session} active="/admin/messages">
      <div className="px-6 sm:px-8 py-8 max-w-3xl">
        <div className="mb-4">
          <div className="text-xs uppercase tracking-widest text-[var(--color-text-muted)]">Inbox</div>
          <h1 className="text-3xl font-semibold tracking-tight mt-1">Messages</h1>
          {totalUnread > 0 ? (
            <div className="mt-1.5 text-sm text-[var(--color-text-muted)]">
              {totalUnread} unread message{totalUnread === 1 ? "" : "s"}
            </div>
          ) : null}
        </div>

        {sorted.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--color-border)] px-6 py-14 text-center text-sm text-[var(--color-text-muted)]">
            No clients yet — threads appear here as soon as a client account exists.
          </div>
        ) : (
          <ul>
            {sorted.map((c) => {
              const unread = unreadByClient.get(c.id) ?? 0;
              const last = latestByClient.get(c.id);
              const hasUnread = unread > 0;
              return (
                <li key={c.id}>
                  <Link
                    href={`/admin/messages/${c.id}`}
                    className="group flex items-center gap-3 rounded-xl px-2 transition-colors hover:bg-[var(--color-bg-hover)] active:bg-[var(--color-bg-hover)]"
                  >
                    {/* Unread dot column — fixed width so read rows stay aligned */}
                    <span className="w-2.5 shrink-0" aria-hidden>
                      {hasUnread ? (
                        <span className="block h-2.5 w-2.5 rounded-full bg-[var(--color-accent)]" />
                      ) : null}
                    </span>

                    {/* Avatar */}
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gradient-to-b from-[#4a5568] to-[#2b3442] text-[15px] font-semibold text-white/90">
                      {initials(c.company_name)}
                    </span>

                    {/* Text block — carries the inset hairline like iMessage */}
                    <span className="min-w-0 flex-1 border-b border-[var(--color-border)] py-3 group-hover:border-transparent">
                      <span className="flex items-center gap-2">
                        <span className={"min-w-0 flex-1 truncate text-[15px] " + (hasUnread ? "font-bold" : "font-semibold")}>
                          {c.company_name}
                        </span>
                        <span className="shrink-0 text-[13px] tabular-nums text-[var(--color-text-muted)]">
                          {last ? timeLabel(last.created_at) : ""}
                        </span>
                        <svg
                          aria-hidden
                          className="h-3 w-3 shrink-0 text-[var(--color-text-subtle)]"
                          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                        >
                          <path d="m9 6 6 6-6 6" />
                        </svg>
                      </span>
                      <span className="mt-0.5 block pr-7 text-sm leading-snug text-[var(--color-text-muted)] line-clamp-2">
                        {last
                          ? `${last.from_role === "admin" ? "You: " : ""}${last.body || "Sent an attachment"}`
                          : "No messages yet — start the conversation."}
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
