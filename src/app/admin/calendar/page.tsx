import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";
import AdminShell from "@/components/admin/Shell";
import { Card, CardBody, CardHeader, Pill, Button } from "@/components/ui";
import { isoDate } from "@/lib/utils";
import { createCalendarAction, deleteCalendarAction } from "../actions";
import Time from "@/components/shared/Time";
import CalendarMonth, { type CalEvent } from "@/components/shared/CalendarMonth";

// Simple month grid with events. 6-row x 7-day layout.
function buildMonth(today: Date) {
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const startDay = first.getDay(); // 0 = Sunday
  const start = new Date(first);
  start.setDate(first.getDate() - startDay);
  const days: string[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(isoDate(d));
  }
  return {
    days,
    monthLabel: today.toLocaleString("en-US", { month: "long", year: "numeric" }),
    monthKey: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`,
  };
}

const PALETTE = [
  { ring: "ring-emerald-400/50", text: "text-emerald-300", bg: "bg-emerald-500/10" },
  { ring: "ring-orange-400/50",  text: "text-orange-300",  bg: "bg-orange-500/10" },
  { ring: "ring-violet-400/50",  text: "text-violet-300",  bg: "bg-violet-500/10" },
  { ring: "ring-sky-400/50",     text: "text-sky-300",     bg: "bg-sky-500/10" },
  { ring: "ring-rose-400/50",    text: "text-rose-300",    bg: "bg-rose-500/10" },
];

export default async function AdminCalendar() {
  const session = await requireAdmin();
  const [clients, events] = await Promise.all([
    data.listClients(),
    data.listCalendar(),
  ]);
  const { days, monthLabel, monthKey } = buildMonth(new Date());

  // null client_id = internal F1 Media event — fall back to the first palette
  // slot instead of indexing PALETTE[-1] and crashing on p.bg.
  const colorForClient = (id: string | null) => {
    const idx = id ? clients.findIndex((c) => c.id === id) : -1;
    return idx === -1 ? PALETTE[0] : PALETTE[idx % PALETTE.length];
  };
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
      chipClass: `${p.bg} ${p.text}`,
    };
  });

  const today = isoDate();
  const upcoming = [...events]
    .filter((e) => e.starts_at.slice(0, 10) >= today)
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
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${p.bg} ${p.text} border-current/30`}
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
                      <div className={`shrink-0 w-1.5 h-10 rounded-full bg-current ${p.text}`} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{e.title}</div>
                        <div className="text-xs text-[var(--color-text-muted)] flex items-center gap-2 mt-0.5">
                          <span><Time iso={e.starts_at} /></span>
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
                <input
                  name="starts_at"
                  type="datetime-local"
                  required
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
                />
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
