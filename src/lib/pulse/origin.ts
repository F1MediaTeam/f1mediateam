// Deciding what a rejected beacon means.
//
// Lives here rather than inside the ingest route so it can be tested against
// the real hostnames that prompted it. A heuristic nobody can run is a
// heuristic nobody can check.

/**
 * Does this host look like the client's own staging or storefront preview?
 *
 * Hosted platforms build preview hostnames out of the store's own name, so
 * `dnpreview_bucketsofink.secure-decoration.com` is Buckets of Ink previewing
 * Buckets of Ink. The test is deliberately narrow: the registered domain's
 * name must be a whole token of the LEFTMOST label, and every other token
 * there must read as a staging marker. That admits `bucketsofink.myshopify.com`
 * and `dnpreview_bucketsofink...` while rejecting `www.evil-bucketsofink.com`,
 * where the name is buried in somebody else's domain.
 *
 * This only decides how loudly to mention the refusal. It never decides
 * whether to accept data — a preview beacon is discarded either way, so a
 * lookalike host that slipped past this still gets nothing. That is what keeps
 * the looseness of a hostname heuristic from mattering.
 */
export function looksLikeOwnPreview(host: string, domain: string): boolean {
  const bare = domain
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./, "")
    .toLowerCase();
  const label = bare.split(".")[0];
  // Two- and three-letter labels collide with too much to be evidence.
  if (!label || label.length < 4) return false;

  const h = host.toLowerCase();
  // The registered site is the real thing, not a preview of it. It is allowed
  // before this is ever consulted, but a function that called the apex a
  // preview would be lying, and the next caller would believe it.
  if (h === bare || h === `www.${bare}`) return false;

  const leftmost = h.split(".")[0];
  const tokens = leftmost.split(/[-_]/).filter(Boolean);
  if (!tokens.includes(label)) return false;

  // `dnpreview` qualifies without this file knowing which vendor that is,
  // because it ends in a word that means preview.
  const EXACT = /^(?:preview|staging|stage|dev|test|sandbox|demo|beta|uat|qa|shop|store|secure|my|new|old)$/;
  const ENDS = /(?:preview|staging|stage|sandbox)$/;
  return tokens.every((t) => t === label || EXACT.test(t) || ENDS.test(t));
}
