// Plain-English explanations for the HTTP status codes the redirect checker
// surfaces. Written for someone auditing a site, not a developer: what the
// code means, and whether it's something to act on.

export interface StatusInfo {
  label: string;
  what: string;
}

const CODES: Record<number, StatusInfo> = {
  200: { label: "OK", what: "The page loaded normally. This is the healthy end of a chain — nothing to fix." },
  301: { label: "Moved permanently", what: "This URL permanently redirects somewhere else. Search engines pass ranking to the new URL, so this is the right redirect to use when a page moves for good." },
  302: { label: "Found (temporary redirect)", what: "A temporary redirect. Search engines keep the old URL indexed. If the move is permanent, this should usually be a 301 instead." },
  303: { label: "See other", what: "Redirects to another page, typically after a form submission. Uncommon for normal page URLs." },
  304: { label: "Not modified", what: "The page hasn't changed since it was last cached. Normal and harmless." },
  307: { label: "Temporary redirect", what: "A temporary redirect that keeps the request method. Like a 302 — fine if the move is temporary, but use 301 for a permanent one." },
  308: { label: "Permanent redirect", what: "A permanent redirect that keeps the request method. Passes ranking like a 301." },
  400: { label: "Bad request", what: "The server couldn't understand the request. Usually a malformed URL." },
  401: { label: "Unauthorized", what: "The page requires a login. Expected behind a members area; a problem if it should be public." },
  403: { label: "Forbidden", what: "Access is blocked. Sometimes intentional, but a public page returning 403 is a problem — it can't be crawled or ranked." },
  404: { label: "Not found", what: "The page doesn't exist. If something links here or it used to rank, set up a 301 redirect to a relevant live page." },
  410: { label: "Gone", what: "The page was intentionally removed for good. Tells search engines to drop it faster than a 404." },
  429: { label: "Too many requests", what: "The server is rate-limiting requests. Usually temporary." },
  500: { label: "Server error", what: "Something broke on the server. A live page returning 500 needs attention — it's down for visitors and crawlers." },
  502: { label: "Bad gateway", what: "A server-to-server error, often temporary. If it persists, the hosting or a proxy is misconfigured." },
  503: { label: "Service unavailable", what: "The server is temporarily down or overloaded — often maintenance. A problem only if it sticks around." },
};

function classInfo(status: number): StatusInfo {
  if (status >= 200 && status < 300) return { label: "Success", what: "The request succeeded." };
  if (status >= 300 && status < 400) return { label: "Redirect", what: "This URL points somewhere else — the next line in the chain is where it goes." };
  if (status >= 400 && status < 500) return { label: "Client error", what: "The page couldn't be served — missing, blocked, or a bad request." };
  if (status >= 500) return { label: "Server error", what: "Something went wrong on the server's end." };
  return { label: "Informational", what: "An interim response." };
}

export function explainStatus(status: number): StatusInfo {
  return CODES[status] ?? classInfo(status);
}
