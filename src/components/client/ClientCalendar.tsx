// The client portal's month calendar.
//
// Extracted from the Overview so the Content tab can show the same thing
// without a second copy drifting out of sync. Server component: it fetches its
// own attachment counts and hands the normalized events to the shared
// CalendarMonth, which owns all the interactivity (day selection, event
// detail popups, today highlight).

import { Card, CardBody } from "@/components/ui";
import CalendarAddModal from "@/components/client/CalendarAddModal";
import CalendarMonth, { type CalEvent } from "@/components/shared/CalendarMonth";
import { data } from "@/lib/data";
import { isoDate } from "@/lib/utils";
import type { CalendarEvent } from "@/lib/types";

export default async function ClientCalendar({
  events,
  action,
  className = "",
}: {
  events: CalendarEvent[];
  action: (formData: FormData) => void | Promise<void>;
  className?: string;
}) {
  // Attachment counts per event so a day cell can show a 📎 N badge.
  const attachments = await data.listAttachmentsForEvents(events.map((e) => e.id));
  const attCount = new Map<string, number>();
  for (const a of attachments) attCount.set(a.event_id, (attCount.get(a.event_id) ?? 0) + 1);

  // Month grid for the current month: 6 rows × 7 days, padded from the Sunday
  // before the 1st so the columns line up under the weekday headings.
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());
  const days: string[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    days.push(isoDate(d));
  }
  const monthLabel = now.toLocaleString("en-US", { month: "long", year: "numeric" });
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const calEvents: CalEvent[] = events.map((e) => ({
    id: e.id,
    title: e.title,
    type: e.type,
    starts_at: e.starts_at,
    notes: e.notes,
    attachmentCount: attCount.get(e.id) ?? 0,
  }));

  return (
    <Card className={className}>
      <CardBody className="pt-5">
        <CalendarMonth
          days={days}
          monthKey={monthKey}
          monthLabel={monthLabel}
          events={calEvents}
          maxPerCell={2}
          addSlot={<CalendarAddModal action={action} />}
        />
      </CardBody>
    </Card>
  );
}
