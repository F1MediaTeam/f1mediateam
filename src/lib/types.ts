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

export interface Client {
  id: UUID;
  company_name: string;
  join_date: ISODate;
  websites: string[];
  config: ClientConfig;
  branding: Record<string, unknown>;
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
  client_id: UUID;
  type: CalendarEventType;
  title: string;
  notes: string | null;
  starts_at: ISODateTime;
  ends_at: ISODateTime | null;
  created_by: UUID | null;
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
