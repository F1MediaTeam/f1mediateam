import { Fragment } from "react";
import { requireClient } from "@/lib/auth/session";
import { data } from "@/lib/data";
import ClientShell from "@/components/client/Shell";
import { Card, CardBody, CardHeader, Pill, Button } from "@/components/ui";
import Time from "@/components/shared/Time";
import { approveContentAction, requestChangesAction, addClientContentAction } from "../actions";
import ContentCardControls from "@/components/shared/ContentCardControls";
import ContentDetailModal from "@/components/shared/ContentDetailModal";
import type { ContentStage } from "@/lib/types";

const STAGES: { stage: ContentStage; label: string; tone: "warn" | "accent" | "ok" }[] = [
  { stage: "proposed", label: "Awaiting your approval", tone: "warn" },
  { stage: "pending",  label: "Approved — being posted", tone: "accent" },
  { stage: "posted",   label: "Live",                    tone: "ok" },
];

export default async function ClientContent() {
  const session = await requireClient();
  const client = await data.getClient(session.client_id!);
  if (!client) return null;
  const cards = await data.listContent({ clientId: client.id });
  const eventLists = await Promise.all(cards.map((c) => data.listContentEvents(c.id)));
  const eventsByCard = new Map(cards.map((c, i) => [c.id, eventLists[i]]));

  return (
    <ClientShell session={session} client={client} active="/client/content">
      <div className="mb-8">
        <div className="text-xs uppercase tracking-widest text-[var(--color-text-muted)]">
          Content
        </div>
        <h1 className="text-3xl font-semibold tracking-tight mt-1">Approvals & live posts</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Items in the first column are waiting for you. Approve to send them to be posted, or request changes.
        </p>
      </div>

      <div className="space-y-6">
        {STAGES.map(({ stage, label, tone }) => {
          const col = cards.filter((c) => c.stage === stage);
          return (
            <Fragment key={stage}>
            {stage === "posted" ? <AddContentLauncher /> : null}
            <Card className="flex flex-col">
              <CardHeader title={<Pill tone={tone}>{label}</Pill>} />
              <CardBody className="space-y-2 flex-1 max-h-[65vh] overflow-y-auto">
                {col.length === 0 ? (
                  <div className="text-xs text-[var(--color-text-subtle)] text-center py-6">Empty.</div>
                ) : (
                  col.map((card) => {
                    const events = eventsByCard.get(card.id) ?? [];
                    return (
                      <div
                        key={card.id}
                        className="relative rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-3"
                      >
                        {/* 3-dot menu — only renders an item on proposed cards (Request changes) */}
                        <div className="absolute top-2 right-2">
                          <ContentCardControls
                            card={{ id: card.id, title: card.title, body: card.body, link: card.link, stage: card.stage }}
                            role="client"
                            updateAction={approveContentAction /* placeholder — client edits not enabled yet */}
                            requestChangesAction={requestChangesAction}
                          />
                        </div>

                        <ContentDetailModal
                          triggerClassName="block w-full text-left pr-8"
                          card={{ id: card.id, title: card.title, body: card.body, link: card.link, stage: card.stage, created_at: card.created_at, updated_at: card.updated_at }}
                          companyName={client.company_name}
                          events={events.map((e) => ({ id: e.id, created_at: e.created_at, from_stage: e.from_stage, to_stage: e.to_stage, actor_role: e.actor_role, note: e.note }))}
                          triggerLabel={
                            <>
                              <div className="text-sm font-medium leading-snug">{card.title}</div>
                              <div className="mt-1 text-[11px] text-[var(--color-text-muted)] font-mono">
                                {client.company_name} · updated <Time iso={card.updated_at} />
                              </div>
                              {card.body ? (
                                <div className="mt-2 text-xs text-[var(--color-text-muted)] line-clamp-3">{card.body}</div>
                              ) : null}
                              <div className="mt-2 text-[10px] text-[var(--color-accent)] opacity-70">Click for details ↗</div>
                            </>
                          }
                        />

                        {stage === "proposed" ? (
                          card.created_by === session.user_id ? (
                            <div className="mt-3 text-[11px] italic text-[var(--color-text-muted)]">
                              Submitted — pending our review.
                            </div>
                          ) : (
                            <form action={approveContentAction} className="mt-3">
                              <input type="hidden" name="id" value={card.id} />
                              <Button size="sm" type="submit" className="w-full">Approve</Button>
                            </form>
                          )
                        ) : null}
                      </div>
                    );
                  })
                )}
              </CardBody>
            </Card>
            </Fragment>
          );
        })}
      </div>
    </ClientShell>
  );
}

function AddContentLauncher() {
  const inputCls =
    "w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40";
  return (
    <details className="rounded-xl border border-dashed border-[var(--color-border-strong)] bg-[var(--color-bg-elev)]">
      <summary className="cursor-pointer list-none select-none px-4 py-3 text-sm font-medium text-[var(--color-accent)] flex items-center gap-2">
        <span className="text-lg leading-none">＋</span> Add content
      </summary>
      <form action={addClientContentAction} className="px-4 pb-4 pt-1 space-y-2">
        <p className="text-[11px] text-[var(--color-text-muted)]">
          Propose something for us to post or review. It goes to our team as a proposal.
        </p>
        <input name="title" required placeholder="Title" className={inputCls} />
        <input name="link" type="url" placeholder="Optional link (https://…)" className={inputCls} />
        <textarea name="body" rows={2} placeholder="Notes — what you'd like us to post or review" className={inputCls} />
        <div className="flex justify-end">
          <Button size="sm" type="submit">Submit for review</Button>
        </div>
      </form>
    </details>
  );
}
