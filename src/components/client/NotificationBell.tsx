// Bell icon in the client header. Shows a red count badge for content cards
// in the "proposed" stage — i.e. items waiting for the client's approval.
// Clicking the bell goes to /client/content where they can act on them.

import Link from "next/link";
import { data } from "@/lib/data";

interface Props {
  clientId: string;
}

export default async function NotificationBell({ clientId }: Props) {
  const pending = await data.listContent({ clientId, stage: "proposed" });
  const count = pending.length;

  return (
    <Link
      href="/client/content"
      aria-label={count > 0 ? `${count} pending approvals` : "Notifications"}
      title={count > 0 ? `${count} pending approval${count === 1 ? "" : "s"}` : "No new notifications"}
      className="relative inline-flex items-center justify-center w-9 h-9 rounded-lg hover:bg-[var(--color-bg-hover)] transition"
    >
      <span className="text-xl leading-none" aria-hidden>🔔</span>
      {count > 0 ? (
        <span
          className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold leading-none flex items-center justify-center tabular-nums shadow-sm ring-2 ring-[var(--color-bg-elev)]"
        >
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}
