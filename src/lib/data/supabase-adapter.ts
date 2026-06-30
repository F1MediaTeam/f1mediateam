// Supabase data adapter — same surface as mock-adapter.ts but async + DB-backed.
// Every function awaits a server-side Supabase client per call. RLS handles
// the multi-tenancy; admin operations rely on the admin role's full-table
// policies that we shipped in 0002_rls_policies.sql.

import { createClient, createServiceClient } from "@/lib/supabase/server";
import type {
  CalendarEvent,
  CalendarEventAttachment,
  Client,
  ContentCard,
  ContentCardEvent,
  ContentStage,
  EmailPref,
  FileRecord,
  LoginAudit,
  MetricSnapshot,
  Profile,
  Task,
  UserRole,
  UUID,
  ConnectorToken,
  SemrushReport,
} from "@/lib/types";

// ---------- session ----------

export interface Session {
  user_id: UUID;
  role: UserRole;
  client_id: UUID | null;
  email: string;
  full_name: string | null;
  // When set, the real user is an admin viewing the portal AS this client.
  is_impersonating?: boolean;
  actual_admin_id?: UUID;
  impersonation_id?: UUID;
}

export async function signIn(email: string, password: string): Promise<Session | null> {
  const supabase = await createClient();
  const { data: authData, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !authData.user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, client_id, email, full_name")
    .eq("id", authData.user.id)
    .single();

  if (!profile) {
    // Shouldn't happen — the bootstrap trigger creates a profile on signup.
    // But if it does, log them out so the UI doesn't hang.
    await supabase.auth.signOut();
    return null;
  }

  return {
    user_id: profile.id,
    role: profile.role,
    client_id: profile.client_id,
    email: profile.email,
    full_name: profile.full_name,
  };
}

export async function signUp(email: string, password: string, fullName?: string): Promise<{ session: Session | null; error: string | null }> {
  const supabase = await createClient();
  const { data: authData, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: fullName ? { full_name: fullName } : undefined },
  });
  if (error) return { session: null, error: error.message };
  if (!authData.user) return { session: null, error: "Signup did not return a user." };

  // If email confirmation is enabled in the Supabase project, the user
  // won't have a session yet — they need to click a confirmation link.
  if (!authData.session) {
    return { session: null, error: "Check your email to confirm your account before signing in." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, client_id, email, full_name")
    .eq("id", authData.user.id)
    .single();

  if (!profile) return { session: null, error: "Profile bootstrap failed." };

  return {
    session: {
      user_id: profile.id,
      role: profile.role,
      client_id: profile.client_id,
      email: profile.email,
      full_name: profile.full_name,
    },
    error: null,
  };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
}

export interface LoginContext {
  ip: string | null;
  user_agent: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
}

export async function logLogin(
  session: Session,
  ctx: LoginContext,
): Promise<void> {
  const supabase = await createClient();
  await supabase.from("login_audit").insert({
    client_id: session.client_id,
    user_id: session.user_id,
    ip: ctx.ip,
    user_agent: ctx.user_agent,
    city: ctx.city,
    region: ctx.region,
    country: ctx.country,
  });
}

// ---------- profiles ----------

export async function getProfile(userId: UUID): Promise<Profile | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
  return (data as Profile) ?? null;
}

export async function getClientUser(clientId: UUID): Promise<Profile | null> {
  // Returns the customer-side user assigned to this client (if any). Used to
  // decide whether to show the "create customer account" form on a client's
  // admin profile page, or the content board (because the account exists).
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("client_id", clientId)
    .eq("role", "client")
    .maybeSingle();
  return (data as Profile) ?? null;
}

// ---------- clients ----------

export async function listClients(): Promise<Client[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("clients")
    .select("*")
    .order("company_name", { ascending: true });
  return (data as Client[]) ?? [];
}

export async function getClient(id: UUID): Promise<Client | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("clients").select("*").eq("id", id).single();
  return (data as Client) ?? null;
}

