import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";
import SlideDeck from "@/components/admin/SlideDeck";
import { buildDeck, type Slide } from "@/lib/slides";

export default async function PresentMeeting({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const meeting = await data.getMeeting(id);
  if (!meeting) notFound();
  const client = await data.getClient(meeting.client_id);
  if (!client) notFound();
  // A saved customized deck wins over the live auto-generated one.
  const slides =
    (meeting.deck as Slide[] | null | undefined) ?? (await buildDeck({ meeting, client }));

  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      <SlideDeck slides={slides} mode="present" />
    </main>
  );
}
