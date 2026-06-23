import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";
import AdminShell from "@/components/admin/Shell";
import { Card, CardBody, CardHeader, Pill } from "@/components/ui";
import { formatDate, isoDate } from "@/lib/utils";
import { createTaskAction, toggleTaskAction, deleteTaskAction } from "./actions";
import Time from "@/components/shared/Time";
import AdminTaskAddModal from "@/components/admin/AdminTaskAddModal";

function dayBucket(due: string | null, today: string, tomorrow: string, weekEnd: string) {
  if (!due) return "later";
  if (due === today) return "today";
  if (due === tomorrow) return "tomorrow";
  if (due > today && due <= weekEnd) return "week";
  if (due < today) return "overdue";
  return "later";
}

export default async function AdminWork() {
  const session = await requireAdmin();
  const [clients, tasks] = await Promise.all([
    data.listClients(),
    data.listTasks({ status: "open" }),
  ]);

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

  return (
    <AdminShell session={session} active="/admin">
      <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-7xl">
        {/* Header row: title left, date stacked on the right. */}
        <div className="flex items-start justify-between mb-4 gap-3">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-widest text-[var(--color-text-muted)]">
              Work dashboard
            </div>
            <h1 className="text-3xl font-semibold tracking-tight mt-1">Today, tomorrow, this week</h1>
          </div>
          <div className="text-xs text-[var(--color-text-muted)] font-mono text-right shrink-0">
            <Time iso={new Date().toISOString()} dateOnly />
          </div>
        </div>

        {/* + Add task right-aligned just below the header, full natural size. */}
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

        {/* Three task columns with a portrait-ish aspect so they read as boxes, not banners */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4 lg:gap-6 items-stretch">
          <TaskColumn title="Today"    bucket={buckets.today.concat(buckets.overdue)} clientName={clientName} />
          <TaskColumn title="Tomorrow" bucket={buckets.tomorrow} clientName={clientName} />
          <TaskColumn title="This week" bucket={buckets.week} clientName={clientName} />
        </div>
      </div>
    </AdminShell>
  );
}

// Square KPI tile — locked aspect-ratio so the four-up row reads as a
// row of boxes regardless of viewport. Padding scales with the box.
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
    <div className="aspect-square rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-3 sm:p-4 flex flex-col justify-between">
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
          <span className="flex items-center justify-between gap-2 min-w-0">
            <span className="truncate">{title}</span>
            <span
              className={
                "shrink-0 inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-full text-sm font-semibold tabular-nums " +
                (bucket.length > 0
                  ? "bg-[var(--color-accent)] text-black"
                  : "bg-[var(--color-bg)] text-[var(--color-text-muted)] border border-[var(--color-border)]")
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
                        className="h-7 w-7 grid place-items-center rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-white hover:border-[var(--color-accent)]"
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
