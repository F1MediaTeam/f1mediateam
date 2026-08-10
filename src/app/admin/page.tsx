// Unified admin dashboard: KPIs + task queues + Upcoming + calendar grid in
// one page. Replaces the two former pages /admin (Work) and /admin/calendar.

import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";
import AdminShell from "@/components/admin/Shell";
import { Card, CardBody, CardHeader, Pill } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { addDaysToKey, buildMonthGrid, tzDateKey, tzTodayKey } from "@/lib/timezone";
import {
  createTaskAction,
  toggleTaskAction,
  deleteTaskAction,
  createCalendarAction,
  deleteCalendarAction,
  rescheduleCalendarAction,
  setCalendarClientAction,
} from "./actions";
import Time from "@/components/shared/Time";
import AdminTaskAddModal from "@/components/admin/AdminTaskAddModal";
import AdminCalendarAddModal from "@/components/admin/AdminCalendarAddModal";
import CalendarMonth, { type CalEvent } from "@/components/shared/CalendarMonth";
import Greeting from "@/components/admin/Greeting";
import { parseEventNotes } from "@/lib/calendar-event-url";
import { clientColorById, INTERNAL_COLOR } from "@/lib/client-color";

function dayBucket(due: string | null, today: string, tomorrow: string, weekEnd: string) {
  if (!due) return "later";
  if (due === today) return "today";
  if (due === tomorrow) return "tomorrow";
  if (due > today && due <= weekEnd) return "week";
  if (due < today) return "overdue";
  return "later";
}



