// Server-side fetcher for a client user's notifications: content cards
// awaiting the client's approval, plus calendar events they've been assigned
// or cc'd on. Hands the merged list to NotificationDropdown.

import { data } from "@/lib/data";
import NotificationDropdown, { type NotificationItem } from "./NotificationDropdown";
import { formatInTzWithZone } from "@/lib/timezone";

interface Props {
  clientId: string;
  /** the logged-in user, so we can surface events assigned to THEM */
  userId?: string;
}

// Rendered on the server, where the clock is UTC — always name the zone.
function whenLabel(iso: string): string {
  return formatInTzWithZone(iso);
}

export default async function NotificationBell({ clientId, userId }: Props) {
  const [pending, assigned] = await Promise.all([
    data.listContent({ clientId, stage: "proposed" }),
    userId ? data.listAssignedEvents(userId) : Promise.resolve([]),
  ]);

  const items: NotificationItem[] = [
    ...assigned.map((e) => ({
      id: `cal-${e.id}`,
      title: e.title,
      updated_at: e.starts_at,
      body: `${e.type === "deadline" ? "Deadline" : "Meeting"} · ${whenLabel(e.starts_at)}`,
      href: "/client",
      meta: "Assigned to you",
    })),
    ...pending
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, 20)
      .map((c) => ({
        id: c.id,
        title: c.title,
        updated_at: c.updated_at,
        body: c.body,
        href: "/client/content",
        meta: "Awaiting approval",
      })),
  ];

  return <NotificationDropdown items={items} />;
}
