// In-memory store for the mock data adapter.
// Persists to a JSON file under .data/ so dev-server restarts don't blow away
// approvals, task edits, etc. Not for production — Supabase is the prod path.

import fs from "node:fs";
import path from "node:path";
import {
  seedClients,
  seedProfiles,
  seedTasks,
  seedCalendar,
  seedSnapshots,
  seedContent,
  seedContentEvents,
  seedFiles,
  seedAudit,
  seedConnectors,
  seedEmailPrefs,
} from "./seed";
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

interface State {
  clients: Client[];
  profiles: Profile[];
  tasks: Task[];
  calendar: CalendarEvent[];
  snapshots: MetricSnapshot[];
  content: ContentCard[];
  contentEvents: ContentCardEvent[];
  files: FileRecord[];
  audit: LoginAudit[];
  connectors: ConnectorToken[];
  emailPrefs: EmailPref[];
  acceptedDisclaimers: Record<string, string>; // user_id -> version
}

const STORE_PATH = path.join(process.cwd(), ".data", "mock-store.json");

let state: State | null = null;

function fresh(): State {
  return {
    clients: structuredClone(seedClients),
    profiles: structuredClone(seedProfiles),
    tasks: structuredClone(seedTasks),
    calendar: structuredClone(seedCalendar),
    snapshots: structuredClone(seedSnapshots),
    content: structuredClone(seedContent),
    contentEvents: structuredClone(seedContentEvents),
    files: structuredClone(seedFiles),
    audit: structuredClone(seedAudit),
    connectors: structuredClone(seedConnectors),
    emailPrefs: structuredClone(seedEmailPrefs),
    acceptedDisclaimers: {},
  };
}

function load(): State {
  if (state) return state;
  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, "utf-8");
      state = JSON.parse(raw) as State;
      return state;
    }
  } catch {
    // fall through to fresh
  }
  state = fresh();
  persist();
  return state;
}

function persist() {
  if (!state) return;
  try {
    fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
    fs.writeFileSync(STORE_PATH, JSON.stringify(state, null, 2), "utf-8");
  } catch {
    // swallow — dev only
  }
}

export function getState(): State {
  return load();
}

export function mutate<T>(fn: (s: State) => T): T {
  const s = load();
  const result = fn(s);
  persist();
  return result;
}

export function resetStore() {
  state = fresh();
  persist();
}