export async function updateClientConfig(
  id: UUID,
  patch: Partial<Client["config"]>,
): Promise<Client | null> {
  const supabase = await createClient();
  const existing = await getClient(id);
  if (!existing) return null;
  const merged = {
    ...existing.config,
    ...patch,
    widgets: { ...existing.config.widgets, ...(patch.widgets ?? {}) },
  };
  const { data } = await supabase
    .from("clients")
    .update({ config: merged })
    .eq("id", id)
    .select()
    .single();
  return (data as Client) ?? null;
}

export async function deleteClient(id: UUID): Promise<boolean> {
  const supabase = await createClient();
  // FK cascades handle tasks / calendar / metric_snapshots / content / files /
  // login_audit / connector_tokens. The profile.client_id is also cascaded by
  // ON DELETE CASCADE in 0001_initial_schema.sql.
  const { error } = await supabase.from("clients").delete().eq("id", id);
  return !error;
}

export async function createClientRow(input: {
  company_name: string;
  join_date?: string;
  websites?: string[];
}): Promise<Client | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("clients")
    .insert({
      company_name: input.company_name,
      join_date: input.join_date ?? new Date().toISOString().slice(0, 10),
      websites: input.websites ?? [],
      config: {
        widgets: { rankings: true, traffic: true, content: true, files: true, calendar: true },
      },
    })
    .select()
    .single();
  return (data as Client) ?? null;
}

// ---------- tasks ----------

export async function listTasks(filter?: {
  clientId?: UUID;
  status?: Task["status"];
}): Promise<Task[]> {
  const supabase = await createClient();
  let q = supabase.from("tasks").select("*");
  if (filter?.clientId) q = q.eq("client_id", filter.clientId);
  if (filter?.status) q = q.eq("status", filter.status);
  const { data } = await q;
  return (data as Task[]) ?? [];
}

export async function createTask(input: {
  client_id: UUID;
  title: string;
  notes?: string | null;
  due_date?: string | null;
  assigned_by?: UUID | null;
}): Promise<Task | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tasks")
    .insert({
      client_id: input.client_id,
      title: input.title,
      notes: input.notes ?? null,
      due_date: input.due_date ?? null,
      assigned_by: input.assigned_by ?? null,
    })
    .select()
    .single();
  return (data as Task) ?? null;
}

export async function updateTask(id: UUID, patch: Partial<Task>): Promise<Task | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("tasks").update(patch).eq("id", id).select().single();
  return (data as Task) ?? null;
}

export async function deleteTask(id: UUID): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  return !error;
}

// ---------- calendar ----------

export async function listCalendar(filter?: {
  clientId?: UUID;
  from?: string;
  to?: string;
}): Promise<CalendarEvent[]> {
  const supabase = await createClient();
  let q = supabase.from("calendar_events").select("*").order("starts_at", { ascending: true });
  if (filter?.clientId) q = q.eq("client_id", filter.clientId);
  if (filter?.from) q = q.gte("starts_at", filter.from);
  if (filter?.to) q = q.lte("starts_at", filter.to);
  const { data } = await q;
  return (data as CalendarEvent[]) ?? [];
}

export async function createCalendarEvent(input: {
  client_id: UUID | null;
  type: CalendarEvent["type"];
  title: string;
  notes?: string | null;
  starts_at: string;
  ends_at?: string | null;
  created_by?: UUID | null;
}): Promise<CalendarEvent | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("calendar_events")
    .insert({
      client_id: input.client_id,
      type: input.type,
      title: input.title,
      notes: input.notes ?? null,
      starts_at: input.starts_at,
      ends_at: input.ends_at ?? null,
      created_by: input.created_by ?? null,
    })
    .select()
    .single();
  return (data as CalendarEvent) ?? null;
}

export async function deleteCalendarEvent(id: UUID): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase.from("calendar_events").delete().eq("id", id);
  return !error;
}

// ---------- calendar event attachments ----------

export async function listEventAttachments(eventId: UUID): Promise<CalendarEventAttachment[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("calendar_event_attachments")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });
  return (data as CalendarEventAttachment[]) ?? [];
}

