// Bing Webmaster Tools — agency-key flow.
//
// Bing's API has no OAuth. To avoid making the user paste a per-client key,
// we use ONE master key (BING_API_KEY env var) for our whole agency. The
// admin just picks which verified site this client maps to.
//
// Setup: in Bing Webmaster Tools, verify every client site under your single
// Bing account. Add BING_API_KEY in Vercel project env.

import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";
import AdminShell from "@/components/admin/Shell";
import { Card, CardBody, CardHeader, Button } from "@/components/ui";
import { connectBingSiteAction, connectBingAction } from "@/app/admin/actions";
import { listBingSites } from "@/lib/connectors/bing";

export default async function ConnectBingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAdmin();
  const { id } = await params;
  const client = await data.getClient(id);
  if (!client) return null;

  const agencyKey = process.env.BING_API_KEY;
  let sites: string[] = [];
  let sitesError: string | null = null;

  if (!agencyKey) {
    sitesError = "BING_API_KEY is not set on the server. Add it in Vercel → Project → Environment Variables.";
  } else {
    try {
      sites = await listBingSites(agencyKey);
    } catch (e) {
      sitesError = e instanceof Error ? e.message : String(e);
    }
  }

  // Sensible default: pick the first verified site whose hostname is in the
  // client's websites list, so the dropdown lands on the right entry.
  const clientHosts = (client.websites ?? [])
    .map((w) => {
      try { return new URL(w).hostname.replace(/^www\./, ""); } catch { return null; }
    })
    .filter((h): h is string => !!h);
  const matchedSite = sites.find((s) => {
    try { return clientHosts.some((h) => new URL(s).hostname.replace(/^www\./, "") === h); } catch { return false; }
  });
  const defaultSite = matchedSite ?? sites[0];
  const noClientMatch = sites.length > 0 && !matchedSite;

  return (
    <AdminShell session={session} active="/admin/clients">
      <div className="px-8 py-8 max-w-2xl">
        <Link
          href={`/admin/clients/${id}`}
          className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          ← Back to {client.company_name}
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight mt-2 mb-1">
          Connect Bing Webmaster Tools
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mb-8">
          Pick the verified site from your agency Bing account that belongs to {client.company_name}.
          No per-client API key needed.
        </p>

        <Card>
          <CardHeader title="Pick a site" subtitle="Verified sites under your Bing Webmaster account" />
          <CardBody>
            {sitesError ? (
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                <div className="font-medium">Couldn&apos;t load Bing sites</div>
                <div className="mt-0.5 text-red-200/80">{sitesError}</div>
              </div>
            ) : sites.length === 0 ? (
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-4 py-3 text-sm text-[var(--color-text-muted)]">
                No verified sites in your Bing Webmaster account.
                Add {client.company_name}&apos;s site at{" "}
                <a href="https://www.bing.com/webmasters" target="_blank" rel="noopener noreferrer" className="text-[var(--color-accent)] hover:underline">bing.com/webmasters</a>
                {" "}and verify it, then come back.
              </div>
            ) : (
              <form action={connectBingSiteAction} className="space-y-3">
                <input type="hidden" name="client_id" value={id} />
                <select
                  name="site_url"
                  required
                  defaultValue={defaultSite}
                  className="w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-elev)] px-3.5 py-2.5 text-sm font-mono"
                >
                  {sites.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                {noClientMatch ? (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-200">
                    <div className="font-medium">Don&apos;t see {client.company_name}&apos;s site?</div>
                    <div className="mt-1 text-amber-200/80">
                      Your agency Bing account doesn&apos;t have it verified yet.
                      Open{" "}
                      <a href="https://www.bing.com/webmasters" target="_blank" rel="noopener noreferrer" className="underline">bing.com/webmasters</a>
                      {" "}signed in as <span className="font-mono">garrett.f1mediateam@gmail.com</span> and either{" "}
                      <strong>Add a site</strong> for{" "}
                      <span className="font-mono">{clientHosts[0] ?? client.company_name}</span>
                      , or ask the client to add your agency email as an{" "}
                      <strong>Administrator</strong> on their existing Bing property.
                      Reload this page after.
                    </div>
                  </div>
                ) : null}
                <div className="flex items-center gap-2 pt-2">
                  <Button type="submit">Connect</Button>
                  <Link
                    href={`/admin/clients/${id}`}
                    className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] px-3 py-2"
                  >
                    Cancel
                  </Link>
                </div>
              </form>
            )}
          </CardBody>
        </Card>

        <Card className="mt-6">
          <CardHeader
            title="Or use this client's own Bing key"
            subtitle="Use when the client's site is verified under a different Bing account than your agency one"
          />
          <CardBody>
            <form action={connectBingAction} className="space-y-3">
              <input type="hidden" name="client_id" value={id} />
              <input
                type="password"
                name="apikey"
                placeholder="32-character Bing Webmaster API key"
                autoComplete="off"
                required
                className="w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-elev)] px-3.5 py-2.5 text-sm font-mono"
              />
              <p className="text-[11px] text-[var(--color-text-subtle)]">
                We&apos;ll call <span className="font-mono">GetUserSites</span> with this key and store the first verified site as
                {" "}{client.company_name}&apos;s Bing connection. The key is encrypted at rest and replaces the agency key for this client.
              </p>
              <div className="flex items-center gap-2 pt-2">
                <Button type="submit">Connect with this key</Button>
              </div>
            </form>
          </CardBody>
        </Card>
      </div>
    </AdminShell>
  );
}
