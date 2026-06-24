// Calendar events store their optional join/reference URL inline in the
// `notes` column using a sentinel prefix `[URL] <link>` (introduced so the
// new field didn't require a schema migration). This helper splits the
// notes value into the URL part and the remaining body text.

export interface ParsedEventNotes {
  url: string | null;
  /** notes with the [URL] line stripped, may be empty */
  body: string;
}

export function parseEventNotes(notes: string | null | undefined): ParsedEventNotes {
  if (!notes) return { url: null, body: "" };
  const m = /^\[URL\]\s+(\S+)\s*(?:\n+([\s\S]*))?$/.exec(notes.trim());
  if (m) {
    return { url: m[1] ?? null, body: (m[2] ?? "").trim() };
  }
  return { url: null, body: notes };
}
