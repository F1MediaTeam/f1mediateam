// Seed data for local development. The in-memory store starts from this.
// Two demo clients, one admin, two client users — enough to exercise every page.

import type {
  Client,
  Profile,
  Task,
  CalendarEvent,
  MetricSnapshot,
  ContentCard,
  ContentCardEvent,
  FileRecord,
  LoginAudit,
  ConnectorToken,
  EmailPref,
} from "@/lib/types";

const today = new Date();
const iso = (d: Date) => d.toISOString();
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

const offsetDays = (d: Date, n: number) => {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
};

// Stable demo IDs so URLs and bookmarks don't break across reloads.
export const DEMO_ADMIN_ID = "00000000-0000-0000-0000-000000000001";
export const DEMO_CLIENT_A_ID = "11111111-1111-1111-1111-111111111111";
export const DEMO_CLIENT_B_ID = "22222222-2222-2222-2222-222222222222";

const clientAUserId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const clientBUserId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

export const seedProfiles: Profile[] = [
  {
    id: DEMO_ADMIN_ID,
    role: "admin",
    client_id: null,
    full_name: "F1 Media Admin",
    email: "admin@f1media.dev",
    created_at: iso(offsetDays(today, -180)),
  },
  {
    id: clientAUserId,
    role: "client",
    client_id: DEMO_CLIENT_A_ID,
    full_name: "Northwind Owner",
    email: "owner@northwind.example",
    created_at: iso(offsetDays(today, -90)),
  },
  {
    id: clientBUserId,
    role: "client",
    client_id: DEMO_CLIENT_B_ID,
    full_name: "Acme Marketing Lead",
    email: "marketing@acme.example",
    created_at: iso(offsetDays(today, -45)),
  },
];

export const seedClients: Client[] = [
  {
    id: DEMO_CLIENT_A_ID,
    company_name: "Northwind HVAC",
    join_date: isoDate(offsetDays(today, -120)),
    websites: ["https://northwindhvac.example"],
    config: {
      widgets: {
        rankings: true,
        traffic: true,
        content: true,
        files: true,
        calendar: true,
      },
      branding: { accent: "#22c55e" },
    },
    branding: {},
    created_at: iso(offsetDays(today, -120)),
    updated_at: iso(today),
  },
  {
    id: DEMO_CLIENT_B_ID,
    company_name: "Acme Roofing",
    join_date: isoDate(offsetDays(today, -60)),
    websites: ["https://acmeroofing.example"],
    config: {
      widgets: {
        rankings: true,
        traffic: true,
        content: true,
        files: false,    // demo: this client doesn't have files visible yet
        calendar: true,
      },
      branding: { accent: "#f97316" },
    },
    branding: {},
    created_at: iso(offsetDays(today, -60)),
    updated_at: iso(today),
  },
];

// --- tasks ---
export const seedTasks: Task[] = [
  {
    id: "task-001",
    client_id: DEMO_CLIENT_A_ID,
    title: "Publish January blog post — heat-pump rebates",
    notes: "Draft is in Google Drive; needs final image.",
    due_date: isoDate(today),
    status: "open",
    assigned_by: DEMO_ADMIN_ID,
    created_at: iso(offsetDays(today, -2)),
    updated_at: iso(offsetDays(today, -2)),
  },
  {
    id: "task-002",
    client_id: DEMO_CLIENT_A_ID,
    title: "Refresh GSC keyword report",
    notes: null,
    due_date: isoDate(offsetDays(today, 1)),
    status: "open",
    assigned_by: DEMO_ADMIN_ID,
    created_at: iso(offsetDays(today, -1)),
    updated_at: iso(offsetDays(today, -1)),
  },
  {
    id: "task-003",
    client_id: DEMO_CLIENT_B_ID,
    title: "Send monthly performance email",
    notes: "Use template B; CC owner.",
    due_date: isoDate(offsetDays(today, 3)),
    status: "open",
    assigned_by: DEMO_ADMIN_ID,
    created_at: iso(offsetDays(today, -1)),
    updated_at: iso(offsetDays(today, -1)),
  },
  {
    id: "task-004",
    client_id: DEMO_CLIENT_B_ID,
    title: "QA new landing page",
    notes: "Check mobile breakpoints.",
    due_date: isoDate(offsetDays(today, 5)),
    status: "open",
    assigned_by: DEMO_ADMIN_ID,
    created_at: iso(today),
    updated_at: iso(today),
  },
  {
    id: "task-005",
    client_id: DEMO_CLIENT_A_ID,
    title: "Approve homepage copy edits",
    notes: null,
    due_date: isoDate(offsetDays(today, -3)),
    status: "done",
    assigned_by: DEMO_ADMIN_ID,
    created_at: iso(offsetDays(today, -5)),
    updated_at: iso(offsetDays(today, -3)),
  },
];

