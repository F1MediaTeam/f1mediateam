// Shared TypeScript types — mirror the Postgres schema.
// When swapping the mock adapter for the Supabase one, these stay identical.

export type UUID = string;
export type ISODate = string;       // 'YYYY-MM-DD'
export type ISODateTime = string;   // ISO 8601

export type UserRole = "admin" | "client";

export interface Profile {
  id: UUID;
  role: UserRole;
  client_id: UUID | null;
  full_name: string | null;
  email: string;
  created_at: ISODateTime;
}

export interface ClientConfig {
  // feature flags — which widgets show on the shared client dashboard
  widgets: {
    rankings: boolean;
    traffic: boolean;
    content: boolean;
    files: boolean;
    calendar: boolean;
  };
  branding?: {
    accent?: string; // hex
    logo_url?: string;
  };
}

/** Monthly-report tier: 1 = Foundation Visibility, 2 = Growth & Authority, 3 = Market Domination. */
export type ClientTier = "1" | "2" | "3" | null;

export const TIER_LABELS: Record<NonNullable<ClientTier>, string> = {
  "1": "Tier 1 — Foundation Visibility",
  "2": "Tier 2 — Growth & Authority",
  "3": "Tier 3 — Market Domination",
};

export interface Client {
  id: UUID;
  company_name: string;
  join_date: ISODate;
  websites: string[];
  config: ClientConfig;
  branding: Record<string, unknown>;
  tier?: ClientTier;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export type TaskStatus = "open" | "done";

export interface Task {
  id: UUID;
  client_id: UUID;
  title: string;
  notes: string | null;
  due_date: ISODate | null;
  status: TaskStatus;
  assigned_by: UUID | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export type CalendarEventType = "meeting" | "deadline";

export interface CalendarEvent {
  id: UUID;
  /** null = an F1 Media internal event (not tied to a client). */
  client_id: UUID | null;
  type: CalendarEventType;
  title: string;
  notes: string | null;
  starts_at: ISODateTime;
  ends_at: ISODateTime | null;
  created_by: UUID | null;
  created_at: ISODateTime;
}

export interface CalendarEventAttachment {
  id: UUID;
  event_id: UUID;
  storage_path: string;       // key inside the calendar-attachments bucket
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: UUID | null;
  created_at: ISODateTime;
}

export interface MetricSnapshot {
  id: UUID;
  client_id: UUID;
  source: string; // 'gsc' | 'ga4' | 'manual' | ...
  metric: string; // 'clicks' | 'impressions' | 'sessions' | 'avg_position' | 'visibility'
  value: number;
  captured_at: ISODate;
  is_baseline: boolean;
  meta: Record<string, unknown>;
  created_at: ISODateTime;
}

// One Semrush "deep pull" report (a list-type report: keywords, backlinks,
// competitors, …). `rows` is the array of records keyed by Semrush's own
// column labels; `meta` carries domain, est. units, and any per-report error.
export interface SemrushReport {
  id: UUID;
  client_id: UUID;
  report_type: string;
  captured_at: ISODate;
  pulled_at: ISODateTime;
  rows: Record<string, string>[];
  row_count: number;
  meta: Record<string, unknown>;
}

export type ContentStage = "proposed" | "pending" | "posted";

export interface ContentCard {
  id: UUID;
  client_id: UUID;
  title: string;
  body: string | null;
  link: string | null;
  file_url: string | null;
  stage: ContentStage;
  created_by: UUID | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface ContentCardEvent {
  id: UUID;
  card_id: UUID;
  from_stage: ContentStage | null;
  to_stage: ContentStage;
  actor_user_id: UUID | null;
  actor_role: UserRole;
  note: string | null;
  created_at: ISODateTime;
}

export interface FileRecord {
  id: UUID;
  client_id: UUID;
  filename: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  category: string | null;
  uploaded_by: UUID | null;
  created_at: ISODateTime;
}

export interface LoginAudit {
  id: UUID;
  client_id: UUID | null;
  user_id: UUID | null;
  logged_in_at: ISODateTime;
  ip: string | null;
  user_agent: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
}

export interface AdminImpersonation {
  id: UUID;
  admin_user_id: UUID | null;
  client_id: UUID;
  started_at: ISODateTime;
  ended_at: ISODateTime | null;
  ip: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
}

export interface ClientOnboarding {
  id: UUID;
  client_id: UUID;
  submitted_by: UUID | null;
  data: OnboardingData;
  terms_version: string;
  accepted_terms: boolean;
  submitted_at: ISODateTime;
}

export interface OnboardingData {
  primary_admin_email?: string;
  primary_admin_username?: string;
  primary_admin_password?: string;
  secondary_admin_email?: string;
  secondary_admin_username?: string;
  secondary_admin_password?: string;
  primary_tied_to_google?: "yes" | "no" | "";
  primary_tied_to_hosting?: "yes" | "no" | "";

  website_url?: string;
  website_username?: string;
  website_password?: string;
  domain_registrar?: string;
  hosting_provider?: string;
  website_admin_email?: string;
  cms_platform?: string;
  developer_contact?: string;

