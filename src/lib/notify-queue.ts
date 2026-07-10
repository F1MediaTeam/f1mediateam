// Batched notifications. Flood-prone events (content stage changes, calendar
// adds) are queued into notification_events instead of emailing immediately;
// /api/cron/notify-digest groups them into one email per recipient after a
// quiet period, and skips recipients who have visited the portal since the
// activity happened.
//
// Safety valve: if the queue insert fails (e.g. the migration hasn't been
// applied yet), the provided fallback email is sent immediately so no
// notification is ever silently dropped.

import { createServiceClient } from "@/lib/supabase/server";
import { notifyClient, notifyAdmins, type NotificationEmail } from "@/lib/email";

export type EventKind =
  | "content_proposed"
  | "content_approved"
  | "content_posted"
  | "content_submitted"
  | "calendar_meeting"
  | "calendar_deadline";

export interface QueuedEvent {
  client_id: string;
  /** Who should be emailed about it. */
  audience: "client" | "admin";
  kind: EventKind;
  title: string;
  detail?: string | null;
}

export async function queueEvent(ev: QueuedEvent, fallback: NotificationEmail): Promise<void> {
  try {
    const supabase = await createServiceClient();
    const { error } = await supabase.from("notification_events").insert({
      client_id: ev.client_id,
      audience: ev.audience,
      kind: ev.kind,
      title: ev.title,
      detail: ev.detail ?? null,
    });
    if (error) throw error;
  } catch (err) {
    console.warn("[notify-queue] insert failed, sending immediately:", err);
    if (ev.audience === "client") await notifyClient(ev.client_id, fallback);
    else await notifyAdmins(fallback);
  }
}
