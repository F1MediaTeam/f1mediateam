// Unified admin dashboard: KPIs + task queues + Upcoming + calendar grid in
// one page. Replaces the two former pages /admin (Work) and /admin/calendar.

import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";
import AdminShell from "@/components/admin/Shell";
import { Card, CardBody, CardHeader, Pill } from "@/components/ui";
import { formatDate, isoDate } from "@/lib/utils";
import {
  createTaskAction,
  toggleTaskAction,
  deleteTaskAction,
  createCalendarAction,
  deleteCalendarAction,
} from "./actions";
import Time from "@/components/shared/Time";
import AdminTaskAddModal from "@/components/admin/AdminTaskAddModal";
import AdminCalendarAddModal from "@/components/admin/AdminCalendarAddModal";
import CalendarMonth, { type CalEvent } from "@/components/shared/CalendarMonth";
import Greeting from "@/components/admin/Greeting";
import { parseEventNotes } from "@/lib/calendar-event-url";

function dayBucket(due: string | null, today: string, tomorrow: string, weekEnd: string) {
  if (!due) return "later";
  if (due === today) return "today";
  if (due === tomorrow) return "tomorrow";
  if (due > today && due <= weekEnd) return "week";
  if (due < today) return "overdue";
  return "later";
}

function buildMonth(today: Date) {
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const startDay = first.getDay();
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
const INTERNAL_COLOR = { ring: "ring-slate-400/50", text: "text-slate-300", bg: "bg-slate-500/10" };

export default async function AdminDashboard() {
  const session = await requireAdmin();
  const [clients, tasks, events] = await Promise.all([
    data.listClients(),
    data.listTasks({ status: "open" }),
    data.listCalendar(),
  ]);

  // -------- tasks ----------
  const today = isoDate();
  const t = new Date();
  t.setDate(t.getDate() + 1);
  const tomorrow = isoDate(t);
  const w = new Date();
  w.setDate(w.getDate() + 7);
  const weekEnd = isoDate(w);

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
  const { days, monthLabel, monthKey } = buildMonth(new Date());
  const colorForClient = (id: string | null) => {
    if (!id) return INTERNAL_COLOR;
    const idx = clients.findIndex((c) => c.id === id);
    return PALETTE[(idx < 0 ? 0 : idx) % PALETTE.length];
  };
  const calEvents: CalEvent[] = events.map((e) => {
    const p = colorForClient(e.client_id);
    return {
      id: e.id,
      title: e.title,
      type: e.type,
      starts_at: e.starts_at,
      notes: e.notes,
      clientLabel: e.client_id ? clientName(e.client_id) : "F1 Media (internal)",
      chipClass: `${p.bg} ${p.text}`,
    };
  });
  const upcoming = [...events]
    .filter((e) => e.starts_at.slice(0, 10) >= today)
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
                      <div className={`shrink-0 w-1.5 self-stretch rounded-full bg-current ${p.text}`} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{e.title}</div>
                        <div className="text-[11px] text-[var(--color-text-muted)] flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span><Time iso={e.starts_at} /></span>
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
                  addSlot={<AdminCalendarAddModal action={createCalendarAction} clients={clients} />}
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
    <div className="aspect-square sm:aspect-auto sm:h-28 lg:h-32 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3 sm:p-4 flex flex-col justify-between">
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
    <Card className="flex flex-col h-full">
      <CardHeader
        title={
          <span className="flex items-baseline justify-between gap-2 min-w-0">
            <span className="truncate">{title}</span>
            <span
              className={
                "shrink-0 tabular-nums text-lg font-semibold " +
                (bucket.length > 0 ? "text-[var(--color-accent)]" : "text-[var(--color-text-subtle)]")
              }
            >
              {bucket.length}
            </span>
          </span>
        }
      />
      <CardBody className="space-y-2 flex-1">
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
      </CardBody>
    </Card>
  );
}
