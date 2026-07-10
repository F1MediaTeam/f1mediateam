// End-of-day summary — runs once daily (Supabase pg_cron → this route).
// Unlike the activity digest (what HAPPENED), this reports what's still
// OUTSTANDING so nothing sits unnoticed:
//   client: content awaiting their approval, unread messages, next-48h events
//   admin:  approved content ready to post, unread client messages,
//           overdue/today tasks, next-48h deadlines
// Sends nothing when a recipient has nothing outstanding.
//
// Auth: Authorization: Bearer <CRON_SECRET>.

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { notifyClient, notifyAdmins } from "@/lib/email";

export const dynamic = "force-dynamic";

const EVENT_WINDOW_HOURS = 48;

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Phoenix",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createServiceClient();
  const nowIso = new Date().toISOString();
  const windowEnd = new Date(Date.now() + EVENT_WINDOW_HOURS * 3600_000).toISOString();

  const { data: clients } = await supabase.from("clients").select("id,company_name");
  let emailsSent = 0;

  // ---------- per-client "needs your attention" ----------
  for (const c of clients ?? []) {
    const sections: string[] = [];

    const { data: proposed } = await supabase
      .from("content_cards")
      .select("title")
      .eq("client_id", c.id)
      .eq("stage", "proposed");
    if (proposed?.length) {
      sections.push(
        `Content waiting on your approval (${proposed.length}):\n` +
          proposed.map((p) => `• "${p.title}"`).join("\n"),
      );
    }

    const { count: unread } = await supabase
      .from("client_messages")
      .select("id", { count: "exact", head: true })
      .eq("client_id", c.id)
      .eq("from_role", "admin")
      .is("read_at", null);
    if (unread) {
      sections.push(`Unread messages from your F1 Media Team: ${unread}`);
    }

    const { data: upcoming } = await supabase
      .from("calendar_events")
      .select("title,starts_at,type")
      .eq("client_id", c.id)
      .gte("starts_at", nowIso)
      .lte("starts_at", windowEnd)
      .order("starts_at");
    if (upcoming?.length) {
      sections.push(
        "Coming up in the next 48 hours:\n" +
          upcoming
            .map((e) => `• ${e.type === "deadline" ? "Deadline" : "Meeting"}: "${e.title}" — ${fmtWhen(e.starts_at)}`)
            .join("\n"),
      );
    }

    if (sections.length === 0) continue;
    await notifyClient(c.id, {
      subject: "Your daily F1 Media Team summary",
      heading: "Here's what needs your attention",
      body: sections.join("\n\n"),
      ctaLabel: "Open your portal",
      ctaPath: "/client",
    });
    emailsSent++;
  }

  // ---------- admin "needs your attention" ----------
  const nameOf = new Map((clients ?? []).map((c) => [c.id, c.company_name]));
  const adminSections: string[] = [];

  const { data: pending } = await supabase
    .from("content_cards")
    .select("title,client_id")
    .eq("stage", "pending");
  if (pending?.length) {
    adminSections.push(
      `Approved content ready to post (${pending.length}):\n` +
        pending.map((p) => `• "${p.title}" (${nameOf.get(p.client_id) ?? "?"})`).join("\n"),
    );
  }

  const { data: unreadMsgs } = await supabase
    .from("client_messages")
    .select("client_id")
    .eq("from_role", "client")
    .is("read_at", null);
  if (unreadMsgs?.length) {
    const perClient = new Map<string, number>();
    for (const m of unreadMsgs) perClient.set(m.client_id, (perClient.get(m.client_id) ?? 0) + 1);
    adminSections.push(
      "Unread client messages:\n" +
        [...perClient].map(([id, n]) => `• ${nameOf.get(id) ?? "?"}: ${n}`).join("\n"),
    );
  }

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Phoenix" });
  const { data: dueTasks } = await supabase
    .from("tasks")
    .select("title,due_date,client_id")
    .eq("status", "open")
    .lte("due_date", today);
  if (dueTasks?.length) {
    adminSections.push(
      `Tasks due or overdue (${dueTasks.length}):\n` +
        dueTasks
          .map((t) => `• "${t.title}" (${nameOf.get(t.client_id) ?? "?"}) — due ${t.due_date}`)
          .join("\n"),
    );
  }

  const { data: deadlines } = await supabase
    .from("calendar_events")
    .select("title,starts_at,client_id")
    .eq("type", "deadline")
    .gte("starts_at", nowIso)
    .lte("starts_at", windowEnd)
    .order("starts_at");
  if (deadlines?.length) {
    adminSections.push(
      "Deadlines in the next 48 hours:\n" +
        deadlines
          .map((d) => `• "${d.title}" (${nameOf.get(d.client_id) ?? "internal"}) — ${fmtWhen(d.starts_at)}`)
          .join("\n"),
    );
  }

  if (adminSections.length > 0) {
    await notifyAdmins({
      subject: "Your end-of-day F1 Media summary",
      heading: "End of day — still open",
      body: adminSections.join("\n\n"),
      ctaLabel: "Open admin",
      ctaPath: "/admin",
    });
    emailsSent++;
  }

  return NextResponse.json({ sent: emailsSent });
}
