// Server-side fetcher for the client's pending content cards (proposed
// stage = awaiting their approval). Hands the list to NotificationDropdown
// which owns the open/close state + dropdown rendering.

import { data } from "@/lib/data";
import NotificationDropdown from "./NotificationDropdown";

interface Props {
  clientId: string;
}

export default async function NotificationBell({ clientId }: Props) {
  const pending = await data.listContent({ clientId, stage: "proposed" });
  // Newest first so the freshest items appear at the top of the dropdown.
  const items = pending
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 20)
    .map((c) => ({
      id: c.id,
      title: c.title,
      updated_at: c.updated_at,
      body: c.body,
    }));
  return <NotificationDropdown items={items} />;
}
