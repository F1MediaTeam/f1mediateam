// Admin inbox — one row per client with the unread count from that client's
// side. Clicking a row opens the full thread page. Threads are keyed by the
// client company (client_id), so any customer-side user on the same account
// posts into the same conversation.

import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";
import AdminShell from "@/components/admin/Shell";
import { Card, CardBody, CardHeader } from "@/components/ui";

export default async function AdminMessagesInbox() {
  const session = await requireAdmin();
  const [clients, unreadByClient] = await Promise.all([
    data.listClients(),
    data.listUnreadCountsByClient(),
  ]);

  // Sort clients with unread first, then alphabetically.
  const sorted = [...clients].sort((a, b) => {
    const ua = unreadByClient.get(a.id) ?? 0;
    const ub = unreadByClient.get(b.id) ?? 0;
    if (ua !== ub) return ub - ua;
    return a.company_name.localeCompare(b.company_name);
  });

  const totalUnread = Array.from(unreadByClient.values()).reduce((a, n) => a + n, 0);

  return (
    <AdminShell session={session} active="/admin/messages">
      <div className="px-8 py-8 max-w-5xl">
        <div className="mb-8">
          <div className="text-xs uppercase tracking-widest text-[var(--color-text-muted)]">Inbox</div>
          <h1 className="text-3xl font-semibold tracking-tight mt-1">
            Client messages
            {totalUnread > 0 ? (
              <span className="ml-3 text-base align-middle rounded-full bg-red-500 text-white px-2.5 py-0.5">
                {totalUnread} new
              </span>
            ) : null}
          </h1>
          <div className="mt-1 text-sm text-[var(--color-text-muted)]">
            One thread per client. Anyone signed in as that company sees the same conversation.
          </div>
        </div>

        <Card>
          <CardHeader title="Threads" subtitle="Sorted by unread first" />
          <CardBody className="p-0">
            {sorted.length === 0 ? (
              <div className="p-6 text-center text-sm text-[var(--color-text-muted)]">
                No clients yet.
              </div>
            ) : (
              <ul className="divide-y divide-[var(--color-border)]">
                {sorted.map((c) => {
                  const unread = unreadByClient.get(c.id) ?? 0;
                  return (
                    <li key={c.id}>
                      <Link
                        href={`/admin/messages/${c.id}`}
                        className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--color-bg-hover)] transition"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {unread > 0 ? (
                            <span className="min-w-[22px] h-[22px] rounded-full bg-red-500 text-white text-[11px] font-semibold flex items-center justify-center tabular-nums px-1.5">
                              {unread > 99 ? "99+" : unread}
                            </span>
                          ) : (
                            <span className="w-[22px] h-[22px] rounded-full border border-[var(--color-border)]" aria-hidden />
                          )}
                          <span className="text-sm font-medium truncate">{c.company_name}</span>
                        </div>
                        <span className="text-[var(--color-accent)] text-xs">Open →</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </AdminShell>
  );
}
