import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";
import AdminShell from "@/components/admin/Shell";
import { Card, CardBody, CardHeader, Button, Pill } from "@/components/ui";
import LogoUpload from "@/components/admin/LogoUpload";
import { createMeetingAction } from "./actions";
import { isoDate } from "@/lib/utils";
import { logoUrlFor } from "@/lib/slides";

export default async function AdminMeetingsList() {
  const session = await requireAdmin();
  const [clients, meetings] = await Promise.all([
    data.listClients(),
    data.listMeetings(),
  ]);
  const clientById = new Map(clients.map((c) => [c.id, c]));

  // Sensible defaults for the new-meeting form: today, last 30 days of data.
  const today = new Date();
  const isoLocal = `${isoDate(today)}T10:00`;
  const monthAgo = new Date(today);
  monthAgo.setDate(monthAgo.getDate() - 30);

  return (
    <AdminShell session={session} active="/admin/meetings">
      <div className="px-8 py-8 max-w-7xl">
        <div className="mb-8">
          <div className="text-xs uppercase tracking-widest text-[var(--color-text-muted)]">
            Meetings
          </div>
          <h1 className="text-3xl font-semibold tracking-tight mt-1">
            Client presentation decks
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-2 max-w-2xl">
            Each meeting auto-generates a slide deck from live client data —
            numbers, trends, posted content, and what&apos;s next. Add a logo,
            pick a date range, and present.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-3">
            {meetings.length === 0 ? (
              <Card>
                <CardBody>
                  <div className="text-sm text-[var(--color-text-muted)]">
                    No meetings yet. Use the form on the right to create your first deck.
                  </div>
                </CardBody>
              </Card>
            ) : (
              meetings.map((m) => {
                const client = clientById.get(m.client_id);
                const logo = logoUrlFor(m);
                return (
                  <Link
                    key={m.id}
                    href={`/admin/meetings/${m.id}`}
                    className="block rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elev)] hover:bg-[var(--color-bg-hover)] transition-colors px-5 py-4"
                  >
                    <div className="flex items-center gap-4">
                      {logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={logo}
                          alt=""
                          className="w-12 h-12 rounded-lg object-cover bg-white/5 ring-1 ring-[var(--color-border)]"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-lg grid place-items-center text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] bg-white/5 ring-1 ring-[var(--color-border)]">
                          {(client?.company_name ?? "?").slice(0, 2)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{m.title}</div>
                        <div className="text-xs text-[var(--color-text-muted)] mt-0.5 flex items-center gap-2">
                          <span>{client?.company_name ?? "—"}</span>
                          <span>·</span>
                          <span>
                            {new Date(m.scheduled_at).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </span>
                          {m.range_from || m.range_to ? (
                            <>
                              <span>·</span>
                              <Pill tone="default">
                                {m.range_from ?? "…"} → {m.range_to ?? "…"}
                              </Pill>
                            </>
                          ) : null}
                        </div>
                      </div>
                      <span className="text-xs text-emerald-300">Open ↗</span>
                    </div>
                  </Link>
                );
              })
            )}
          </div>

          <Card>
            <CardHeader title="New meeting" subtitle="Builds the deck instantly" />
            <CardBody>
              <form action={createMeetingAction} className="space-y-3" encType="multipart/form-data">
                <div className="flex justify-center py-2">
                  <LogoUpload helperText="Optional — drop the client's logo." />
                </div>
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
                  placeholder="Meeting title (e.g. Q2 review)"
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
                />
                <input
                  name="scheduled_at"
                  type="datetime-local"
                  defaultValue={isoLocal}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
                />
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                    Range start
                    <input
                      name="range_from"
                      type="date"
                      defaultValue={isoDate(monthAgo)}
                      className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                    Range end
                    <input
                      name="range_to"
                      type="date"
                      defaultValue={isoDate(today)}
                      className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm"
                    />
                  </label>
                </div>
                <textarea
                  name="notes"
                  rows={2}
                  placeholder="Talking points (one per line, optional)"
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
                />
                <Button type="submit" className="w-full">Create & open deck</Button>
              </form>
            </CardBody>
          </Card>
        </div>
      </div>
    </AdminShell>
  );
}