// --- calendar ---
export const seedCalendar: CalendarEvent[] = [
  {
    id: "cal-001",
    client_id: DEMO_CLIENT_A_ID,
    type: "meeting",
    title: "Northwind monthly review",
    notes: "Zoom — review baseline vs current",
    starts_at: iso(offsetDays(today, 1)),
    ends_at: null,
    created_by: DEMO_ADMIN_ID,
    created_at: iso(offsetDays(today, -7)),
  },
  {
    id: "cal-002",
    client_id: DEMO_CLIENT_B_ID,
    type: "deadline",
    title: "Acme — quarterly report due",
    notes: null,
    starts_at: iso(offsetDays(today, 6)),
    ends_at: null,
    created_by: DEMO_ADMIN_ID,
    created_at: iso(offsetDays(today, -10)),
  },
  {
    id: "cal-003",
    client_id: DEMO_CLIENT_A_ID,
    type: "deadline",
    title: "Northwind — Q3 strategy doc",
    notes: null,
    starts_at: iso(offsetDays(today, 12)),
    ends_at: null,
    created_by: DEMO_ADMIN_ID,
    created_at: iso(offsetDays(today, -3)),
  },
  {
    id: "cal-004",
    client_id: DEMO_CLIENT_B_ID,
    type: "meeting",
    title: "Acme kickoff call",
    notes: null,
    starts_at: iso(offsetDays(today, -2)),
    ends_at: null,
    created_by: DEMO_ADMIN_ID,
    created_at: iso(offsetDays(today, -14)),
  },
];

// --- metric snapshots ---
// For each client, generate baseline rows (at join date) and a trailing series.
function makeMetricSeries(
  clientId: string,
  joinDate: Date,
  metric: string,
  source: string,
  startVal: number,
  endVal: number,
): MetricSnapshot[] {
  const out: MetricSnapshot[] = [];
  const days = Math.max(7, Math.floor((today.getTime() - joinDate.getTime()) / 86400000));
  const samplePoints = Math.min(days, 60);
  for (let i = 0; i <= samplePoints; i++) {
    const d = offsetDays(joinDate, Math.floor((days / samplePoints) * i));
    const t = i / samplePoints;
    // ease-in for a satisfying growth curve, ±5% jitter
    const eased = startVal + (endVal - startVal) * (t * t * (3 - 2 * t));
    const jitter = eased * (0.95 + Math.random() * 0.1);
    out.push({
      id: `${clientId}-${metric}-${i}`,
      client_id: clientId,
      source,
      metric,
      value: Math.max(0, Math.round(jitter * 100) / 100),
      captured_at: isoDate(d),
      is_baseline: i === 0,
      meta: {},
      created_at: iso(d),
    });
  }
  return out;
}

const northwindJoin = offsetDays(today, -120);
const acmeJoin = offsetDays(today, -60);

