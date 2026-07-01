// Server wrapper for the client-portal message button. Fetches the thread +
// unread count and hands them to the client-side popover which owns state.

import { data } from "@/lib/data";
import { signMessageAttachments } from "@/lib/data/supabase-adapter";
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
  // Sign attachment paths per message so the browser can render inline. Cheap
  // because signLogoUrl-style caching in signMessageAttachments reuses signed
  // URLs from the Next.js data cache.
  const withUrls = await Promise.all(
    messages.map(async (m) => ({
      id: m.id,
      from_role: m.from_role,
      body: m.body,
      created_at: m.created_at,
      attachments: await signMessageAttachments(m.attachments ?? []),
    })),
  );
  return (
    <MessagesPopover
      clientId={clientId}
      userId={userId}
      initialUnread={unread}
      initialMessages={withUrls}
    />
  );
}
