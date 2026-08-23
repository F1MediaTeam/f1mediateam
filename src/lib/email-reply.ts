// Reading a reply to one of our emails.
//
// Separate from the webhook route so it can be tested directly. Route files
// can only export HTTP handlers, and a copy of this logic in a test file would
// keep passing after the real one broke.

/**
 * Just the part of a reply the person actually typed.
 *
 * Two things make this necessary, and the second is a trap. Replies quote the
 * original underneath, so without trimming, every instruction would re-run
 * every day. And the email being replied to *lists example commands* — "done
 * T-7" appears in its own footer — so quoted text is not merely redundant, it
 * is actively dangerous to parse.
 */
export function newTextOnly(body: string): string {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    // Quote markers, in the shapes the common clients emit.
    if (t.startsWith(">")) break;
    if (/^On .+ wrote:$/i.test(t)) break;
    if (/^-{2,}\s*Original Message/i.test(t)) break;
    if (/^_{5,}$/.test(t)) break;
    if (/^From:\s/i.test(t)) break;
    // Our own footer. Everything from here down is what we sent them.
    if (/^Reply to this email to change the list/i.test(t)) break;
    if (/^Still open \(\d+\):/i.test(t)) break;
    out.push(line);
  }
  return out.join("\n").trim();
}