export async function listAttachmentsForEvents(eventIds: UUID[]): Promise<CalendarEventAttachment[]> {
  if (eventIds.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("calendar_event_attachments")
    .select("*")
    .in("event_id", eventIds);
  return (data as CalendarEventAttachment[]) ?? [];
}

export async function recordEventAttachment(input: {
  event_id: UUID;
  storage_path: string;
  filename: string;
  mime_type?: string | null;
  size_bytes?: number | null;
  uploaded_by?: UUID | null;
}): Promise<CalendarEventAttachment | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("calendar_event_attachments")
    .insert({
      event_id: input.event_id,
      storage_path: input.storage_path,
      filename: input.filename,
      mime_type: input.mime_type ?? null,
      size_bytes: input.size_bytes ?? null,
      uploaded_by: input.uploaded_by ?? null,
    })
    .select()
    .single();
  return (data as CalendarEventAttachment) ?? null;
}

export async function deleteEventAttachment(id: UUID): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase.from("calendar_event_attachments").delete().eq("id", id);
  return !error;
}

// ---------- metric snapshots ----------

export async function listSnapshots(filter: {
  clientId: UUID;
  metric?: string;
  from?: string;
  to?: string;
}): Promise<MetricSnapshot[]> {
  const supabase = await createClient();
  let q = supabase
    .from("metric_snapshots")
    .select("*")
    .eq("client_id", filter.clientId)
    .order("captured_at", { ascending: true });
  if (filter.metric) q = q.eq("metric", filter.metric);
  if (filter.from) q = q.gte("captured_at", filter.from);
  if (filter.to) q = q.lte("captured_at", filter.to);
  const { data } = await q;
  return (data as MetricSnapshot[]) ?? [];
}

export async function getBaseline(clientId: UUID, metric: string): Promise<MetricSnapshot | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("metric_snapshots")
    .select("*")
    .eq("client_id", clientId)
    .eq("metric", metric)
    .eq("is_baseline", true)
    .maybeSingle();
  return (data as MetricSnapshot) ?? null;
}

export async function getLatest(clientId: UUID, metric: string): Promise<MetricSnapshot | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("metric_snapshots")
    .select("*")
    .eq("client_id", clientId)
    .eq("metric", metric)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as MetricSnapshot) ?? null;
}

export async function writeSnapshot(
  input: Omit<MetricSnapshot, "id" | "created_at">,
): Promise<MetricSnapshot | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("metric_snapshots")
    .upsert(input, { onConflict: "client_id,source,metric,captured_at" })
    .select()
    .single();
  return (data as MetricSnapshot) ?? null;
}

/**
 * Bulk-upsert many snapshots in a single round-trip. Use this when ingesting
 * a connector sync result so we don't time out doing 1k+ sequential awaits.
 */
export async function writeSnapshots(
  rows: Array<Omit<MetricSnapshot, "id" | "created_at">>,
): Promise<number> {
  if (rows.length === 0) return 0;
  // Some upstream APIs (Bing's GetRankAndTrafficStats in particular) return
  // duplicate rows for the same Date. Without deduping, Postgres rejects the
  // whole upsert with: "ON CONFLICT DO UPDATE command cannot affect row a
  // second time". Keep the last value for each (client_id, source, metric,
  // captured_at) tuple.
  const dedup = new Map<string, typeof rows[number]>();
  for (const r of rows) {
    const key = `${r.client_id}|${r.source}|${r.metric}|${r.captured_at}`;
    dedup.set(key, r);
  }
  const unique = [...dedup.values()];

  const supabase = await createServiceClient();
  const { error } = await supabase
    .from("metric_snapshots")
    .upsert(unique, { onConflict: "client_id,source,metric,captured_at" });
  if (error) throw new Error(`writeSnapshots failed: ${error.message}`);
  return unique.length;
}

/**
 * Delete every snapshot for one client + source. Used by connectors that return
 * their full history each sync (SEMrush) so we can replace rather than
 * accumulate — clears out stale/bogus rows from past bugs.
 */
