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
import { markMessagesRead, signMessageAttachments } from "@/lib/data/supabase-adapter";
import Time from "@/components/shared/Time";
import LightboxImage from "@/components/shared/LightboxImage";

export default async function AdminMessageThread({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const session = await requireAdmin();
  const { clientId } = await params;
  const client = await data.getClient(clientId);
  if (!client) notFound();

  const rawMessages = await data.listMessages(clientId);
  const messages = await Promise.all(
    rawMessages.map(async (m) => ({
      ...m,
      signedAttachments: await signMessageAttachments(m.attachments ?? []),
    })),
  );
  // Mark all client-origin messages as read now that the admin is on the page.
  // Fire-and-forget so we don't hold up the render.
  markMessagesRead(clientId, "admin").catch(() => undefined);

  return (
    <AdminShell session={session} active="/admin/messages">
      <div className="px-8 py-8 max-w-[1600px]">
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
            <div className="max-h-[60vh] overflow-y-auto px-4 py-3 space-y-3 bg-[var(--color-bg-elev)]">
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
                    <div className={"flex flex-col gap-1.5 max-w-[80%] " + (m.from_role === "admin" ? "items-end" : "items-start")}>
                      {m.signedAttachments.length > 0 ? (
                        <div className={"flex flex-wrap gap-1.5 " + (m.from_role === "admin" ? "justify-end" : "justify-start")}>
                          {m.signedAttachments.map((a, i) =>
                            a.mime_type.startsWith("image/") && a.url ? (
                              <LightboxImage key={i} src={a.url} alt={a.name} width={260} height={200} />
                            ) : (
                              <a
                                key={i}
                                href={a.url ?? "#"}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs bg-[var(--color-bg-elev)] border border-[var(--color-border)] hover:bg-[var(--color-bg-hover)] transition"
                              >
                                <span aria-hidden>📄</span>
                                <div className="min-w-0 max-w-[200px]">
                                  <div className="truncate">{a.name}</div>
                                  <div className="text-[10px] text-[var(--color-text-muted)] font-mono">
                                    {a.size < 1024 ? `${a.size} B` : a.size < 1024 * 1024 ? `${(a.size / 1024).toFixed(1)} KB` : `${(a.size / 1024 / 1024).toFixed(1)} MB`}
                                  </div>
                                </div>
                              </a>
                            ),
                          )}
                        </div>
                      ) : null}
                      {m.body.trim().length > 0 ? (
                        <div
                          className={
                            "rounded-2xl px-3.5 py-2 text-sm leading-snug shadow-sm " +
                            (m.from_role === "admin"
                              ? "bg-[var(--color-accent)] text-[var(--color-on-accent)] rounded-br-md"
                              : "bg-[var(--color-bg-card)] text-[var(--color-text)] border border-[var(--color-border)] rounded-bl-md")
                          }
                        >
                          <div className="whitespace-pre-wrap break-words">{m.body}</div>
                        </div>
                      ) : null}
                      <div className="text-[10px] font-mono text-[var(--color-text-muted)]">
                        {m.from_role === "admin" ? "F1 Media" : client.company_name} · <Time iso={m.created_at} />
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
