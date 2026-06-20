// Connector framework — uniform interface for every external data source.
// Phase 1: gsc + ga4 (real OAuth wiring is the next session).
// Phase 1.5+ providers (google_ads, bing_wmt, semrush, meta, tiktok) implement
// this same interface — no UI changes needed when they land.

import type { ConnectorToken, MetricSnapshot, UUID } from "@/lib/types";

export interface SyncContext {
  clientId: UUID;
  token: ConnectorToken;
  /** windowing: pull data for [from, to]. omit to use provider default */
  from?: string;
  to?: string;
}

export interface SyncResult {
  /** Snapshots to upsert into metric_snapshots. captured_at is the metric date. */
  snapshots: Array<Omit<MetricSnapshot, "id" | "created_at" | "client_id">>;
  /** Provider's reported "last data available" date. Used for the UI's "last synced" stamp. */
  effectiveAsOf: string;
}

export interface Connector {
  provider: string;
  label: string;
  /** Begin OAuth — return the URL to redirect the admin to. */
  buildAuthUrl?(opts: { clientId: UUID; redirectUri: string; state: string }): string;
  /** Exchange the OAuth code on callback. Returns a token to persist. */
  exchangeCode?(code: string): Promise<Omit<ConnectorToken, "id" | "created_at" | "updated_at">>;
  /** Pull data for one client. */
  sync(ctx: SyncContext): Promise<SyncResult>;
}

import { gscConnector } from "./gsc";
import { ga4Connector } from "./ga4";
import { bingConnector } from "./bing";
import { semrushConnector } from "./semrush";

export const REGISTRY: Record<string, Connector> = {
  gsc: gscConnector,
  ga4: ga4Connector,
  bing: bingConnector,
  semrush: semrushConnector,
};

export function getConnector(provider: string): Connector | null {
  return REGISTRY[provider] ?? null;
}