export const seedSnapshots: MetricSnapshot[] = [
  ...makeMetricSeries(DEMO_CLIENT_A_ID, northwindJoin, "clicks",      "gsc", 320, 1180),
  ...makeMetricSeries(DEMO_CLIENT_A_ID, northwindJoin, "impressions", "gsc", 18400, 64200),
  ...makeMetricSeries(DEMO_CLIENT_A_ID, northwindJoin, "avg_position","gsc", 22.4, 9.6),  // lower = better
  ...makeMetricSeries(DEMO_CLIENT_A_ID, northwindJoin, "sessions",    "ga4", 510, 2240),
  ...makeMetricSeries(DEMO_CLIENT_A_ID, northwindJoin, "visibility",  "gsc", 12.0, 38.5),
  ...makeMetricSeries(DEMO_CLIENT_B_ID, acmeJoin,      "clicks",      "gsc", 140, 410),
  ...makeMetricSeries(DEMO_CLIENT_B_ID, acmeJoin,      "impressions", "gsc", 9100, 22800),
  ...makeMetricSeries(DEMO_CLIENT_B_ID, acmeJoin,      "avg_position","gsc", 28.1, 18.7),
  ...makeMetricSeries(DEMO_CLIENT_B_ID, acmeJoin,      "sessions",    "ga4", 220, 690),
  ...makeMetricSeries(DEMO_CLIENT_B_ID, acmeJoin,      "visibility",  "gsc", 6.4, 17.2),
];

// --- content cards ---
export const seedContent: ContentCard[] = [
  {
    id: "card-001",
    client_id: DEMO_CLIENT_A_ID,
    title: "Blog: 5 signs you need a new heat pump this winter",
    body: "Long-form post targeting 'replace heat pump' cluster.",
    link: null,
    file_url: null,
    stage: "proposed",
    created_by: DEMO_ADMIN_ID,
    created_at: iso(offsetDays(today, -2)),
    updated_at: iso(offsetDays(today, -2)),
  },
  {
    id: "card-002",
    client_id: DEMO_CLIENT_A_ID,
    title: "Instagram reel: technician day-in-the-life",
    body: "30-second cut from filming day. CTA: schedule a tune-up.",
    link: null,
    file_url: null,
    stage: "pending",
    created_by: DEMO_ADMIN_ID,
    created_at: iso(offsetDays(today, -5)),
    updated_at: iso(offsetDays(today, -1)),
  },
  {
    id: "card-003",
    client_id: DEMO_CLIENT_A_ID,
    title: "FAQ update: financing terms",
    body: null,
    link: "https://northwindhvac.example/faq",
    file_url: null,
    stage: "posted",
    created_by: DEMO_ADMIN_ID,
    created_at: iso(offsetDays(today, -10)),
    updated_at: iso(offsetDays(today, -7)),
  },
  {
    id: "card-004",
    client_id: DEMO_CLIENT_B_ID,
    title: "Spring roof inspection landing page",
    body: "New page targeting 'roof inspection [city]' queries.",
    link: null,
    file_url: null,
    stage: "proposed",
    created_by: DEMO_ADMIN_ID,
    created_at: iso(offsetDays(today, -1)),
    updated_at: iso(offsetDays(today, -1)),
  },
];

export const seedContentEvents: ContentCardEvent[] = [
  {
    id: "evt-001",
    card_id: "card-002",
    from_stage: "proposed",
    to_stage: "pending",
    actor_user_id: clientAUserId,
    actor_role: "client",
    note: "Approved by owner — looks great",
    created_at: iso(offsetDays(today, -1)),
  },
  {
    id: "evt-002",
    card_id: "card-003",
    from_stage: "proposed",
    to_stage: "pending",
    actor_user_id: clientAUserId,
    actor_role: "client",
    note: null,
    created_at: iso(offsetDays(today, -9)),
  },
  {
    id: "evt-003",
    card_id: "card-003",
    from_stage: "pending",
    to_stage: "posted",
    actor_user_id: DEMO_ADMIN_ID,
    actor_role: "admin",
    note: "Published",
    created_at: iso(offsetDays(today, -7)),
  },
];

