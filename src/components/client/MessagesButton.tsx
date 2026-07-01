// Server wrapper for the client-portal message button. Fetches the thread +
// unread count and hands them to the client-side popover which owns state.

import { data } from "@/lib/data";
import MessagesPopover from "./MessagesPopover";

interface Props {
  clientId: string;
  userId: string;
}

export default async function MessagesButton({ clientId, userId }: Props) {
  const [messages, unread] = await Promise.all([
    data.listMessages(clientId),
    data.countUnreadMessages(clientId, "client"),
  ]);
  return (
    <MessagesPopover
      clientId={clientId}
      userId={userId}
      initialUnread={unread}
      initialMessages={messages.map((m) => ({
        id: m.id,
        from_role: m.from_role,
        body: m.body,
        created_at: m.created_at,
      }))}
    />
  );
}