  google_admin_email?: string;
  google_access?: {
    analytics?: boolean;
    search_console?: boolean;
    business_profile?: boolean;
    ads?: boolean;
    tag_manager?: boolean;
    other?: string;
  };
  microsoft_admin_email?: string;
  microsoft_access?: {
    bing_webmaster?: boolean;
    ads?: boolean;
    other?: string;
  };

  socials?: Record<
    string,
    { username?: string; admin_email?: string }
  >;

  authorization_preference?:
    | "direct_credentials"
    | "temporary_password"
    | "admin_invite"
    | "dedicated_email"
    | "other"
    | "";
  authorization_other?: string;

  // ----- Doc 2: Company Bio & Performance Insights -----
  company_bio?: string;
  brand_diff?: string;             // "What makes your firm different…"
  brand_3words?: string;           // "If a client had to describe your firm in three words…"
  // "Indicate all that apply" — each *_active flag is the real checkbox state.
  // Sub-fields are only required when the matching flag is true.
  perf_social_active?: boolean;
  perf_social_used?: string;       // checkbox + free text
  perf_social_explanation?: string;
  perf_website_active?: boolean;
  perf_website_url?: string;
  perf_website_explanation?: string;
  perf_paid_active?: boolean;
  perf_paid_platforms?: string;
  perf_paid_explanation?: string;
  perf_podcast_active?: boolean;
  perf_podcast_name?: string;
  perf_podcast_explanation?: string;
  perf_youtube?: string;
  perf_youtube_explanation?: string;
  perf_seo_explanation?: string;
  perf_referrals_explanation?: string;
  perf_underperforming?: string;

  // ----- Doc 3: Contact List -----
  contacts?: Array<{
    name?: string;
    email?: string;
    phone?: string;
    role?: string;
  }>;

  // ----- Doc 4: Digital Growth Strategy (read-only, no fields) -----
  // No fields; this doc is informational.

  // ----- Doc 5: List of Services & Locations -----
  services?: Array<{
    name?: string;
    description?: string;
    priority?: "high" | "medium" | "low" | "";
    audience?: string;
  }>;
  service_locations?: Array<{
    city?: string;
    has_office?: "yes" | "no" | "";
    priority?: "high" | "medium" | "low" | "";
    notes?: string;
  }>;
  market_focus_main_city?: string;
  market_focus_competition?: string;
  market_focus_priority_cities?: string;
  market_focus_avoid?: string;

  // ----- Doc 6: Logos & Photos (file upload — actual files in storage,
  //                metadata only here) -----
  uploaded_asset_filenames?: string[];
  brand_color_hex?: string;
  brand_fonts?: string;
  brand_guidelines_notes?: string;

  // ----- Doc 2 extras: Additional Strategic Insights -----
  ideal_client?: string;
  highest_revenue_cases?: string;
  cases_to_avoid?: string;
  saturated_markets?: string;
  growth_opportunity?: string;
  perf_other_active?: boolean;
  perf_other?: string;
  perf_other_explanation?: string;
  perf_underperforming_channel?: string;
  perf_underperforming_attempted?: string;
  perf_additional_notes?: string;

  // ----- Doc 1 extras: Social platform admin emails (per-platform username+email
  //         is already covered by `socials`); the doc also requests counties /
  //         statewide / out-of-state fields on doc 5 — see below. -----

  // ----- Doc 5 extras: Detailed geographic targeting per the doc -----
  primary_city?: {
    name?: string;
    has_office?: "yes" | "no" | "";
    office_address?: string;
    virtual_service?: "yes" | "no" | "";
    priority?: "high" | "medium" | "low" | "";
    revenue_market?: "yes" | "no" | "";
    notes?: string;
  };
  counties_served?: Array<{
    name?: string;
    office_in_county?: "yes" | "no" | "";
    priority?: "high" | "medium" | "low" | "";
    notes?: string;
  }>;
  statewide_coverage?: {
    provides?: "yes" | "no" | "";
    limitations?: string;
    priority?: "high" | "medium" | "low" | "";
  };
  out_of_state?: Array<{
    state?: string;
    service_type?: string;
    licensed?: "yes" | "no" | "";
    office?: "yes" | "no" | "";
    priority?: "high" | "medium" | "low" | "";
    notes?: string;
  }>;
  future_expansion_targets?: string;
  future_expansion_timeline?: string;
}

export interface ConnectorToken {
  id: UUID;
  client_id: UUID;
  provider: string;
  account_label: string | null;
  scopes: string[];
  meta: Record<string, unknown>;
  last_synced_at: ISODateTime | null;
  last_sync_status: string | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface EmailPref {
  user_id: UUID;
  opted_out: boolean;
  updated_at: ISODateTime;
}

export const DISCLAIMER_VERSION = "v1";
export const DISCLAIMER_TEXT = `Welcome to F1 Media's client portal.

By signing in you acknowledge that data shown here — including search rankings, traffic, and content performance — comes from third-party APIs (Google Search Console, Google Analytics, etc.) and is refreshed on a schedule. Figures may lag actual results by up to several days.

You agree to keep your login credentials confidential. Login activity on this account is recorded with a timestamp and your IP address for security and audit purposes.

You may request your data, opt out of marketing email, or close your portal access at any time by contacting your account manager.`;
