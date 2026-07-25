// Admin notification bell — surfaces calendar events this admin has been
// assigned or cc'd on. Reuses the client NotificationDropdown for the UI.

import { data } from "@/lib/data";
import NotificationDropdown, { type NotificationItem } from "@/components/client/NotificationDropdown";

function whenLabel(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

export default async function AdminNotificationBell({ userId }: { userId: string }) {
  const assigned = await data.listAssignedEvents(userId);
  const items: NotificationItem[] = assigned.map((e) => ({
    id: `cal-${e.id}`,
    title: e.title,
    updated_at: e.starts_at,
    body: `${e.type === "deadline" ? "Deadline" : "Meeting"} · ${whenLabel(e.starts_at)}`,
    href: "/admin/calendar",
    meta: "Assigned to you",
  }));
  return <NotificationDropdown items={items} />;
}
