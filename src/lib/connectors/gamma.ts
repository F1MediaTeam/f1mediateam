// Gamma Generate API client.
// Docs: https://developers.gamma.app — REST, key auth (no OAuth).
//   POST /v1.0/generations          → { generationId, warnings? }
//   GET  /v1.0/generations/{id}      → { status, gammaUrl?, credits? }
//
// Auth: header `X-API-KEY`, from GAMMA_API_KEY. Requires a Gamma Pro/Ultra/
// Teams/Business plan. Generations are billed in credits (~1-3 per card).
//
// Unlike the connectors in ./index.ts, this is not a metric Connector — it's a
// one-way "render a deck" client — so it stands on its own rather than
// implementing the SyncContext/SyncResult interface.

const GAMMA_BASE = "https://public-api.gamma.app/v1.0";

/** True when a key is present so the server can render decks. */
export function gammaConfigured(): boolean {
  return Boolean(process.env.GAMMA_API_KEY);
}

function apiKey(): string {
  const key = process.env.GAMMA_API_KEY;
  if (!key) throw new Error("GAMMA_API_KEY is not set — add a Gamma API key to enable deck generation.");
  return key;
}

// Mirrors the subset of the Generate API we use. `inputText` is the only
// required field; everything else is an intelligent default on Gamma's side.
export interface GammaGenerateBody {
  inputText: string;
  textMode?: "generate" | "condense" | "preserve";
  format?: "presentation" | "document" | "social" | "webpage";
  cardSplit?: "inputTextBreaks" | "auto";
  numCards?: number;
  themeId?: string;
  title?: string;
  additionalInstructions?: string;
  exportAs?: "pptx" | "pdf" | "png";
  imageOptions?: { source?: string; model?: string; stylePreset?: string; style?: string };
  textOptions?: { amount?: string; tone?: string; audience?: string; language?: string };
}

export interface GammaGeneration {
  generationId: string;
  warnings?: string;
}

export interface GammaStatus {
  generationId: string;
  status: "pending" | "completed" | "failed" | string;
  gammaUrl?: string;
  exportUrl?: string;
  credits?: { deducted?: number; remaining?: number };
  error?: string;
}

/** The user-facing URL for a generation — shows live progress, then the deck. */
export function generationUrl(generationId: string): string {
  return `https://gamma.app/generations/${generationId}`;
}

export async function createGeneration(body: GammaGenerateBody): Promise<GammaGeneration> {
  const res = await fetch(`${GAMMA_BASE}/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey(),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gamma API error (${res.status}): ${detail || res.statusText}`);
  }
  return (await res.json()) as GammaGeneration;
}

export async function getGeneration(generationId: string): Promise<GammaStatus> {
  const res = await fetch(`${GAMMA_BASE}/generations/${encodeURIComponent(generationId)}`, {
    headers: { "X-API-KEY": apiKey() },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gamma API error (${res.status}): ${detail || res.statusText}`);
  }
  return (await res.json()) as GammaStatus;
}
