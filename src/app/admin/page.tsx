import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";
import AdminShell from "@/components/admin/Shell";
import { Card, CardBody, CardHeader, Stat, Pill, Button } from "@/components/ui";
import { formatDate, isoDate } from "@/lib/utils";
import { createTaskAction, toggleTaskAction, deleteTaskAction } from "./actions";
import Time from "@/components/shared/Time";

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
      <div className="px-8 py-8 max-w-7xl">
        <div className="flex items-end justify-between mb-8">
          <div>
            <div className="text-xs uppercase tracking-widest text-[var(--color-text-muted)]">
              Work dashboard
            </div>
            <h1 className="text-3xl font-semibold tracking-tight mt-1">Today, tomorrow, this week</h1>
          </div>
          <div className="text-xs text-[var(--color-text-muted)] font-mono">
            <Time iso={new Date().toISOString()} dateOnly />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Stat label="Open tasks" value={tasks.length} />
          <Stat
            label="Overdue"
            value={buckets.overdue.length}
            trend={buckets.overdue.length ? { direction: "down", label: "needs attention" } : undefined}
          />
          <Stat label="Active clients" value={clients.length} />
          <Stat label="Due this week" value={buckets.today.length + buckets.tomorrow.length + buckets.week.length} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <TaskColumn title="Today"    bucket={buckets.today.concat(buckets.overdue)} clientName={clientName} />
          <TaskColumn title="Tomorrow" bucket={buckets.tomorrow} clientName={clientName} />
          <TaskColumn title="This week" bucket={buckets.week} clientName={clientName} />
        </div>

        <div className="mt-10">
          <Card>
            <CardHeader title="Create task" subtitle="Assign work to a client" />
            <CardBody>
              <form action={createTaskAction} className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <select
                  name="client_id"
                  required
                  defaultValue={clients[0]?.id ?? ""}
                  className="md:col-span-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.company_name}</option>
                  ))}
                </select>
                <input
                  name="title"
                  required
                  placeholder="What needs doing?"
                  className="md:col-span-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
                />
                <input
                  name="due_date"
                  type="date"
                  className="md:col-span-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
                />
                <Button type="submit" className="md:col-span-1">Add task</Button>
              </form>
            </CardBody>
          </Card>
        </div>
      </div>
    </AdminShell>
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
    <Card>
      <CardHeader
        title={title}
        right={<Pill>{bucket.length}</Pill>}
      />
      <CardBody className="space-y-2">
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
