import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";
import AdminShell from "@/components/admin/Shell";
import { Card, CardBody, CardHeader, Pill, Button } from "@/components/ui";
import Time from "@/components/shared/Time";
import { advanceContentAction, createContentAction, deleteContentAction } from "../actions";
import AdminContentAddModal from "@/components/admin/AdminContentAddModal";
import type { ContentStage } from "@/lib/types";

const STAGES: { stage: ContentStage; label: string; tone: "warn" | "accent" | "ok" }[] = [
  { stage: "proposed", label: "Proposed", tone: "warn" },
  { stage: "pending",  label: "Pending",  tone: "accent" },
  { stage: "posted",   label: "Posted",   tone: "ok" },
];

export default async function AdminContent({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const session = await requireAdmin();
  const { client: clientFilter } = await searchParams;
  const [clients, cards] = await Promise.all([
    data.listClients(),
    data.listContent({ clientId: clientFilter }),
  ]);
  const eventsByCard = new Map<string, Awaited<ReturnType<typeof data.listContentEvents>>>();
  const eventLists = await Promise.all(cards.map((c) => data.listContentEvents(c.id)));
  cards.forEach((c, i) => eventsByCard.set(c.id, eventLists[i]));
  const clientNameOf = (id: string) => clients.find((c) => c.id === id)?.company_name ?? "—";

  return (
    <AdminShell session={session} active="/admin/content">
      <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-[1600px] mx-auto">
        <div className="flex items-end justify-between mb-8 gap-3 flex-wrap">
          <div>
            <div className="text-xs uppercase tracking-widest text-[var(--color-text-muted)]">
              Content approvals
            </div>
            <h1 className="text-3xl font-semibold tracking-tight mt-1">
              Proposed → Pending → Posted
            </h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <form className="flex items-center gap-2">
              <span className="text-xs text-[var(--color-text-muted)]">Client:</span>
              <select
                name="client"
                defaultValue={clientFilter ?? ""}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
              >
                <option value="">All</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
              </select>
              <Button size="sm" variant="secondary" type="submit">Filter</Button>
            </form>
            <AdminContentAddModal action={createContentAction} clients={clients} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-4 lg:gap-6 mb-8 items-stretch">
          {STAGES.map(({ stage, label, tone }) => {
            const col = cards.filter((c) => c.stage === stage);
            const changeReqCount =
              stage === "proposed"
                ? col.filter((c) => {
                    const ev = (eventsByCard.get(c.id) ?? [])[0];
                    return ev && (ev.note ?? "").startsWith("CHANGES REQUESTED");
                  }).length
                : 0;
            return (
              <Card key={stage} className="flex flex-col h-full">
                <CardHeader
                  title={
                    <span className="flex items-center gap-2">
                      <Pill tone={tone}>{label}</Pill>
                      {changeReqCount > 0 ? (
                        <span className="rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/40 px-2 py-0.5 text-[10px] font-semibold">
                          {changeReqCount} change{changeReqCount > 1 ? "s" : ""} requested
                        </span>
                      ) : null}
                    </span>
                  }
                  right={<span className="font-mono text-xs text-[var(--color-text-muted)]">{col.length}</span>}
                />
                <CardBody className="space-y-2 flex-1 max-h-[65vh] overflow-y-auto">
                  {col.length === 0 ? (
                    <div className="text-xs text-[var(--color-text-subtle)] py-4 text-center">
                      Empty.
                    </div>
                  ) : (
                    col.map((card) => {
                      const events = eventsByCard.get(card.id) ?? [];
                      // An open change request = the latest event on a still-proposed
                      // card is a client "CHANGES REQUESTED" note.
                      const latest = events[0];
                      const changeRequest =
                        card.stage === "proposed" && latest && (latest.note ?? "").startsWith("CHANGES REQUESTED")
                          ? (latest.note ?? "").replace(/^CHANGES REQUESTED:\s*/, "")
                          : null;
                      return (
                        <div
                          key={card.id}
                          className={
                            "rounded-lg border bg-[var(--color-bg-elev)] p-3 min-w-0 overflow-hidden " +
                            (changeRequest ? "border-amber-500/50" : "border-[var(--color-border)]")
                          }
                        >
                          <div className="text-sm font-medium leading-snug break-words">{card.title}</div>
                          <div className="mt-1 text-[11px] text-[var(--color-text-muted)] font-mono break-words">
                            {clientNameOf(card.client_id)} · updated <Time iso={card.updated_at} />
                          </div>
                          {changeRequest ? (
                            <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-2">
                              <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-400">
                                ⚠ Changes requested by client
                              </div>
                              <div className="mt-0.5 text-xs text-amber-200 leading-snug break-words">{changeRequest}</div>
                            </div>
                          ) : null}
                          {card.body ? (
                            <div className="mt-2 text-xs text-[var(--color-text-muted)] line-clamp-3 break-words">
                              {card.body}
                            </div>
                          ) : null}
                          {card.link ? (
                            <a
                              href={card.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-2 block text-xs text-[var(--color-accent)] hover:underline truncate"
                              title={card.link}
                            >
                              {card.link.replace(/^https?:\/\//, "")} ↗
                            </a>
                          ) : null}

                          {events.length ? (
                            <div className="mt-2 border-t border-[var(--color-border)] pt-2 space-y-0.5 text-[10px] text-[var(--color-text-subtle)] break-words">
                              {events.slice(0, 3).map((e) => (
                                <div key={e.id}>
                                  <span className="font-mono"><Time iso={e.created_at} /></span>{" "}
                                  · {e.actor_role}{" "}
                                  {e.from_stage ? `${e.from_stage} → ${e.to_stage}` : e.to_stage}
                                  {e.note ? ` · ${e.note}` : ""}
                                </div>
                              ))}
                            </div>
                          ) : null}

                          {/* Action buttons stack on narrow columns so 'Mark posted'
                              doesn't overlap 'Back'. */}
                          <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:gap-1.5 gap-1.5">
                            {stage !== "proposed" ? (
                              <form action={advanceContentAction}>
                                <input type="hidden" name="id" value={card.id} />
                                <input type="hidden" name="direction" value="back" />
                                <Button size="sm" variant="ghost" type="submit" className="w-full sm:w-auto">← Back</Button>
                              </form>
                            ) : null}
                            {stage !== "posted" ? (
                              <form action={advanceContentAction}>
                                <input type="hidden" name="id" value={card.id} />
                                <input type="hidden" name="direction" value="forward" />
                                <Button size="sm" type="submit" className="w-full sm:w-auto">
                                  {stage === "proposed" ? "Approve →" : "Mark posted →"}
                                </Button>
                              </form>
                            ) : null}
                            <form
                              action={deleteContentAction}
                              className="sm:ml-auto"
                            >
                              <input type="hidden" name="id" value={card.id} />
                              <Button
                                size="sm"
                                variant="ghost"
                                type="submit"
                                title="Delete card"
                                className="text-[var(--color-text-muted)] hover:text-red-400 w-full sm:w-auto"
                              >
                                Delete
                              </Button>
                            </form>
                          </div>
                        </div>
                      );
                    })
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>

      </div>
    </AdminShell>
  );
}