export async function deleteSnapshotsBySource(clientId: UUID, source: string): Promise<number> {
  const supabase = await createServiceClient();
  const { error, count } = await supabase
    .from("metric_snapshots")
    .delete({ count: "exact" })
    .eq("client_id", clientId)
    .eq("source", source);
  if (error) throw new Error(`deleteSnapshotsBySource failed: ${error.message}`);
  return count ?? 0;
}

/**
 * Has this client ever had a SEMrush history pull stored? Used by the daily
 * connector to decide whether to pay the ~600-unit history call or skip it.
 */
export async function hasSemrushHistory(clientId: UUID): Promise<boolean> {
  const supabase = await createServiceClient();
  const today = new Date().toISOString().slice(0, 10);
  const { count, error } = await supabase
    .from("metric_snapshots")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .eq("source", "semrush")
    .lt("captured_at", today);
  if (error) return false;
  return (count ?? 0) > 0;
}

/**
 * Patch a connector token's meta JSON. Used by the admin SEMrush settings page
 * to persist Site Audit / Position Tracking IDs and manual AI Visibility +
 * Mentions values without touching credentials.
 */
export async function updateConnectorMeta(
  tokenId: UUID,
  patch: Record<string, unknown>,
): Promise<void> {
  const supabase = await createServiceClient();
  const { data: row, error: readErr } = await supabase
    .from("connector_tokens")
    .select("meta")
    .eq("id", tokenId)
    .single();
  if (readErr) throw new Error(`updateConnectorMeta read failed: ${readErr.message}`);
  const merged = { ...(row?.meta ?? {}), ...patch };
  const { error: writeErr } = await supabase
    .from("connector_tokens")
    .update({ meta: merged, updated_at: new Date().toISOString() })
    .eq("id", tokenId);
  if (writeErr) throw new Error(`updateConnectorMeta write failed: ${writeErr.message}`);
}

// ---------- content ----------

export async function listContent(filter?: {
  clientId?: UUID;
  stage?: ContentStage;
}): Promise<ContentCard[]> {
  const supabase = await createClient();
  let q = supabase.from("content_cards").select("*").order("updated_at", { ascending: false });
  if (filter?.clientId) q = q.eq("client_id", filter.clientId);
  if (filter?.stage) q = q.eq("stage", filter.stage);
  const { data } = await q;
  return (data as ContentCard[]) ?? [];
}

export async function getContent(id: UUID): Promise<ContentCard | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("content_cards").select("*").eq("id", id).single();
  return (data as ContentCard) ?? null;
}

export async function listContentEvents(cardId: UUID): Promise<ContentCardEvent[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("content_card_events")
    .select("*")
    .eq("card_id", cardId)
    .order("created_at", { ascending: false });
  return (data as ContentCardEvent[]) ?? [];
}

export async function createContent(input: {
  client_id: UUID;
  title: string;
  body?: string | null;
  link?: string | null;
  file_url?: string | null;
  created_by?: UUID | null;
}): Promise<ContentCard | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("content_cards")
    .insert({
      client_id: input.client_id,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
      file_url: input.file_url ?? null,
      stage: "proposed",
      created_by: input.created_by ?? null,
    })
    .select()
    .single();
  return (data as ContentCard) ?? null;
}

// Client-submitted proposals. Clients had their direct INSERT revoked
// (migration 0006), so this goes through the service role with locked-down
// fields — the caller (client action) pins client_id to the requester's own
// client and stage is always `proposed`.
export async function createClientContent(input: {
  client_id: UUID;
  title: string;
  body?: string | null;
  link?: string | null;
  created_by?: UUID | null;
}): Promise<ContentCard | null> {
  const supabase = await createServiceClient();
  const { data } = await supabase
    .from("content_cards")
    .insert({
      client_id: input.client_id,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
      file_url: null,
      stage: "proposed",
      created_by: input.created_by ?? null,
    })
    .select()
    .single();
  return (data as ContentCard) ?? null;
}

const STAGE_ORDER: ContentStage[] = ["proposed", "pending", "posted"];

