import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";
import AdminShell from "@/components/admin/Shell";
import { clientColorById } from "@/lib/client-color";
import { Card, CardBody, CardHeader, Pill, Button } from "@/components/ui";
import Time from "@/components/shared/Time";
import { buildMonthGrid } from "@/lib/timezone";
import {
  advanceContentAction,
  createContentAction,
  createCalendarAction,
  rescheduleCalendarAction,
  deleteContentAction,
  updateContentAction,
  adminRequestChangesAction,
} from "../actions";
import AdminContentAddModal from "@/components/admin/AdminContentAddModal";
import AdminCalendarAddModal from "@/components/admin/AdminCalendarAddModal";
import CalendarMonth, { type CalEvent } from "@/components/shared/CalendarMonth";
import ContentCardControls from "@/components/shared/ContentCardControls";
import ContentDetailModal from "@/components/shared/ContentDetailModal";
import IncrementalList from "@/components/shared/IncrementalList";
import RequestChangesModal from "@/components/client/RequestChangesModal";
import { visibleCards } from "@/lib/content-visibility";
import type { ContentStage } from "@/lib/types";

const STAGES: { stage: ContentStage; label: string; tone: "warn" | "accent" | "ok" }[] = [
  { stage: "proposed", label: "Proposed", tone: "warn" },
  { stage: "pending",  label: "Pending",  tone: "accent" },
  { stage: "posted",   label: "Posted",   tone: "ok" },
];

// This page used to derive its own colours: a hue hashed from the client id,
// plus hard-coded overrides matched on company name — a CMYK strip for Buckets
// Of Ink, light blue for Precision Graphics. That was a third independent
// colour system, so the same client could read cyan on the calendar, light
// blue here, and something else again on the dashboard.
//
// It now uses the one designated colour from the client record, like
// everywhere else.
function companyAccent(clients: Array<{ id: string; ui_color?: string | null }>, clientId: string): string {
  return clientColorById(clientId, clients).hex;
}

