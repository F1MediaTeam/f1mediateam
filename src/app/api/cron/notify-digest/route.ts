// Activity digest — runs every 15 minutes (Supabase pg_cron → this route).
// Groups queued notification_events into ONE email per recipient once the
// batch has been quiet for QUIET_MINUTES, and skips recipients who have
// visited the portal since the newest event (profiles.last_seen_at).
//
// Auth: Authorization: Bearer <CRON_SECRET>.

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { notifyClient, notifyAdmins } from "@/lib/email";

export const dynamic = "force-dynamic";

const QUIET_MINUTES = 30;

const KIND_LABELS: Record<string, string> = {
  content_proposed: "New content for your review",
  content_approved: "Content approved",
  content_posted: "Content posted",
  content_submitted: "Content submitted",
  calendar_meeting: "New meeting",
  calendar_deadline: "New deadline",
};

interface EventRow {
  id: string;
  client_id: string;
  audience: "client" | "admin";
  kind: string;
  title: string;
  detail: string | null;
  created_at: string;
}

function line(e: EventRow): string {
  const label = KIND_LABELS[e.kind] ?? "Update";
  return `• ${label}: "${e.title}"${e.detail ? ` — ${e.detail}` : ""}`;
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createServiceClient();
  const quietCutoff = new Date(Date.now() - QUIET_MINUTES * 60_000).toISOString();

  // A batch is ready when its NEWEST unsent event is older than the quiet
  // window — so a burst of 30 approvals settles into a single email.
  const { data } = await supabase
    .from("notification_events")
    .select("*")
    .is("sent_at", null)
    .order("created_at", { ascending: true })
    .limit(500);
  const events = (data ?? []) as EventRow[];
  if (events.length === 0) return NextResponse.json({ sent: 0 });

  const now = new Date().toISOString();
  let emailsSent = 0;
  const doneIds: string[] = [];

  // ---- client-audience: one group per client company ----
  const clientGroups = new Map<string, EventRow[]>();
  for (const e of events.filter((e) => e.audience === "client")) {
    (clientGroups.get(e.client_id) ?? clientGroups.set(e.client_id, []).get(e.client_id))!.push(e);
  }
  for (const [clientId, group] of clientGroups) {
    const newest = group[group.length - 1].created_at;
    if (newest > quietCutoff) continue; // still active — wait for quiet

    const { data: user } = await supabase
      .from("profiles")
      .select("id,last_seen_at")
      .eq("client_id", clientId)
      .eq("role", "client")
      .maybeSingle();

    // Portal visited after the last event → they've seen it; skip the email.
    if (user?.last_seen_at && user.last_seen_at > newest) {
      doneIds.push(...group.map((e) => e.id));
      continue;
    }

    await notifyClient(clientId, {
      subject: "What's new on your portal",
      heading: "What's new on your portal",
      body: group.map(line).join("\n"),
      ctaLabel: "Open your portal",
      ctaPath: "/client",
    });
    emailsSent++;
    doneIds.push(...group.map((e) => e.id));
  }

  // ---- admin-audience: one email covering all clients ----
  const adminEvents = events.filter((e) => e.audience === "admin");
  if (adminEvents.length > 0) {
    const newest = adminEvents[adminEvents.length - 1].created_at;
    if (newest <= quietCutoff) {
      const { data: admins } = await supabase
        .from("profiles")
        .select("last_seen_at")
        .eq("role", "admin");
      const allSeen =
        (admins ?? []).length > 0 &&
        (admins ?? []).every((a) => a.last_seen_at && a.last_seen_at > newest);

      if (!allSeen) {
        // Label each line with the company it belongs to.
        const ids = [...new Set(adminEvents.map((e) => e.client_id))];
        const { data: companies } = await supabase
          .from("clients")
          .select("id,company_name")
          .in("id", ids);
        const nameOf = new Map((companies ?? []).map((c) => [c.id, c.company_name]));
        await notifyAdmins({
          subject: "Client activity update",
          heading: "Client activity update",
          body: adminEvents
            .map((e) => `${line(e)} (${nameOf.get(e.client_id) ?? "Unknown client"})`)
            .join("\n"),
          ctaLabel: "Open admin",
          ctaPath: "/admin",
        });
        emailsSent++;
      }
      doneIds.push(...adminEvents.map((e) => e.id));
    }
  }

  if (doneIds.length > 0) {
    await supabase.from("notification_events").update({ sent_at: now }).in("id", doneIds);
  }
  return NextResponse.json({ sent: emailsSent, settled: doneIds.length });
}
