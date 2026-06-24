import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";
import AdminShell from "@/components/admin/Shell";
import { Card, CardBody, CardHeader, Button, Pill } from "@/components/ui";
import LogoUpload from "@/components/admin/LogoUpload";
import SlideDeck from "@/components/admin/SlideDeck";
import { updateMeetingAction, deleteMeetingAction } from "../actions";
import { buildDeck, logoUrlFor } from "@/lib/slides";

export default async function AdminMeetingDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAdmin();
  const { id } = await params;
  const meeting = await data.getMeeting(id);
  if (!meeting) notFound();

  const client = await data.getClient(meeting.client_id);
  if (!client) notFound();

  const slides = await buildDeck({ meeting, client });
  const logoUrl = logoUrlFor(meeting);

  // datetime-local needs "YYYY-MM-DDTHH:mm" in local time.
  const scheduledLocal = (() => {
    const d = new Date(meeting.scheduled_at);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  })();

  return (
    <AdminShell session={session} active="/admin/meetings">
      <div className="px-8 py-8 max-w-7xl">
        <div className="flex items-end justify-between mb-8 gap-4 flex-wrap">
          <div className="min-w-0">
            <Link
              href="/admin/meetings"
              className="text-xs uppercase tracking-widest text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            >
              ← All meetings
            </Link>
            <h1 className="text-3xl font-semibold tracking-tight mt-2 truncate">
              {meeting.title}
            </h1>
            <div className="text-sm text-[var(--color-text-muted)] mt-1 flex items-center gap-2 flex-wrap">
              <span>{client.company_name}</span>
              <span>·</span>
              <span>
                {new Date(meeting.scheduled_at).toLocaleString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
              <Pill tone="accent">{slides.length} slides</Pill>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/admin/meetings/${meeting.id}/present`}
              target="_blank"
              className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 px-4 py-2 text-sm font-medium"
            >
              Present ▶
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
          <Card>
            <CardHeader title="Deck preview" subtitle="Use ← / → to flip slides" />
            <CardBody>
              <SlideDeck slides={slides} mode="preview" />
            </CardBody>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader title="Logo" subtitle="Shown on the cover slide" />
              <CardBody>
                <form action={updateMeetingAction} encType="multipart/form-data" className="space-y-4">
                  <input type="hidden" name="id" value={meeting.id} />
                  <div className="flex justify-center">
                    <LogoUpload initialUrl={logoUrl} />
                  </div>
                  <input type="hidden" name="title" value={meeting.title} />
                  <input type="hidden" name="scheduled_at" value={scheduledLocal} />
                  <input type="hidden" name="range_from" value={meeting.range_from ?? ""} />
                  <input type="hidden" name="range_to" value={meeting.range_to ?? ""} />
                  <input type="hidden" name="notes" value={meeting.notes ?? ""} />
                  <Button type="submit" className="w-full">Save logo</Button>
                </form>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Details" />
              <CardBody>
                <form action={updateMeetingAction} className="space-y-3">
                  <input type="hidden" name="id" value={meeting.id} />
                  <label className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                    Title
                    <input
                      name="title"
                      defaultValue={meeting.title}
                      className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                    When
                    <input
                      name="scheduled_at"
                      type="datetime-local"
                      defaultValue={scheduledLocal}
                      className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                      Range start
                      <input
                        name="range_from"
                        type="date"
                        defaultValue={meeting.range_from ?? ""}
                        className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm"
                      />
                    </label>
                    <label className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                      Range end
                      <input
                        name="range_to"
                        type="date"
                        defaultValue={meeting.range_to ?? ""}
                        className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm"
                      />
                    </label>
                  </div>
                  <label className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                    Talking points (one per line, appended to recap slide)
                    <textarea
                      name="notes"
                      rows={3}
                      defaultValue={meeting.notes ?? ""}
                      className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
                    />
                  </label>
                  <Button type="submit" className="w-full">Save & rebuild deck</Button>
                </form>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Danger zone" />
              <CardBody>
                <form action={deleteMeetingAction}>
                  <input type="hidden" name="id" value={meeting.id} />
                  <button
                    type="submit"
                    className="w-full rounded-lg border border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20 px-3 py-2 text-sm"
                  >
                    Delete meeting
                  </button>
                </form>
              </CardBody>
            </Card>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