export async function moveContentStage(
  cardId: UUID,
  direction: "forward" | "back",
  actor: { user_id: UUID; role: UserRole; client_id: UUID | null },
  note?: string | null,
): Promise<{ card: ContentCard; event: ContentCardEvent } | { error: string }> {
  const supabase = await createClient();
  const { data: card } = await supabase
    .from("content_cards")
    .select("*")
    .eq("id", cardId)
    .single();
  if (!card) return { error: "Card not found" };

  if (actor.role === "client" && (card as ContentCard).client_id !== actor.client_id) {
    return { error: "Forbidden" };
  }

  const idx = STAGE_ORDER.indexOf((card as ContentCard).stage);
  const targetIdx = direction === "forward" ? idx + 1 : idx - 1;
  if (targetIdx < 0 || targetIdx >= STAGE_ORDER.length) {
    return { error: "No further stage in that direction" };
  }
  const target = STAGE_ORDER[targetIdx];

  if (actor.role === "client") {
    if (!(direction === "forward" && (card as ContentCard).stage === "proposed")) {
      return { error: "Clients can only approve a proposed card" };
    }
  }

  const from = (card as ContentCard).stage;

  const { data: updated } = await supabase
    .from("content_cards")
    .update({ stage: target })
    .eq("id", cardId)
    .select()
    .single();
  if (!updated) return { error: "Update failed" };

  const { data: event } = await supabase
    .from("content_card_events")
    .insert({
      card_id: cardId,
      from_stage: from,
      to_stage: target,
      actor_user_id: actor.user_id,
      actor_role: actor.role,
      note: note ?? null,
    })
    .select()
    .single();

  return { card: updated as ContentCard, event: event as ContentCardEvent };
}

export async function deleteContent(cardId: UUID): Promise<void> {
  const supabase = await createClient();
  // content_card_events.card_id FK cascades on delete (per 0001 schema).
  await supabase.from("content_cards").delete().eq("id", cardId);
}

export async function updateContent(
  cardId: UUID,
  patch: Partial<Pick<ContentCard, "title" | "body" | "link">>,
): Promise<ContentCard | null> {
  const supabase = await createClient();
  const updateRow: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) updateRow.title = patch.title;
  if (patch.body !== undefined) updateRow.body = patch.body;
  if (patch.link !== undefined) updateRow.link = patch.link;
  const { data } = await supabase
    .from("content_cards")
    .update(updateRow)
    .eq("id", cardId)
    .select()
    .single();
  return (data as ContentCard) ?? null;
}

export async function rejectContent(
  cardId: UUID,
  actor: { user_id: UUID; role: UserRole; client_id: UUID | null },
  note: string,
): Promise<{ card: ContentCard; event: ContentCardEvent } | { error: string }> {
  const supabase = await createClient();
  const { data: card } = await supabase
    .from("content_cards")
    .select("*")
    .eq("id", cardId)
    .single();
  if (!card) return { error: "Card not found" };
  if (actor.role !== "client" || (card as ContentCard).client_id !== actor.client_id) {
    return { error: "Only the owning client can request changes" };
  }
  if ((card as ContentCard).stage !== "proposed") {
    return { error: "Can only request changes on a proposed card" };
  }

  const { data: event } = await supabase
    .from("content_card_events")
    .insert({
      card_id: cardId,
      from_stage: "proposed",
      to_stage: "proposed",
      actor_user_id: actor.user_id,
      actor_role: actor.role,
      note: `CHANGES REQUESTED: ${note}`,
    })
    .select()
    .single();

  // Touch updated_at by re-saving the stage.
  await supabase
    .from("content_cards")
    .update({ stage: "proposed" })
    .eq("id", cardId);

  return { card: card as ContentCard, event: event as ContentCardEvent };
}

// ---------- files ----------

export async function listFiles(clientId: UUID): Promise<FileRecord[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("files")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  return (data as FileRecord[]) ?? [];
}

export async function recordFile(
  input: Omit<FileRecord, "id" | "created_at">,
): Promise<FileRecord | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("files").insert(input).select().single();
  return (data as FileRecord) ?? null;
}

