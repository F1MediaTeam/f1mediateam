// Legacy URL — meeting-deck merged into the Reports page. Preserves bookmarks
// and any inbound links by 308-redirecting straight to /admin/reports.

import { redirect } from "next/navigation";

export default function MeetingDeckRedirect({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  // Forward the ?client= search param so /admin/reports can default to the same
  // client the admin had selected.
  void searchParams;
  redirect("/admin/reports");
}
