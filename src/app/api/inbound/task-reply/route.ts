// POST /api/inbound/task-reply
//
// Replying to the end-of-day summary updates the task list.
//
// Auth is a shared secret in the Authorization header, exactly like the other
// inbound webhook. The sender address is checked too, but as defence in depth
// only — a From: header is trivially forged and is not a credential.
//
//   Authorization: Bearer <INBOUND_WEBHOOK_SECRET>
//
// Body: whatever the inbound provider posts. Resend's shape is
// { from, subject, text, html }; `from` may be a string or { email }.
//
// Instructions, one per line, case-insensitive:
//
//   done T-7                  close it
//   reopen T-7                put it back
//   add Fix the calendar      new internal task
//   note T-7 waiting on logo  append a note
//
// Anything it does not understand is ignored and reported back, rather than
// guessed at. A task list that silently does the wrong thing is worse than one
// that says it did not understand you.

import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { notifyAdmins } from "@/lib/email";
import { newTextOnly } from "@/lib/email-reply";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Applied {
  done: number[];
  reopened: number[];
  added: string[];
  noted: number[];
  unrecognised: string[];
  notFound: number[];
}

export async function POST(request: NextRequest) {
  const secret = process.env.INBOUND_WEBHOOK_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const fromRaw = payload.from;
  const from = (
    typeof fromRaw === "string"
      ? fromRaw
      : ((fromRaw as { email?: string })?.email ?? "")
  ).toLowerCase();

  const supabase = await createServiceClient();

  // Defence in depth: the secret is the actual guard, but a reply from an
  // address that is not an admin has no business editing the list.
  const { data: admins } = await supabase.from("profiles").select("email").eq("role", "admin");
  const adminEmails = new Set(
    ((admins as Array<{ email: string | null }>) ?? [])
      .map((a) => (a.email ?? "").toLowerCase())
      .filter(Boolean),
  );
  const senderOk = [...adminEmails].some((e) => from.includes(e));
  if (!senderOk) {
    return Response.json({ error: "Sender is not an admin" }, { status: 403 });
  }

  const text = newTextOnly(String(payload.text ?? ""));
  if (!text) return Response.json({ ok: true, note: "Nothing to do — reply was empty." });

  const applied: Applied = { done: [], reopened: [], added: [], noted: [], unrecognised: [], notFound: [] };

  const setStatus = async (ref: number, status: "open" | "done", bucket: number[]) => {
    const { data } = await supabase
      .from("tasks")
      .update({ status })
      .eq("ref", ref)
      .select("ref")
      .maybeSingle();
    if (data) bucket.push(ref);
    else applied.notFound.push(ref);
  };

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    let m: RegExpMatchArray | null;

    if ((m = line.match(/^done\s+(?:t-)?(\d+)\b/i))) {
      await setStatus(Number(m[1]), "done", applied.done);
    } else if ((m = line.match(/^reopen\s+(?:t-)?(\d+)\b/i))) {
      await setStatus(Number(m[1]), "open", applied.reopened);
    } else if ((m = line.match(/^note\s+(?:t-)?(\d+)\s+(.+)$/i))) {
      const ref = Number(m[1]);
      const { data: existing } = await supabase
        .from("tasks")
        .select("notes")
        .eq("ref", ref)
        .maybeSingle();
      if (!existing) {
        applied.notFound.push(ref);
      } else {
        const prior = (existing as { notes: string | null }).notes;
        const { data } = await supabase
          .from("tasks")
          .update({ notes: prior ? `${prior}\n${m[2]}` : m[2] })
          .eq("ref", ref)
          .select("ref")
          .maybeSingle();
        if (data) applied.noted.push(ref);
        else applied.notFound.push(ref);
      }
    } else if ((m = line.match(/^add\s+(.+)$/i))) {
      const title = m[1].trim().slice(0, 300);
      // Internal by default: a task arriving by email is F1 Media's own work
      // unless somebody says otherwise, and there is no way to say otherwise
      // in one line without guessing which client was meant.
      const { data } = await supabase
        .from("tasks")
        .insert({ client_id: null, title, status: "open" })
        .select("ref")
        .maybeSingle();
      if (data) applied.added.push(title);
    } else {
      applied.unrecognised.push(line.slice(0, 120));
    }
  }

  const touched =
    applied.done.length + applied.reopened.length + applied.added.length + applied.noted.length;

  // Always confirm. Sending an instruction into silence and hoping is the
  // failure mode this whole feature exists to prevent.
  const parts: string[] = [];
  if (applied.done.length) parts.push(`Closed: ${applied.done.map((r) => `T-${r}`).join(", ")}`);
  if (applied.reopened.length) parts.push(`Reopened: ${applied.reopened.map((r) => `T-${r}`).join(", ")}`);
  if (applied.noted.length) parts.push(`Noted on: ${applied.noted.map((r) => `T-${r}`).join(", ")}`);
  if (applied.added.length) parts.push(`Added:\n${applied.added.map((t) => `• ${t}`).join("\n")}`);
  if (applied.notFound.length)
    parts.push(`No such task: ${applied.notFound.map((r) => `T-${r}`).join(", ")}`);
  if (applied.unrecognised.length)
    parts.push(
      `Did not understand, so nothing was done with these:\n` +
        applied.unrecognised.map((l) => `• ${l}`).join("\n"),
    );

  await notifyAdmins({
    subject: touched > 0 ? `Task list updated — ${touched} change${touched === 1 ? "" : "s"}` : "Task list unchanged",
    heading: touched > 0 ? "Task list updated" : "Nothing changed",
    body: parts.join("\n\n") || "Nothing in that reply looked like an instruction.",
    ctaLabel: "Open admin",
    ctaPath: "/admin",
  });

  return Response.json({ ok: true, applied });
}