export async function deleteFile(id: UUID): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase.from("files").delete().eq("id", id);
  return !error;
}

// ---------- audit ----------

export async function listAudit(filter?: {
  clientId?: UUID;
  userId?: UUID;
  limit?: number;
}): Promise<LoginAudit[]> {
  const supabase = await createClient();
  let q = supabase.from("login_audit").select("*").order("logged_in_at", { ascending: false });
  if (filter?.clientId) q = q.eq("client_id", filter.clientId);
  if (filter?.userId) q = q.eq("user_id", filter.userId);
  if (filter?.limit) q = q.limit(filter.limit);
  const { data } = await q;
  return (data as LoginAudit[]) ?? [];
}

// ---------- disclaimer ----------

export async function hasAcceptedDisclaimer(userId: UUID, version: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("disclaimer_acceptances")
    .select("id")
    .eq("user_id", userId)
    .eq("version", version)
    .maybeSingle();
  return Boolean(data);
}

export async function recordDisclaimer(userId: UUID, version: string): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("disclaimer_acceptances")
    .upsert({ user_id: userId, version }, { onConflict: "user_id,version" });
}

// ---------- email prefs ----------

export async function getEmailPref(userId: UUID): Promise<EmailPref> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("email_prefs")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return (
    (data as EmailPref) ?? {
      user_id: userId,
      opted_out: false,
      updated_at: new Date().toISOString(),
    }
  );
}

export async function setEmailPref(userId: UUID, optedOut: boolean): Promise<EmailPref> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("email_prefs")
    .upsert({ user_id: userId, opted_out: optedOut, updated_at: new Date().toISOString() })
    .select()
    .single();
  return data as EmailPref;
}

// ---------- impersonations ----------

export async function listImpersonations(filter: { clientId?: UUID; adminId?: UUID; limit?: number }) {
  const supabase = await createClient();
  let q = supabase
    .from("admin_impersonations")
    .select("*")
    .order("started_at", { ascending: false });
  if (filter.clientId) q = q.eq("client_id", filter.clientId);
  if (filter.adminId) q = q.eq("admin_user_id", filter.adminId);
  if (filter.limit) q = q.limit(filter.limit);
  const { data } = await q;
  return (data as Array<{
    id: string;
    admin_user_id: string | null;
    client_id: string;
    started_at: string;
    ended_at: string | null;
    ip: string | null;
    city: string | null;
    region: string | null;
    country: string | null;
  }>) ?? [];
}

// ---------- onboarding ----------

export async function getOnboarding(clientId: UUID) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("client_onboarding")
    .select("*")
    .eq("client_id", clientId)
    .maybeSingle();
  return data as {
    id: string;
    client_id: string;
    submitted_by: string | null;
    data: Record<string, unknown>;
    terms_version: string;
    accepted_terms: boolean;
    submitted_at: string;
  } | null;
}

// ---------- connectors ----------

export async function listConnectors(clientId: UUID): Promise<ConnectorToken[]> {
  // connector_tokens RLS is admin-only (sensitive). All callers are server-side
  // and gate access by clientId before invoking, so reading via the service
  // role is safe — without it, the on-demand /api/keywords and /api/gsc-breakdown
  // routes silently return empty for client-portal users (see resolveSite +
  // fetchClientOrganicKeywords, which short-circuit when this returns []).
  const supabase = await createServiceClient();
  const { data } = await supabase
    .from("connector_tokens")
    .select("*")
    .eq("client_id", clientId);
  return (data as ConnectorToken[]) ?? [];
}

export async function deleteConnector(connectorId: UUID): Promise<void> {
  const supabase = await createServiceClient();
  const { error } = await supabase.from("connector_tokens").delete().eq("id", connectorId);
  if (error) throw new Error(`deleteConnector failed: ${error.message}`);
}