export default async function AdminContent({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const session = await requireAdmin();
  const { client: clientFilter } = await searchParams;
  const [clients, allCards, calendarEvents, people] = await Promise.all([
    data.listClients(),
    data.listContent({ clientId: clientFilter }),
    // Same filter drives the calendar: "All" shows every client, a chip narrows
    // it to that one client's events.
    data.listCalendar(clientFilter ? { clientId: clientFilter } : undefined),
    data.listAssignablePeople(),
  ]);
  // Posted cards older than the cutoff drop off the board (see
  // lib/content-visibility.ts). Applied before the per-stage split so the
  // column counts match what's actually listed.
  const cards = visibleCards(allCards);
  // Batched: one query for all cards instead of N parallel queries
  const [eventsByCard, imagesByCard] = await Promise.all([
    data.listContentEventsByCards(cards.map((c) => c.id)),
    data.listContentImagesByCards(cards.map((c) => c.id)),
  ]);
  const clientNameOf = (id: string) => clients.find((c) => c.id === id)?.company_name ?? "—";

  // Calendar for the current month, colored per client and filtered by the same
  // ?client= chip as the board.
  const {
    days: calDays,
    monthLabel: calMonthLabel,
    monthKey: calMonthKey,
  } = buildMonthGrid();
  const calEvents: CalEvent[] = calendarEvents.map((e) => ({
    id: e.id,
    title: e.title,
    type: e.type,
    starts_at: e.starts_at,
    notes: e.notes,
    clientLabel: e.client_id ? clientNameOf(e.client_id) : "F1 Media (internal)",
    // Neutral chip so the client's own dot color (below) reads clearly — the
    // same companyAccent that colors the filter chips above.
    chipClass: "bg-[var(--color-bg-hover)] text-[var(--color-text)]",
    accentColor: e.client_id
      ? companyAccent(clients, e.client_id)
      : undefined,
  }));
  const filteredClientName = clientFilter ? clientNameOf(clientFilter) : null;

  return (
    <AdminShell session={session} active="/admin/content">
      {/* Filtering to one client scopes the whole page to them, so its panels
          take that client's colour instead of the house red. */}
      <div
        className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-[1600px] mx-auto"
        style={
          clientFilter
            ? ({ "--panel-outline": clientColorById(clientFilter, clients).hex } as React.CSSProperties)
            : undefined
        }
      >
        <div className="flex items-end justify-between mb-8 gap-3 flex-wrap">
          <div>
            <div className="text-xs uppercase tracking-widest text-[var(--color-text-muted)]">
              Content approvals
            </div>
            <h1 className="text-3xl font-semibold tracking-tight mt-1">
              Content
            </h1>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Client filter — one chip per client, links so filtering is
                instant (no Filter button). Dot color matches the card's
                per-company border color. */}
            <nav className="flex items-center gap-1 flex-wrap rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-1">
              <Link
                href="/admin/content"
                className={
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors " +
                  (!clientFilter
                    ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)] border border-[var(--color-accent)]/40"
                    : "border border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-hover)]")
                }
              >
                All
              </Link>
              {clients.map((c) => {
                const active = clientFilter === c.id;
                return (
                  <Link
                    key={c.id}
                    href={`/admin/content?client=${c.id}`}
                    className={
                      "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors " +
                      (active
                        ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)] border border-[var(--color-accent)]/40"
                        : "border border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-hover)]")
                    }
                  >
                    <span
                      aria-hidden
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ background: companyAccent(clients, c.id) }}
                    />
                    {c.company_name}
                  </Link>
                );
              })}
            </nav>
            <AdminContentAddModal action={createContentAction} clients={clients} />
          </div>
        </div>

        {/* Mobile shows the three stages stacked vertically (each card has
            room to render Mark posted / Delete cleanly). md+ shows the
            three columns side-by-side. */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6 mb-8 items-stretch">
          {STAGES.map(({ stage, label, tone }) => {
            const rawCol = cards.filter((c) => c.stage === stage);
            // Admins can request changes too, so the badge is restricted to
            // client-authored asks — otherwise our own notes would inflate it.
            const hasOpenChangeRequest = (id: string) => {
              const ev = (eventsByCard.get(id) ?? [])[0];
              return Boolean(
                ev && ev.actor_role === "client" && (ev.note ?? "").startsWith("CHANGES REQUESTED"),
              );
            };
            // Float change-requested cards to the top of Proposed; once the
            // request is resolved (admin replies or advances the card) the
            // card naturally falls back into normal updated_at order.
            const col =
              stage === "proposed"
                ? [...rawCol].sort((a, b) => {
                    const aReq = hasOpenChangeRequest(a.id) ? 1 : 0;
                    const bReq = hasOpenChangeRequest(b.id) ? 1 : 0;
                    if (aReq !== bReq) return bReq - aReq;
                    return b.updated_at.localeCompare(a.updated_at);
                  })
                : rawCol;
            const changeReqCount =
              stage === "proposed" ? col.filter((c) => hasOpenChangeRequest(c.id)).length : 0;
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
                    <IncrementalList step={5}>
                    {col.map((card) => {
                      const events = eventsByCard.get(card.id) ?? [];
                      // An open change request = the latest event on a still-proposed
                      // card is a client "CHANGES REQUESTED" note.
                      const latest = events[0];
                      const changeRequest =
                        card.stage === "proposed" && latest && latest.actor_role === "client" && (latest.note ?? "").startsWith("CHANGES REQUESTED")
                          ? (latest.note ?? "").replace(/^CHANGES REQUESTED:\s*/, "")
                          : null;
                      return (
                        <div
                          key={card.id}
                          className={
                            "relative rounded-lg border bg-[var(--color-bg-elev)] p-3 pl-4 min-w-0 overflow-hidden " +
                            (changeRequest ? "border-amber-500/50" : "border-[var(--color-border)]")
                          }
                        >
                          {/* Per-company color bar — a strip span (not border-color)
                              so brand palettes can be gradients. */}
                          <span
                            aria-hidden
                            className="absolute inset-y-0 left-0 w-1"
                            style={{ background: companyAccent(clients, card.client_id) }}
                          />
                          {/* 3-dot menu absolutely positioned in top-right */}
                          <div className="absolute top-2 right-2">
                            <ContentCardControls
                              card={{ id: card.id, title: card.title, body: card.body, link: card.link, stage: card.stage }}
                              role="admin"
                              updateAction={updateContentAction}
                              deleteAction={deleteContentAction}
                            />
                          </div>

                          {/* Click anywhere on the card body opens the detail popup */}
                          <ContentDetailModal
                            triggerClassName="block w-full text-left pr-8"
                            card={{ id: card.id, title: card.title, body: card.body, link: card.link, stage: card.stage, created_at: card.created_at, updated_at: card.updated_at }}
                            companyName={clientNameOf(card.client_id)}
                            events={events.map((e) => ({ id: e.id, created_at: e.created_at, from_stage: e.from_stage, to_stage: e.to_stage, actor_role: e.actor_role, note: e.note }))}
                            attachmentImages={imagesByCard.get(card.id) ?? []}
                            triggerLabel={
                              <>
                                <div className="text-sm font-medium leading-snug break-words">{card.title}</div>
                                <div className="mt-1 text-[11px] text-[var(--color-text-muted)] font-mono break-words">
                                  {clientNameOf(card.client_id)} · updated <Time iso={card.updated_at} />
                                </div>
                                {changeRequest ? (
                                  <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-2">
                                    <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-400">⚠ Changes requested</div>
                                    <div className="mt-0.5 text-xs text-amber-200 leading-snug break-words line-clamp-2">{changeRequest}</div>
                                  </div>
                                ) : null}
                                {card.body ? (
                                  <div className="mt-2 text-xs text-[var(--color-text-muted)] line-clamp-3 break-words">
                                    {card.body}
                                  </div>
                                ) : null}
                                <div className="mt-2 text-[10px] text-[var(--color-accent)] opacity-70">Click for details ↗</div>
                              </>
                            }
                          />

                          {/* Stage-flow buttons: Back / Approve / Mark posted */}
                          <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:gap-1.5 gap-1.5">
                            {stage !== "proposed" ? (
                              <form action={advanceContentAction} className="w-full sm:w-auto">
                                <input type="hidden" name="id" value={card.id} />
                                <input type="hidden" name="direction" value="back" />
                                <Button size="sm" variant="ghost" type="submit" className="w-full sm:w-auto whitespace-nowrap">← Back</Button>
                              </form>
                            ) : null}
                            {stage !== "posted" ? (
                              <form action={advanceContentAction} className="w-full sm:w-auto">
                                <input type="hidden" name="id" value={card.id} />
                                <input type="hidden" name="direction" value="forward" />
                                <Button size="sm" type="submit" className="w-full sm:w-auto whitespace-nowrap">
                                  {stage === "proposed" ? "Approve →" : "Mark posted →"}
                                </Button>
                              </form>
                            ) : null}
                            {stage === "proposed" ? (
                              <RequestChangesModal
                                action={adminRequestChangesAction}
                                card={{ id: card.id, title: card.title, body: card.body, link: card.link }}
                              />
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                    </IncrementalList>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>

        {/* Calendar — driven by the same client filter as the board above. */}
        <Card className="mt-8">
          <CardHeader
            title="Calendar"
            subtitle={
              filteredClientName
                ? `Showing ${filteredClientName}'s events`
                : "All clients — use the filter above to narrow to one"
            }
          />
          <CardBody className="pt-5">
            <CalendarMonth
              days={calDays}
              monthKey={calMonthKey}
              monthLabel={calMonthLabel}
              events={calEvents}
              minCellHeight="min-h-[88px]"
              maxPerCell={3}
              addSlot={<AdminCalendarAddModal action={createCalendarAction} clients={clients} people={people} />}
              reschedule={rescheduleCalendarAction}
            />
          </CardBody>
        </Card>

      </div>
    </AdminShell>
  );
}
