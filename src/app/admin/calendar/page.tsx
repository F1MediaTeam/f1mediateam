import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";
import AdminShell from "@/components/admin/Shell";
import { Card, CardBody, CardHeader, Pill } from "@/components/ui";
import { formatDateTime, isoDate } from "@/lib/utils";
import { createCalendarAction, deleteCalendarAction } from "../actions";
import Time from "@/components/shared/Time";
import CalendarDayHeader from "@/components/admin/CalendarDayHeader";
import AdminCalendarAddModal from "@/components/admin/AdminCalendarAddModal";

// Simple month grid with events. 6-row x 7-day layout.
function buildMonth(today: Date) {
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const startDay = first.getDay(); // 0 = Sunday
  const start = new Date(first);
  start.setDate(first.getDate() - startDay);
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  return { days, monthLabel: today.toLocaleString("en-US", { month: "long", year: "numeric" }) };
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
  const { days, monthLabel } = buildMonth(new Date());

  const INTERNAL_COLOR = { ring: "ring-slate-400/50", text: "text-slate-300", bg: "bg-slate-500/10" };
  const colorForClient = (id: string | null) => {
    if (!id) return INTERNAL_COLOR;
    const idx = clients.findIndex((c) => c.id === id);
    return PALETTE[(idx < 0 ? 0 : idx) % PALETTE.length];
  };

  const eventsByDay = new Map<string, typeof events>();
  for (const e of events) {
    const key = e.starts_at.slice(0, 10);
    const arr = eventsByDay.get(key) ?? [];
    arr.push(e);
    eventsByDay.set(key, arr);
  }

  const today = isoDate();
  const upcoming = [...events]
    .filter((e) => e.starts_at.slice(0, 10) >= today)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .slice(0, 8);

  return (
    <AdminShell session={session} active="/admin/calendar">
      <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-[1600px] mx-auto">
        {/* Header: title + client legend */}
        <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
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
                  <span className="inline-block w-2 h-2 rounded-full bg-current opacity-90" />
                  {c.company_name}
                </span>
              );
            })}
            <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs bg-slate-500/10 text-slate-300 border-current/30">
              <span className="inline-block w-2 h-2 rounded-full bg-current opacity-90" />
              F1 Media
            </span>
          </div>
        </div>

        {/* Upcoming — full width row, above the calendar */}
        <Card className="mb-8">
          <CardHeader title="Upcoming" subtitle="Next 8 items across all clients" />
          <CardBody>
            {upcoming.length === 0 ? (
              <div className="text-xs text-[var(--color-text-muted)]">Nothing scheduled.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                {upcoming.map((e) => {
                  const p = colorForClient(e.client_id);
                  const clientLabel = e.client_id
                    ? (clients.find((c) => c.id === e.client_id)?.company_name ?? "—")
                    : "F1 Media (internal)";
                  return (
                    <div
                      key={e.id}
                      className="flex items-start gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-3"
                    >
                      <div className={`shrink-0 w-1.5 self-stretch rounded-full bg-current ${p.text}`} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{e.title}</div>
                        <div className="text-[11px] text-[var(--color-text-muted)] flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span><Time iso={e.starts_at} /></span>
                          <span>·</span>
                          <span className="truncate">{clientLabel}</span>
                          <Pill tone={e.type === "deadline" ? "warn" : "accent"}>
                            {e.type}
                          </Pill>
                        </div>
                      </div>
                      <form action={deleteCalendarAction}>
                        <input type="hidden" name="id" value={e.id} />
                        <button
                          title="Delete"
                          className="h-6 w-6 grid place-items-center rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-red-300 hover:border-red-500/40"
                        >
                          ×
                        </button>
                      </form>
                    </div>
                  );
                })}
              </div>
            )}
          </CardBody>
        </Card>

        {/* Calendar grid — wider, taller day cells, +Add button in card header */}
        <Card>
          <CardHeader
            title={monthLabel}
            subtitle="Click + Add to schedule a meeting or deadline"
            right={<AdminCalendarAddModal action={createCalendarAction} clients={clients} />}
          />
          <CardBody>
            {/* Horizontal scroll on small screens so each day cell stays
                readable instead of crushed to ~40px wide. The inner grid is
                always 7-wide; min-width forces the columns to at least be
                usable. */}
            <div className="overflow-x-auto -mx-2 px-2 pb-2">
              <div className="min-w-[700px] sm:min-w-0">
                <div className="grid grid-cols-7 text-xs uppercase tracking-wider text-[var(--color-text-muted)] mb-2">
                  {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (
                    <div key={d} className="px-2 py-1">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-2">
                  {days.map((d) => {
                    const key = isoDate(d);
                    const isCurrentMonth = d.getMonth() === new Date().getMonth();
                    const dayEvents = eventsByDay.get(key) ?? [];
                    return (
                      <div
                        key={key}
                        className={
                          "rounded-lg border p-2 min-h-[160px] sm:min-h-[180px] lg:min-h-[200px] flex flex-col " +
                          (isCurrentMonth
                            ? "border-[var(--color-border)] bg-[var(--color-bg-elev)]"
                            : "border-[var(--color-border)]/40 bg-[var(--color-bg-elev)]/40 opacity-50")
                        }
                      >
                        <CalendarDayHeader iso={key} dayNumber={d.getDate()} />
                        <div className="space-y-1 mt-1 flex-1 overflow-hidden">
                          {dayEvents.slice(0, 5).map((e) => {
                            const p = colorForClient(e.client_id);
                            return (
                              <div
                                key={e.id}
                                className={`text-[11px] rounded px-1.5 py-1 ${p.bg} ${p.text} leading-tight`}
                                title={`${e.title} — ${formatDateTime(e.starts_at)}`}
                              >
                                <div className="font-medium truncate">
                                  {e.type === "deadline" ? "◆" : "●"} {e.title}
                                </div>
                              </div>
                            );
                          })}
                          {dayEvents.length > 5 ? (
                            <div className="text-[10px] text-[var(--color-text-muted)]">
                              +{dayEvents.length - 5} more
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </AdminShell>
  );
}