// --- files (mock metadata; actual storage swap is for Supabase) ---
export const seedFiles: FileRecord[] = [
  {
    id: "file-001",
    client_id: DEMO_CLIENT_A_ID,
    filename: "northwind-monthly-report-may.pdf",
    storage_path: "northwind/2026-05.pdf",
    mime_type: "application/pdf",
    size_bytes: 824320,
    category: "report",
    uploaded_by: DEMO_ADMIN_ID,
    created_at: iso(offsetDays(today, -28)),
  },
  {
    id: "file-002",
    client_id: DEMO_CLIENT_A_ID,
    filename: "ad-creative-pack-q2.zip",
    storage_path: "northwind/creative-q2.zip",
    mime_type: "application/zip",
    size_bytes: 18_400_000,
    category: "other",
    uploaded_by: DEMO_ADMIN_ID,
    created_at: iso(offsetDays(today, -14)),
  },
];

// --- audit ---
export const seedAudit: LoginAudit[] = [
  {
    id: "audit-001",
    client_id: DEMO_CLIENT_A_ID,
    user_id: clientAUserId,
    logged_in_at: iso(offsetDays(today, -1)),
    ip: "203.0.113.42",
    user_agent: "Mozilla/5.0 (Macintosh)",
    city: "Detroit",
    region: "MI",
    country: "US",
  },
  {
    id: "audit-002",
    client_id: DEMO_CLIENT_A_ID,
    user_id: clientAUserId,
    logged_in_at: iso(offsetDays(today, -3)),
    ip: "203.0.113.42",
    user_agent: "Mozilla/5.0 (Macintosh)",
    city: "Detroit",
    region: "MI",
    country: "US",
  },
  {
    id: "audit-003",
    client_id: DEMO_CLIENT_B_ID,
    user_id: clientBUserId,
    logged_in_at: iso(offsetDays(today, -2)),
    ip: "198.51.100.12",
    user_agent: "Mozilla/5.0 (iPhone)",
    city: "Chicago",
    region: "IL",
    country: "US",
  },
];

// --- connectors ---
export const seedConnectors: ConnectorToken[] = [
  {
    id: "conn-001",
    client_id: DEMO_CLIENT_A_ID,
    provider: "gsc",
    account_label: "sc-domain:northwindhvac.example",
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
    meta: {},
    last_synced_at: iso(offsetDays(today, 0)),
    last_sync_status: "ok",
    created_at: iso(offsetDays(today, -120)),
    updated_at: iso(today),
  },
  {
    id: "conn-002",
    client_id: DEMO_CLIENT_A_ID,
    provider: "ga4",
    account_label: "properties/000000",
    scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
    meta: {},
    last_synced_at: iso(offsetDays(today, 0)),
    last_sync_status: "ok",
    created_at: iso(offsetDays(today, -120)),
    updated_at: iso(today),
  },
  {
    id: "conn-003",
    client_id: DEMO_CLIENT_B_ID,
    provider: "gsc",
    account_label: "sc-domain:acmeroofing.example",
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
    meta: {},
    last_synced_at: iso(offsetDays(today, -1)),
    last_sync_status: "ok",
    created_at: iso(offsetDays(today, -60)),
    updated_at: iso(offsetDays(today, -1)),
  },
];

export const seedEmailPrefs: EmailPref[] = [
  { user_id: clientAUserId, opted_out: false, updated_at: iso(today) },
  { user_id: clientBUserId, opted_out: false, updated_at: iso(today) },
];

export const SEED_USERS = {
  admin: { email: "admin@f1media.dev",         password: "demo", profile: seedProfiles[0] },
  clientA: { email: "owner@northwind.example", password: "demo", profile: seedProfiles[1] },
  clientB: { email: "marketing@acme.example",  password: "demo", profile: seedProfiles[2] },
};
