// Full-thread view for one client. Auto-marks the client's messages as read
// when the admin lands here. Compose form is a client component so the
// admin can send a reply without a full page reload.

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";
import AdminShell from "@/components/admin/Shell";
import { Card, CardBody, CardHeader } from "@/components/ui";
import AdminReplyForm from "@/components/admin/AdminReplyForm";
import { markMessagesRead } from "@/lib/data/supabase-adapter";

export default async function AdminMessageThread({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const session = await requireAdmin();
  const { clientId } = await params;
  const client = await data.getClient(clientId);
  if (!client) notFound();

  const messages = await data.listMessages(clientId);
  // Mark all client-origin messages as read now that the admin is on the page.
  // Fire-and-forget so we don't hold up the render.
  markMessagesRead(clientId, "admin").catch(() => undefined);

  return (
    <AdminShell session={session} active="/admin/messages">
      <div className="px-8 py-8 max-w-3xl">
        <Link href="/admin/messages" className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
          ← All threads
        </Link>
        <div className="mt-2 mb-6">
          <div className="text-xs uppercase tracking-widest text-[var(--color-text-muted)]">Thread</div>
          <h1 className="text-3xl font-semibold tracking-tight mt-1">{client.company_name}</h1>
        </div>

        <Card>
          <CardHeader title="Conversation" subtitle={`${messages.length} message${messages.length === 1 ? "" : "s"}`} />
          <CardBody className="p-0">
            <div className="max-h-[60vh] overflow-y-auto px-4 py-3 space-y-3 bg-[var(--color-bg)]">
              {messages.length === 0 ? (
                <div className="text-center text-xs text-[var(--color-text-muted)] py-8">
                  No messages yet.
                </div>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={"flex " + (m.from_role === "admin" ? "justify-end" : "justify-start")}
                  >
                    <div
                      className={
                        "max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-snug " +
                        (m.from_role === "admin"
                          ? "bg-[var(--color-accent)] text-[var(--color-on-accent)] rounded-br-md"
                          : "bg-[var(--color-bg-elev)] text-[var(--color-text)] rounded-bl-md")
                      }
                    >
                      <div className="whitespace-pre-wrap break-words">{m.body}</div>
                      <div
                        className={
                          "mt-1 text-[10px] font-mono " +
                          (m.from_role === "admin"
                            ? "text-[var(--color-on-accent)]/70"
                            : "text-[var(--color-text-muted)]")
                        }
                      >
                        {m.from_role === "admin" ? "F1 Media" : client.company_name} · {new Date(m.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="border-t border-[var(--color-border)] p-3">
              <AdminReplyForm clientId={clientId} />
            </div>
          </CardBody>
        </Card>
      </div>
    </AdminShell>
  );
}
