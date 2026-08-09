import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";
import AdminShell from "@/components/admin/Shell";
import { Card, CardBody, CardHeader, Pill, Button } from "@/components/ui";
import { APP_TZ_LABEL, buildMonthGrid, tzDateKey, tzTodayKey } from "@/lib/timezone";
import { createCalendarAction, deleteCalendarAction, rescheduleCalendarAction } from "../actions";
import Time from "@/components/shared/Time";
import CalendarMonth, { type CalEvent } from "@/components/shared/CalendarMonth";
import { clientColorById } from "@/lib/client-color";


export default async function AdminCalendar() {
  const session = await requireAdmin();
  const [clients, events] = await Promise.all([
    data.listClients(),
    data.listCalendar(),
  ]);
  const { days, monthLabel, monthKey } = buildMonthGrid();

  // null client_id = internal F1 Media event, which resolves to the neutral
  // colour rather than borrowing a client's hue.
  const colorForClient = (id: string | null) => clientColorById(id, clients);
  const clientName = (id: string | null) =>
    id ? clients.find((c) => c.id === id)?.company_name ?? "—" : "F1 Media (internal)";

  const calEvents: CalEvent[] = events.map((e) => {
    const p = colorForClient(e.client_id);
    return {
      id: e.id,
      title: e.title,
      type: e.type,
      starts_at: e.starts_at,
      notes: e.notes,
      clientLabel: clientName(e.client_id),
      chipStyle: { background: p.solid, color: p.onSolid, borderColor: p.hex },
      accentColor: p.hex,
    };
  });

  const today = tzTodayKey();
  const upcoming = [...events]
    .filter((e) => tzDateKey(e.starts_at) >= today)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .slice(0, 8);

  return (
    <AdminShell session={session} active="/admin/calendar">
      <div className="px-8 py-8 max-w-7xl">
        <div className="flex items-end justify-between mb-8">
          <div>
            <div className="text-xs uppercase tracking-widest text-[var(--color-text-muted)]">
              Master calendar
            </div>
            <h1 className="text-3xl font-semibold tracking-tight mt-1">{monthLabel}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            {clients.map((c) => {
              const p = colorForClient(c.id);
              return (
                <span
                  key={c.id}
                  className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold"
                  style={{ background: p.solid, color: p.onSolid }}
                >
                  <span className={`inline-block w-2 h-2 rounded-full bg-current opacity-90`} />
                  {c.company_name}
                </span>
              );
            })}
          </div>
        </div>

        <Card className="mb-8">
          <CardBody className="pt-6">
            <CalendarMonth
              days={days}
              monthKey={monthKey}
              events={calEvents}
              minCellHeight="min-h-[88px]"
              maxPerCell={3}
              reschedule={rescheduleCalendarAction}
            />
          </CardBody>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader title="Upcoming" subtitle="Next 8 items across all clients" />
            <CardBody className="space-y-2">
              {upcoming.length === 0 ? (
                <div className="text-xs text-[var(--color-text-muted)]">Nothing scheduled.</div>
              ) : (
                upcoming.map((e) => {
                  const p = colorForClient(e.client_id);
                  const clientLabel = clients.find((c) => c.id === e.client_id)?.company_name ?? "—";
                  return (
                    <div
                      key={e.id}
                      className="flex items-center gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-4 py-3"
                    >
                      <div className="shrink-0 w-1.5 h-10 rounded-full" style={{ background: p.hex }} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{e.title}</div>
                        <div className="text-xs text-[var(--color-text-muted)] flex items-center gap-2 mt-0.5">
                          <span><Time iso={e.starts_at} withZone /></span>
                          <span>·</span>
                          <span>{clientLabel}</span>
                          <Pill tone={e.type === "deadline" ? "warn" : "accent"}>
                            {e.type}
                          </Pill>
                        </div>
                      </div>
                      <form action={deleteCalendarAction}>
                        <input type="hidden" name="id" value={e.id} />
                        <button
                          title="Delete"
                          className="h-7 w-7 grid place-items-center rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-red-300 hover:border-red-500/40"
                        >
                          ×
                        </button>
                      </form>
                    </div>
                  );
                })
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Add event" />
            <CardBody>
              <form action={createCalendarAction} className="space-y-3">
                <select
                  name="client_id"
                  required
                  defaultValue={clients[0]?.id ?? ""}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.company_name}</option>
                  ))}
                </select>
                <input
                  name="title"
                  required
                  placeholder="Title"
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
                />
                <select
                  name="type"
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
                >
                  <option value="meeting">Meeting</option>
                  <option value="deadline">Deadline</option>
                </select>
                <label className="block">
                  <span className="mb-1.5 block text-[11px] uppercase tracking-widest text-[var(--color-text-muted)]">
                    Starts — Phoenix time ({APP_TZ_LABEL})
                  </span>
                  <input
                    name="starts_at"
                    type="datetime-local"
                    required
                    className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
                  />
                </label>
                <textarea
                  name="notes"
                  rows={2}
                  placeholder="Notes (optional)"
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
                />
                <Button type="submit" className="w-full">Add</Button>
              </form>
            </CardBody>
          </Card>
        </div>
      </div>
    </AdminShell>
  );
}