export default async function AdminDashboard() {
  const session = await requireAdmin();
  const [clients, tasks, events, people] = await Promise.all([
    data.listClients(),
    data.listTasks({ status: "open" }),
    data.listCalendar(),
    data.listAssignablePeople(),
  ]);

  // -------- tasks ----------
  // Phoenix dates, not the server's UTC ones: after 5pm local, a UTC "today"
  // is already tomorrow and every bucket slides by a day.
  const today = tzTodayKey();
  const tomorrow = addDaysToKey(today, 1);
  const weekEnd = addDaysToKey(today, 7);

  const buckets = {
    overdue: [] as typeof tasks,
    today:   [] as typeof tasks,
    tomorrow:[] as typeof tasks,
    week:    [] as typeof tasks,
    later:   [] as typeof tasks,
  };
  for (const tk of tasks) {
    buckets[dayBucket(tk.due_date, today, tomorrow, weekEnd) as keyof typeof buckets].push(tk);
  }
  const clientName = (id: string) =>
    clients.find((c) => c.id === id)?.company_name ?? "—";

  // -------- calendar ----------
  const { days, monthLabel, monthKey } = buildMonthGrid();
  const colorForClient = (id: string | null) => clientColorById(id, clients);
  const calEvents: CalEvent[] = events.map((e) => {
    const p = colorForClient(e.client_id);
    return {
      id: e.id,
      title: e.title,
      type: e.type,
      starts_at: e.starts_at,
      notes: e.notes,
      clientLabel: e.client_id ? clientName(e.client_id) : "F1 Media (internal)",
      // The client's own colour sits behind the text, so the calendar reads by
      // colour before it reads by word.
      chipStyle: { background: p.solid, color: p.onSolid, borderColor: p.hex },
      accentColor: p.hex,
    };
  });
  const upcoming = [...events]
    .filter((e) => tzDateKey(e.starts_at) >= today)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .slice(0, 8);

  return (
    <AdminShell session={session} active="/admin">
      <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-[1600px] mx-auto">
        {/* Header row: greeting on the left, date on the right. */}
        <div className="flex items-start justify-between mb-4 gap-3">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-widest text-[var(--color-text-muted)]">
              Dashboard
            </div>
            <h1 className="text-3xl font-semibold tracking-tight mt-1"><Greeting /></h1>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-[var(--color-text)] font-mono text-right shrink-0">
            <Time iso={new Date().toISOString()} dateOnly />
          </div>
        </div>

        {/* + Add task right-aligned under the header. */}
        <div className="flex justify-end mb-3">
          <AdminTaskAddModal action={createTaskAction} clients={clients} />
        </div>

        {/* Square KPI tiles */}
        <div className="grid grid-cols-4 gap-2 sm:gap-4 mb-8">
          <SquareStat label="Open tasks" value={tasks.length} />
          <SquareStat label="Overdue" value={buckets.overdue.length} tone={buckets.overdue.length ? "danger" : "default"} />
          <SquareStat label="Active clients" value={clients.length} />
          <SquareStat label="Due this week" value={buckets.today.length + buckets.tomorrow.length + buckets.week.length} />
        </div>

        {/* Today / Tomorrow / This week task columns */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4 lg:gap-6 items-stretch mb-10">
          <TaskColumn title="Today"    bucket={buckets.today.concat(buckets.overdue)} clientName={clientName} />
          <TaskColumn title="Tomorrow" bucket={buckets.tomorrow} clientName={clientName} />
          <TaskColumn title="This week" bucket={buckets.week} clientName={clientName} />
        </div>

        {/* Calendar block: month title + legend on the right, Upcoming card,
            flush against the month grid below. */}
        <div className="flex items-end justify-between gap-4 mb-4 flex-wrap">
          <div>
            <div className="text-xs uppercase tracking-widest text-[var(--color-text-muted)]">
              Master calendar
            </div>
            <h2 className="text-2xl font-semibold tracking-tight mt-1">{monthLabel}</h2>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            {clients.map((c) => {
              const p = colorForClient(c.id);
              return (
                <span
                  key={c.id}
                  className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold"
                  style={{ background: p.solid, color: p.onSolid }}
                >
                  <span className="inline-block w-2 h-2 rounded-full bg-current opacity-70" />
                  {c.company_name}
                </span>
              );
            })}
            <span
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold"
              style={{ background: INTERNAL_COLOR.solid, color: INTERNAL_COLOR.onSolid }}
            >
              <span className="inline-block w-2 h-2 rounded-full bg-current opacity-70" />
              F1 Media
            </span>
          </div>
        </div>

        {/* Upcoming card */}
        <Card>
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
                  const { url } = parseEventNotes(e.notes);
                  return (
                    <div
                      key={e.id}
                      className="flex items-start gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-3"
                    >
                      <div className="shrink-0 w-1.5 self-stretch rounded-full" style={{ background: p.hex }} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{e.title}</div>
                        <div className="text-[11px] text-[var(--color-text-muted)] flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span><Time iso={e.starts_at} withZone /></span>
                          <span>·</span>
                          <span className="truncate">{clientLabel}</span>
                          <Pill tone={e.type === "deadline" ? "warn" : "accent"}>{e.type}</Pill>
                        </div>
                        {url ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 inline-block text-[11px] text-[var(--color-accent)] hover:underline truncate max-w-full"
                          >
                            {url.replace(/^https?:\/\//, "")} ↗
                          </a>
                        ) : null}
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

        {/* Calendar grid — flush against Upcoming. Month title centered on top
            of the grid; + Add stays in the top-right corner of the card. */}
        <Card className="mt-2">
          <CardBody className="pt-5">
            <div className="overflow-x-auto -mx-2 px-2 pb-2">
              <div className="min-w-[700px] sm:min-w-0">
                <CalendarMonth
                  days={days}
                  monthKey={monthKey}
                  monthLabel={monthLabel}
                  events={calEvents}
                  minCellHeight="min-h-[160px] sm:min-h-[180px] lg:min-h-[200px]"
                  maxPerCell={5}
                  addSlot={<AdminCalendarAddModal action={createCalendarAction} clients={clients} people={people} />}
                  reschedule={rescheduleCalendarAction}
                  clients={clients.map((c) => ({ id: c.id, company_name: c.company_name }))}
          setClient={setCalendarClientAction}
                />
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </AdminShell>
  );
}

// KPI tile — square on phones (so the 4-up row reads as boxes inside a
// narrow viewport), then becomes a fixed-height card on tablet+ so the
// number stays close to the label instead of floating at the bottom of a
// 350px-tall empty box.
// The dashboard's panel surface. Both the stat tiles and the task columns use
// it, so the two rows read as one system — they had drifted to rounded-xl with
// no shadow versus Card's rounded-2xl with a heavy one.
//
// data-style-id gives the style inspector a stable handle on the whole panel.
// Without it, clicking landed on whatever inner label was under the cursor and
// the outer shape could not be selected at all.
const PANEL =
  "rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3 sm:p-4";

function SquareStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  tone?: "default" | "danger";
}) {
  const accent = tone === "danger" ? "text-[var(--color-down)]" : "text-[var(--color-text)]";
  return (
    <div
      data-style-id="stat-tile"
      data-panel=""
      className={`aspect-square sm:aspect-auto sm:h-28 lg:h-32 flex flex-col justify-between ${PANEL}`}
    >
      <div className="text-[10px] sm:text-[11px] uppercase tracking-wider text-[var(--color-text-muted)] leading-tight">
        {label}
      </div>
      <div className={`text-3xl sm:text-4xl font-semibold tabular-nums ${accent}`}>{value}</div>
    </div>
  );
}

function TaskColumn({
  title,
  bucket,
  clientName,
}: {
  title: string;
  bucket: Awaited<ReturnType<typeof data.listTasks>>;
  clientName: (id: string) => string;
}) {
  return (
    <div data-style-id="task-column" data-panel="" className={`flex flex-col h-full ${PANEL}`}>
      {/* Label styled like the stat tiles above: same size, case and tracking,
          so the two rows sit as one grid rather than two designs. */}
      <div className="mb-3 flex items-baseline justify-between gap-2 min-w-0">
        <span className="truncate text-[10px] sm:text-[11px] uppercase tracking-wider text-[var(--color-text-muted)]">
          {title}
        </span>
        <span
          className={
            "shrink-0 tabular-nums text-2xl font-semibold " +
            (bucket.length > 0 ? "text-[var(--color-text)]" : "text-[var(--color-text-subtle)]")
          }
        >
          {bucket.length}
        </span>
      </div>
      <div className="space-y-2 flex-1">
        {bucket.length === 0 ? (
          <div className="text-xs text-[var(--color-text-subtle)] py-4 text-center">
            Nothing here — clean queue.
          </div>
        ) : (
          bucket
            .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))
            .map((t) => (
              <div
                key={t.id}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium leading-snug">{t.title}</div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
                      <span className="font-mono">{clientName(t.client_id)}</span>
                      {t.due_date ? <span>· due {formatDate(t.due_date)}</span> : null}
                    </div>
                    {t.notes ? (
                      <div className="mt-1.5 text-xs text-[var(--color-text-muted)]">{t.notes}</div>
                    ) : null}
                  </div>
                  <div className="flex gap-1.5">
                    <form action={toggleTaskAction}>
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="status" value={t.status} />
                      <button
                        title="Mark done"
                        className="h-7 w-7 grid place-items-center rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-accent)]"
                      >
                        ✓
                      </button>
                    </form>
                    <form action={deleteTaskAction}>
                      <input type="hidden" name="id" value={t.id} />
                      <button
                        title="Delete"
                        className="h-7 w-7 grid place-items-center rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-red-300 hover:border-red-500/40"
                      >
                        ×
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            ))
        )}
      </div>
    </div>
  );
}
