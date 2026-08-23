// Getting the text of an email Resend received for us.
//
// The `email.received` webhook carries metadata only — id, from, to, subject,
// attachment names. Not the body. Retrieving the actual message is a second
// call to GET /emails/receiving/{id}, and everything that reads a reply has to
// go through here or it will be parsing an empty string.
//
// Two further wrinkles the API example makes plain:
//
//   * `text` may be null. A mail client that sends HTML only leaves nothing in
//     it, so the plain-text body has to be recovered from the HTML.
//   * `html` may not be HTML. When `html_format` is "data_uri" the field holds
//     a data: URI that has to be decoded first.

export interface ReceivedEmail {
  id: string;
  from: string;
  subject: string | null;
  text: string | null;
  html: string | null;
  html_format?: string | null;
}

/** Decode `data:text/html;base64,…` and the percent-encoded variant. */
function decodeDataUri(value: string): string {
  const m = value.match(/^data:([^,]*),([\s\S]*)$/);
  if (!m) return value;
  const [, meta, payload] = m;
  try {
    if (/;base64/i.test(meta)) return Buffer.from(payload, "base64").toString("utf8");
    return decodeURIComponent(payload);
  } catch {
    return payload;
  }
}

/** Crude HTML to text. Enough to recover "done T-7" from a formatted reply. */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    // Block boundaries have to become newlines: the instructions are
    // line-based, and collapsing them would run every command together.
    .replace(/<\/(?:p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<blockquote[\s\S]*$/i, "") // quoted original, in HTML replies
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The readable body of a received email, whichever field it arrived in. */
export function bodyOf(email: ReceivedEmail): string {
  if (email.text && email.text.trim()) return email.text;
  if (!email.html) return "";
  const raw = email.html_format === "data_uri" || email.html.startsWith("data:")
    ? decodeDataUri(email.html)
    : email.html;
  return htmlToText(raw);
}

/** Fetch a received email by id. Returns null rather than throwing. */
export async function fetchReceivedEmail(id: string): Promise<ReceivedEmail | null> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as ReceivedEmail;
  } catch {
    return null;
  }
}