export async function touchConnectorSync(
  connectorId: UUID,
  status: string,
): Promise<ConnectorToken | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("connector_tokens")
    .update({ last_synced_at: new Date().toISOString(), last_sync_status: status })
    .eq("id", connectorId)
    .select()
    .single();
  return (data as ConnectorToken) ?? null;
}

export interface ConnectorCredentials {
  id: UUID;
  client_id: UUID;
  provider: string;
  account_label: string | null;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  scopes: string[];
  meta: Record<string, unknown>;
}

export async function upsertConnectorToken(input: {
  client_id: UUID;
  provider: string;
  account_label: string;
  // null = no per-client credential (e.g. Bing/Semrush where one agency-wide
  // env key covers every client; we only need to remember which site/domain
  // this client maps to).
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  scopes: string[];
  meta?: Record<string, unknown>;
}): Promise<ConnectorToken | null> {
  const { encryptToken } = await import("@/lib/crypto/token-crypto");
  const supabase = await createServiceClient();
  const row = {
    client_id: input.client_id,
    provider: input.provider,
    account_label: input.account_label,
    access_token_ciphertext: input.access_token ? encryptToken(input.access_token) : null,
    refresh_token_ciphertext: input.refresh_token ? encryptToken(input.refresh_token) : null,
    expires_at: input.expires_at,
    scopes: input.scopes,
    meta: input.meta ?? {},
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("connector_tokens")
    .upsert(row, { onConflict: "client_id,provider,account_label" })
    .select()
    .single();
  if (error) throw new Error(`upsertConnectorToken failed: ${error.message}`);
  return (data as ConnectorToken) ?? null;
}

export async function getConnectorWithCredentials(
  connectorId: UUID,
): Promise<ConnectorCredentials | null> {
  const { decryptToken } = await import("@/lib/crypto/token-crypto");
  const supabase = await createServiceClient();
  const { data } = await supabase
    .from("connector_tokens")
    .select("id, client_id, provider, account_label, access_token_ciphertext, refresh_token_ciphertext, expires_at, scopes, meta")
    .eq("id", connectorId)
    .single();
  if (!data) return null;
  const row = data as {
    id: UUID;
    client_id: UUID;
    provider: string;
    account_label: string | null;
    access_token_ciphertext: string | null;
    refresh_token_ciphertext: string | null;
    expires_at: string | null;
    scopes: string[];
    meta: Record<string, unknown>;
  };
  return {
    id: row.id,
    client_id: row.client_id,
    provider: row.provider,
    account_label: row.account_label,
    access_token: row.access_token_ciphertext ? decryptToken(row.access_token_ciphertext) : null,
    refresh_token: row.refresh_token_ciphertext ? decryptToken(row.refresh_token_ciphertext) : null,
    expires_at: row.expires_at,
    scopes: row.scopes ?? [],
    meta: row.meta ?? {},
  };
}

export async function updateConnectorAccessToken(
  connectorId: UUID,
  access_token: string,
  expires_at: string,
): Promise<void> {
  const { encryptToken } = await import("@/lib/crypto/token-crypto");
  const supabase = await createServiceClient();
  await supabase
    .from("connector_tokens")
    .update({
      access_token_ciphertext: encryptToken(access_token),
      expires_at,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connectorId);
}

// ---------- semrush deep-pull reports ----------

export async function upsertSemrushReport(input: {
  client_id: UUID;
  report_type: string;
  rows: Record<string, string>[];
  meta?: Record<string, unknown>;
}): Promise<void> {
  const supabase = await createServiceClient();
  await supabase.from("semrush_reports").upsert(
    {
      client_id: input.client_id,
      report_type: input.report_type,
      captured_at: new Date().toISOString().slice(0, 10),
      pulled_at: new Date().toISOString(),
      rows: input.rows,
      row_count: input.rows.length,
      meta: input.meta ?? {},
    },
    { onConflict: "client_id,report_type" },
  );
}

export async function listSemrushReports(clientId: UUID): Promise<SemrushReport[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("semrush_reports")
    .select("*")
    .eq("client_id", clientId)
    .order("report_type", { ascending: true });
  return (data as SemrushReport[]) ?? [];
}
