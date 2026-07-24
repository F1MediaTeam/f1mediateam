// Mock adapter — reads/writes the in-memory store.
// Function shape mirrors what the Supabase adapter will expose.
// Every mutating function expects an `actor` (the calling profile) so it
// can write audit rows and enforce light role checks. RLS in Supabase
// will enforce the real boundary; this is for parity locally.

import { mutate, getState } from "@/lib/mock/store";
import type { UiOverride } from "@/lib/ui-overrides";
import {
  DEMO_ADMIN_ID,
  SEED_USERS,
} from "@/lib/mock/seed";
import type {
  CalendarEvent,
  CalendarEventAttachment,
  Client,
  ContentCard,
  ContentCardEvent,
  ContentStage,
  DeckReport,
  EmailPref,
  FileRecord,
  LoginAudit,
  Meeting,
  MetricSnapshot,
  Profile,
  Task,
  UserRole,
  UUID,
  SemrushReport,
} from "@/lib/types";

const nowIso = () => new Date().toISOString();
const uid = () => Math.random().toString(36).slice(2, 12);

// In-memory Semrush deep-pull store (dev only — real pulls need live creds).
const semrushReportStore: SemrushReport[] = [];

export function upsertSemrushReport(input: {
  client_id: UUID;
  report_type: string;
  rows: Record<string, string>[];
  meta?: Record<string, unknown>;
}): void {
  const row: SemrushReport = {
    id: `sr-${uid()}`,
    client_id: input.client_id,
    report_type: input.report_type,
    captured_at: nowIso().slice(0, 10),
    pulled_at: nowIso(),
    rows: input.rows,
    row_count: input.rows.length,
    meta: input.meta ?? {},
  };
  const idx = semrushReportStore.findIndex(
    (r) => r.client_id === input.client_id && r.report_type === input.report_type,
  );
  if (idx >= 0) semrushReportStore[idx] = row;
  else semrushReportStore.push(row);
}

export function listSemrushReports(clientId: UUID): SemrushReport[] {
  return semrushReportStore
    .filter((r) => r.client_id === clientId)
    .sort((a, b) => a.report_type.localeCompare(b.report_type));
}

// ---------------- auth (mock) ----------------

export interface Session {
  user_id: UUID;
  role: UserRole;
  client_id: UUID | null;
  email: string;
  full_name: string | null;
}

export async function signIn(email: string, password: string): Promise<Session | null> {
  const match = Object.values(SEED_USERS).find(
    (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password,
  );
  if (!match) return null;
  const p = match.profile;
  return {
    user_id: p.id,
    role: p.role,
    client_id: p.client_id,
    email: p.email,
    full_name: p.full_name,
  };
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
  mutate((s) => {
    const row: LoginAudit = {
      id: `audit-${uid()}`,
      client_id: session.client_id,
      user_id: session.user_id,
      logged_in_at: nowIso(),
      ip: ctx.ip,
      user_agent: ctx.user_agent,
      city: ctx.city,
      region: ctx.region,
      country: ctx.country,
    };
    s.audit.unshift(row);
  });
}

// ---------------- profiles ----------------

export function getProfile(userId: UUID): Profile | null {
  return getState().profiles.find((p) => p.id === userId) ?? null;
}

// ---------------- clients ----------------

export function listClients(): Client[] {
  return getState().clients.slice().sort((a, b) => a.company_name.localeCompare(b.company_name));
}

export function getClient(id: UUID): Client | null {
  return getState().clients.find((c) => c.id === id) ?? null;
}

export function deleteClient(id: UUID): boolean {
  return mutate((s) => {
    const i = s.clients.findIndex((c) => c.id === id);
    if (i === -1) return false;
    const clientId = s.clients[i].id;
    s.clients.splice(i, 1);
    // simulate ON DELETE CASCADE
    s.tasks = s.tasks.filter((t) => t.client_id !== clientId);
    s.calendar = s.calendar.filter((e) => e.client_id !== clientId);
    s.snapshots = s.snapshots.filter((m) => m.client_id !== clientId);
    s.content = s.content.filter((c) => c.client_id !== clientId);
    s.files = s.files.filter((f) => f.client_id !== clientId);
    s.audit = s.audit.filter((a) => a.client_id !== clientId);
    s.connectors = s.connectors.filter((c) => c.client_id !== clientId);
    s.profiles.forEach((p) => { if (p.client_id === clientId) p.client_id = null; });
    return true;
  });
}

export function updateClientConfig(
  id: UUID,
  patch: Partial<Client["config"]>,
): Client | null {
  return mutate((s) => {
    const c = s.clients.find((x) => x.id === id);
    if (!c) return null;
    c.config = { ...c.config, ...patch, widgets: { ...c.config.widgets, ...(patch.widgets ?? {}) } };
    c.updated_at = nowIso();
    return c;
  });
}

// ---------------- tasks ----------------

export function listTasks(filter?: { clientId?: UUID; status?: Task["status"] }): Task[] {
  return getState().tasks.filter((t) => {
    if (filter?.clientId && t.client_id !== filter.clientId) return false;
    if (filter?.status && t.status !== filter.status) return false;
    return true;
  });
}

export function createTask(input: {
  client_id: UUID;
  title: string;
  notes?: string | null;
  due_date?: string | null;
  assigned_by?: UUID | null;
}): Task {
  return mutate((s) => {
    const t: Task = {
      id: `task-${uid()}`,
      client_id: input.client_id,
      title: input.title,
      notes: input.notes ?? null,
      due_date: input.due_date ?? null,
      status: "open",
      assigned_by: input.assigned_by ?? DEMO_ADMIN_ID,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    s.tasks.unshift(t);
    return t;
  });
}

export function updateTask(id: UUID, patch: Partial<Task>): Task | null {
  return mutate((s) => {
    const t = s.tasks.find((x) => x.id === id);
    if (!t) return null;
    Object.assign(t, patch, { updated_at: nowIso() });
    return t;
  });
}

export function deleteTask(id: UUID): boolean {
  return mutate((s) => {
    const i = s.tasks.findIndex((t) => t.id === id);
    if (i === -1) return false;
    s.tasks.splice(i, 1);
    return true;
  });
}

// ---------------- calendar ----------------

export function listCalendar(filter?: { clientId?: UUID; from?: string; to?: string }): CalendarEvent[] {
  return getState().calendar.filter((e) => {
    if (filter?.clientId && e.client_id !== filter.clientId) return false;
    if (filter?.from && e.starts_at < filter.from) return false;
    if (filter?.to && e.starts_at > filter.to) return false;
    return true;
  });
}

export function createCalendarEvent(input: {
  client_id: UUID | null;
  type: CalendarEvent["type"];
  title: string;
  notes?: string | null;
  starts_at: string;
  ends_at?: string | null;
  created_by?: UUID | null;
}): CalendarEvent {
  return mutate((s) => {
    const e: CalendarEvent = {
      id: `cal-${uid()}`,
      client_id: input.client_id,
      type: input.type,
      title: input.title,
      notes: input.notes ?? null,
      starts_at: input.starts_at,
      ends_at: input.ends_at ?? null,
      created_by: input.created_by ?? DEMO_ADMIN_ID,
      created_at: nowIso(),
    };
    s.calendar.push(e);
    return e;
  });
}

export function deleteCalendarEvent(id: UUID): boolean {
  return mutate((s) => {
    const i = s.calendar.findIndex((e) => e.id === id);
    if (i === -1) return false;
    s.calendar.splice(i, 1);
    // Cascade attachments — Supabase does this via FK on delete cascade.
    s.calendarAttachments = s.calendarAttachments.filter((a) => a.event_id !== id);
    return true;
  });
}

// ---------------- meetings ----------------

export function listMeetings(): Meeting[] {
  return [...getState().meetings].sort((a, b) =>
    b.scheduled_at.localeCompare(a.scheduled_at),
  );
}

export function getMeeting(id: UUID): Meeting | null {
  return getState().meetings.find((m) => m.id === id) ?? null;
}

// ---------------- deck reports (Deck Studio history) ----------------
// Mock mode has no persistence for generated decks — return empty so the UI
// simply shows no history.

export function saveDeckReport(_input: {
  client_id: UUID;
  report_type: string;
  period_from: string | null;
  period_to: string | null;
  meeting_date: string | null;
  content: Record<string, unknown>;
  pptx_path: string | null;
}): DeckReport | null {
  return null;
}

export function listDeckReports(_clientId: UUID, _limit?: number): Array<Omit<DeckReport, "content">> {
  return [];
}

export function getDeckReport(_id: UUID): DeckReport | null {
  return null;
}

export function latestDeckReport(_clientId: UUID): DeckReport | null {
  return null;
}

export function getFileSignedUrl(_storagePath: string): string | null {
  return null;
}

export function createMeeting(input: {
  client_id: UUID;
  title: string;
  scheduled_at: string;
  range_from?: string | null;
  range_to?: string | null;
  notes?: string | null;
  created_by?: UUID | null;
}): Meeting {
  return mutate((s) => {
    const m: Meeting = {
      id: `mtg-${uid()}`,
      client_id: input.client_id,
      title: input.title,
      scheduled_at: input.scheduled_at,
      logo_path: null,
      range_from: input.range_from ?? null,
      range_to: input.range_to ?? null,
      notes: input.notes ?? null,
      created_by: input.created_by ?? DEMO_ADMIN_ID,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    s.meetings.push(m);
    return m;
  });
}

export function updateMeeting(id: UUID, patch: Partial<Meeting>): Meeting | null {
  return mutate((s) => {
    const m = s.meetings.find((x) => x.id === id);
    if (!m) return null;
    Object.assign(m, patch, { id: m.id, updated_at: nowIso() });
    return m;
  });
}

export function deleteMeeting(id: UUID): boolean {
  return mutate((s) => {
    const i = s.meetings.findIndex((m) => m.id === id);
    if (i === -1) return false;
    s.meetings.splice(i, 1);
    return true;
  });
}

// ---------------- calendar event attachments ----------------

export function listEventAttachments(eventId: UUID): CalendarEventAttachment[] {
  return getState().calendarAttachments.filter((a) => a.event_id === eventId);
}

export function listAttachmentsForEvents(eventIds: UUID[]): CalendarEventAttachment[] {
  if (eventIds.length === 0) return [];
  const set = new Set(eventIds);
  return getState().calendarAttachments.filter((a) => set.has(a.event_id));
}

export function recordEventAttachment(input: {
  event_id: UUID;
  storage_path: string;
  filename: string;
  mime_type?: string | null;
  size_bytes?: number | null;
  uploaded_by?: UUID | null;
}): CalendarEventAttachment {
  return mutate((s) => {
    const row: CalendarEventAttachment = {
      id: `att-${uid()}`,
      event_id: input.event_id,
      storage_path: input.storage_path,
      filename: input.filename,
      mime_type: input.mime_type ?? null,
      size_bytes: input.size_bytes ?? null,
      uploaded_by: input.uploaded_by ?? null,
      created_at: nowIso(),
    };
    s.calendarAttachments.push(row);
    return row;
  });
}

export function deleteEventAttachment(id: UUID): boolean {
  return mutate((s) => {
    const i = s.calendarAttachments.findIndex((a) => a.id === id);
    if (i === -1) return false;
    s.calendarAttachments.splice(i, 1);
    return true;
  });
}

// ---------------- metric snapshots ----------------

export function listSnapshots(filter: {
  clientId: UUID;
  metric?: string;
  from?: string;
  to?: string;
}): MetricSnapshot[] {
  return getState()
    .snapshots.filter((m) => m.client_id === filter.clientId)
    .filter((m) => (filter.metric ? m.metric === filter.metric : true))
    .filter((m) => (filter.from ? m.captured_at >= filter.from : true))
    .filter((m) => (filter.to ? m.captured_at <= filter.to : true))
    .sort((a, b) => a.captured_at.localeCompare(b.captured_at));
}

export function listSnapshotsByMetrics(filter: {
  clientId: UUID;
  metrics: string[];
  from?: string;
  to?: string;
}): Map<string, MetricSnapshot[]> {
  const out = new Map<string, MetricSnapshot[]>();
  for (const m of filter.metrics) out.set(m, []);
  const rows = getState()
    .snapshots.filter((m) => m.client_id === filter.clientId)
    .filter((m) => filter.metrics.includes(m.metric))
    .filter((m) => (filter.from ? m.captured_at >= filter.from : true))
    .filter((m) => (filter.to ? m.captured_at <= filter.to : true))
    .sort((a, b) => a.captured_at.localeCompare(b.captured_at));
  for (const r of rows) out.get(r.metric)?.push(r);
  return out;
}

export function getBaseline(clientId: UUID, metric: string): MetricSnapshot | null {
  return (
    getState().snapshots.find(
      (m) => m.client_id === clientId && m.metric === metric && m.is_baseline,
    ) ?? null
  );
}

export function getLatest(clientId: UUID, metric: string): MetricSnapshot | null {
  const series = listSnapshots({ clientId, metric });
  return series.length ? series[series.length - 1] : null;
}

export function writeSnapshot(input: Omit<MetricSnapshot, "id" | "created_at">): MetricSnapshot {
  return mutate((s) => {
    const m: MetricSnapshot = {
      id: `${input.client_id}-${input.metric}-${input.captured_at}-${uid()}`,
      created_at: nowIso(),
      ...input,
    };
    s.snapshots.push(m);
    return m;
  });
}

export function deleteSnapshotsBySource(clientId: UUID, source: string): number {
  return mutate((s) => {
    const before = s.snapshots.length;
    s.snapshots = s.snapshots.filter((m) => !(m.client_id === clientId && m.source === source));
    return before - s.snapshots.length;
  });
}

// ---------------- content cards ----------------

export function listContent(filter?: { clientId?: UUID; stage?: ContentStage }): ContentCard[] {
  return getState()
    .content.filter((c) => {
      if (filter?.clientId && c.client_id !== filter.clientId) return false;
      if (filter?.stage && c.stage !== filter.stage) return false;
      return true;
    })
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export function getContent(id: UUID): ContentCard | null {
  return getState().content.find((c) => c.id === id) ?? null;
}

export function listContentEvents(cardId: UUID): ContentCardEvent[] {
  return getState()
    .contentEvents.filter((e) => e.card_id === cardId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function listContentEventsByCards(cardIds: UUID[]): Map<UUID, ContentCardEvent[]> {
  const out = new Map<UUID, ContentCardEvent[]>();
  for (const id of cardIds) out.set(id, []);
  for (const e of getState().contentEvents) {
    const bucket = out.get(e.card_id);
    if (bucket) bucket.push(e);
  }
  for (const bucket of out.values()) bucket.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return out;
}

export function createContent(input: {
  client_id: UUID;
  title: string;
  body?: string | null;
  link?: string | null;
  file_url?: string | null;
  created_by?: UUID | null;
}): ContentCard {
  return mutate((s) => {
    const card: ContentCard = {
      id: `card-${uid()}`,
      client_id: input.client_id,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
      file_url: input.file_url ?? null,
      stage: "proposed",
      created_by: input.created_by ?? DEMO_ADMIN_ID,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    s.content.unshift(card);
    return card;
  });
}

// Mock mirror of the service-role client submission path (see supabase-adapter).
export function createClientContent(input: {
  client_id: UUID;
  title: string;
  body?: string | null;
  link?: string | null;
  created_by?: UUID | null;
}): ContentCard {
  return createContent(input);
}

const STAGE_ORDER: ContentStage[] = ["proposed", "pending", "posted"];

export type StageDirection = "forward" | "back";

/**
 * Move a card one stage forward or back. Enforces:
 *  - one stage at a time
 *  - clients can only act on Proposed (forward to pending)
 *  - clients can move pending → proposed (rescind) only as a back-step initiated by admin? No:
 *    spec says "back one stage to fix mistakes" — admins only for back-steps from pending/posted.
 *  - clients can NOT post (proposed → pending is the only client forward move)
 */
export function moveContentStage(
  cardId: UUID,
  direction: StageDirection,
  actor: { user_id: UUID; role: UserRole; client_id: UUID | null },
  note?: string | null,
): { card: ContentCard; event: ContentCardEvent } | { error: string } {
  return mutate((s) => {
    const card = s.content.find((c) => c.id === cardId);
    if (!card) return { error: "Card not found" };

    if (actor.role === "client" && card.client_id !== actor.client_id) {
      return { error: "Forbidden" };
    }

    const idx = STAGE_ORDER.indexOf(card.stage);
    const targetIdx = direction === "forward" ? idx + 1 : idx - 1;
    if (targetIdx < 0 || targetIdx >= STAGE_ORDER.length) {
      return { error: "No further stage in that direction" };
    }
    const target = STAGE_ORDER[targetIdx];

    // permission gates
    if (actor.role === "client") {
      // clients can only push proposed → pending. No back moves, no posting.
      if (!(direction === "forward" && card.stage === "proposed")) {
        return { error: "Clients can only approve a proposed card" };
      }
    }

    const from = card.stage;
    card.stage = target;
    card.updated_at = nowIso();

    const event: ContentCardEvent = {
      id: `evt-${uid()}`,
      card_id: card.id,
      from_stage: from,
      to_stage: target,
      actor_user_id: actor.user_id,
      actor_role: actor.role,
      note: note ?? null,
      created_at: nowIso(),
    };
    s.contentEvents.unshift(event);

    return { card, event };
  });
}

export function deleteContent(cardId: UUID): void {
  mutate((s) => {
    s.content = s.content.filter((c) => c.id !== cardId);
    s.contentEvents = s.contentEvents.filter((e) => e.card_id !== cardId);
  });
}

export function updateContent(
  cardId: UUID,
  patch: Partial<Pick<ContentCard, "title" | "body" | "link">>,
): ContentCard | null {
  return mutate((s) => {
    const c = s.content.find((x) => x.id === cardId);
    if (!c) return null;
    if (patch.title !== undefined) c.title = patch.title;
    if (patch.body !== undefined) c.body = patch.body;
    if (patch.link !== undefined) c.link = patch.link;
    c.updated_at = nowIso();
    return c;
  });
}

export function rejectContent(
  cardId: UUID,
  actor: { user_id: UUID; role: UserRole; client_id: UUID | null },
  note: string,
): { card: ContentCard; event: ContentCardEvent } | { error: string } {
  return mutate((s) => {
    const card = s.content.find((c) => c.id === cardId);
    if (!card) return { error: "Card not found" };
    if (actor.role !== "client" || card.client_id !== actor.client_id) {
      return { error: "Only the owning client can request changes" };
    }
    if (card.stage !== "proposed") {
      return { error: "Can only request changes on a proposed card" };
    }
    card.updated_at = nowIso();
    const event: ContentCardEvent = {
      id: `evt-${uid()}`,
      card_id: card.id,
      from_stage: "proposed",
      to_stage: "proposed",
      actor_user_id: actor.user_id,
      actor_role: actor.role,
      note: `CHANGES REQUESTED: ${note}`,
      created_at: nowIso(),
    };
    s.contentEvents.unshift(event);
    return { card, event };
  });
}

// ---------------- files ----------------

export function listFiles(clientId: UUID): FileRecord[] {
  return getState()
    .files.filter((f) => f.client_id === clientId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function recordFile(input: Omit<FileRecord, "id" | "created_at">): FileRecord {
  return mutate((s) => {
    const f: FileRecord = {
      id: `file-${uid()}`,
      created_at: nowIso(),
      ...input,
    };
    s.files.unshift(f);
    return f;
  });
}

export function deleteFile(id: UUID): boolean {
  return mutate((s) => {
    const i = s.files.findIndex((f) => f.id === id);
    if (i === -1) return false;
    s.files.splice(i, 1);
    return true;
  });
}

// ---------------- audit ----------------

export function listAudit(filter?: { clientId?: UUID; userId?: UUID; limit?: number }): LoginAudit[] {
  const rows = getState()
    .audit.filter((a) => {
      if (filter?.clientId && a.client_id !== filter.clientId) return false;
      if (filter?.userId && a.user_id !== filter.userId) return false;
      return true;
    })
    .sort((a, b) => b.logged_in_at.localeCompare(a.logged_in_at));
  return filter?.limit ? rows.slice(0, filter.limit) : rows;
}

// ---------------- disclaimers ----------------

export function hasAcceptedDisclaimer(userId: UUID, version: string): boolean {
  return getState().acceptedDisclaimers[userId] === version;
}

export function recordDisclaimer(userId: UUID, version: string) {
  mutate((s) => {
    s.acceptedDisclaimers[userId] = version;
  });
}

// ---------------- email prefs ----------------

export function getEmailPref(userId: UUID): EmailPref {
  return (
    getState().emailPrefs.find((p) => p.user_id === userId) ?? {
      user_id: userId,
      opted_out: false,
      updated_at: nowIso(),
    }
  );
}

export function setEmailPref(userId: UUID, optedOut: boolean): EmailPref {
  return mutate((s) => {
    let p = s.emailPrefs.find((x) => x.user_id === userId);
    if (!p) {
      p = { user_id: userId, opted_out: optedOut, updated_at: nowIso() };
      s.emailPrefs.push(p);
    } else {
      p.opted_out = optedOut;
      p.updated_at = nowIso();
    }
    return p;
  });
}

// ---------------- client messages ----------------

// Mock doesn't persist messages — parity stubs so pages don't crash. If we
// ever want messages in mock mode, add a `messages: []` field to the seed and
// wire these up.
export function listMessages(_clientId: UUID, _limit?: number) {
  return [] as Array<{
    id: UUID;
    client_id: UUID;
    from_user_id: UUID | null;
    from_role: "client" | "admin";
    body: string;
    created_at: string;
    read_at: string | null;
  }>;
}

export function sendMessage(_input: {
  client_id: UUID;
  from_user_id: UUID;
  from_role: "client" | "admin";
  body: string;
  attachments?: Array<{ path: string; name: string; mime_type: string; size: number }>;
}) {
  return null;
}

export function markMessagesRead(_clientId: UUID, _viewerRole: "client" | "admin") {
  return undefined;
}

export function countUnreadMessages(_clientId: UUID, _viewerRole: "client" | "admin"): number {
  return 0;
}

export function listUnreadCountsByClient(): Map<UUID, number> {
  return new Map();
}

export function listLatestMessagesByClient(): Map<UUID, ReturnType<typeof listMessages>[number]> {
  return new Map();
}

export function listContentImagesByCards(_cardIds: UUID[]): Map<UUID, string[]> {
  return new Map();
}

// ---------------- connectors ----------------

export function listConnectors(clientId: UUID) {
  return getState().connectors.filter((c) => c.client_id === clientId);
}

export function writeSnapshots(_rows: unknown[]): number {
  throw new Error("[mock] writeSnapshots not supported — set Supabase env to ingest connector data");
}

export function deleteConnector(connectorId: UUID) {
  return mutate((s) => {
    s.connectors = s.connectors.filter((x) => x.id !== connectorId);
  });
}

export function touchConnectorSync(connectorId: UUID, status: string) {
  return mutate((s) => {
    const c = s.connectors.find((x) => x.id === connectorId);
    if (!c) return null;
    c.last_synced_at = nowIso();
    c.last_sync_status = status;
    c.updated_at = nowIso();
    return c;
  });
}

export function upsertConnectorToken(_input: {
  client_id: UUID;
  provider: string;
  account_label: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  scopes: string[];
  meta?: Record<string, unknown>;
}) {
  throw new Error("[mock] upsertConnectorToken not supported — set Supabase env to run OAuth flows");
}

export function getConnectorWithCredentials(_connectorId: UUID) {
  throw new Error("[mock] getConnectorWithCredentials not supported — set Supabase env to run OAuth flows");
}

export function updateConnectorAccessToken(_connectorId: UUID, _access_token: string, _expires_at: string) {
  throw new Error("[mock] updateConnectorAccessToken not supported — set Supabase env to run OAuth flows");
}

// ---------------- supabase parity ----------------
// Everything below mirrors supabase-adapter exports that mock-mode pages hit
// at runtime. Store-backed where the seed has the data, safe stubs otherwise.

export function signUp(_email: string, _password: string, _fullName?: string) {
  return {
    session: null,
    error: "Sign-up needs Supabase — use one of the demo accounts in mock mode.",
  };
}

export function signOut(): void {
  // Mock sessions live in the f1_session cookie; the caller clears it.
}

export function getClientUser(clientId: UUID): Profile | null {
  return (
    getState().profiles.find((p) => p.role === "client" && p.client_id === clientId) ?? null
  );
}

export function createClientRow(input: {
  company_name: string;
  join_date?: string;
  websites?: string[];
}): Client {
  return mutate((s) => {
    const c: Client = {
      id: `client-${uid()}`,
      company_name: input.company_name,
      join_date: input.join_date ?? nowIso().slice(0, 10),
      websites: input.websites ?? [],
      config: {
        widgets: { rankings: true, traffic: true, content: true, files: true, calendar: true },
      },
      branding: {},
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    s.clients.push(c);
    return c;
  });
}

export function hasSemrushHistory(clientId: UUID): boolean {
  const today = nowIso().slice(0, 10);
  return getState().snapshots.some(
    (s) => s.client_id === clientId && s.source === "semrush" && s.captured_at < today,
  );
}

export function updateConnectorMeta(tokenId: UUID, patch: Record<string, unknown>): void {
  mutate((s) => {
    const t = s.connectors.find((c) => c.id === tokenId);
    if (t) {
      t.meta = { ...(t.meta ?? {}), ...patch };
      t.updated_at = nowIso();
    }
  });
}

export function listImpersonations(_filter: { clientId?: UUID; adminId?: UUID; limit?: number }) {
  // Mock has no impersonation audit trail.
  return [];
}

export function getOnboarding(_clientId: UUID) {
  // Mock has no onboarding submissions.
  return null;
}

export function signMessageAttachments(
  attachments: Array<{ path: string; name: string; mime_type: string; size_bytes?: number | null }>,
) {
  // No storage bucket to sign against in mock mode.
  return (attachments ?? []).map((a) => ({ ...a, url: null as string | null }));
}

// ---------------- admin style overrides ----------------
//
// In-memory mirror of the Supabase implementation so the style inspector is
// usable in local dev without a database. Lost on server restart, by design.

const uiOverrideStore: UiOverride[] = [];
let uiDefaultSnapshot: UiOverride[] = [];
let uiDefaultSavedAt: string | null = null;

export function listUiOverrides(): UiOverride[] {
  return uiOverrideStore.map((o) => ({ ...o, styles: { ...o.styles } }));
}

export function upsertUiOverride(override: UiOverride, _userId: UUID): void {
  const idx = uiOverrideStore.findIndex(
    (o) => o.scope === override.scope && o.selector === override.selector,
  );
  if (idx >= 0) uiOverrideStore[idx] = override;
  else uiOverrideStore.push(override);
}

export function deleteUiOverride(scope: string, selector: string): void {
  const idx = uiOverrideStore.findIndex((o) => o.scope === scope && o.selector === selector);
  if (idx >= 0) uiOverrideStore.splice(idx, 1);
}

export function clearUiOverrides(): void {
  uiOverrideStore.length = 0;
}

export function saveUiDefault(_userId: UUID): void {
  uiDefaultSnapshot = listUiOverrides();
  uiDefaultSavedAt = nowIso();
}

export function getUiDefault(): { snapshot: UiOverride[]; saved_at: string | null } {
  return { snapshot: uiDefaultSnapshot.map((o) => ({ ...o })), saved_at: uiDefaultSavedAt };
}

export function resetUiToDefault(_userId: UUID): void {
  uiOverrideStore.length = 0;
  for (const o of uiDefaultSnapshot) uiOverrideStore.push({ ...o, styles: { ...o.styles } });
}

/** Mock mirror of the admin-side "request changes" — see supabase-adapter. */
export function requestChangesAsAdmin(
  cardId: UUID,
  actor: { user_id: UUID; role: UserRole },
  note: string,
): { error: string } | { ok: true } {
  if (actor.role !== "admin") return { error: "Admins only" };
  return mutate((s) => {
    const card = s.content.find((c) => c.id === cardId);
    if (!card) return { error: "Card not found" };
    if (card.stage !== "proposed") {
      return { error: "Can only request changes on a proposed card" };
    }
    card.updated_at = nowIso();
    s.contentEvents.unshift({
      id: `evt-${uid()}`,
      card_id: card.id,
      from_stage: "proposed",
      to_stage: "proposed",
      actor_user_id: actor.user_id,
      actor_role: "admin",
      note: `CHANGES REQUESTED: ${note}`,
      created_at: nowIso(),
    });
    return { ok: true } as const;
  });
}
