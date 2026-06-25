// Bing Webmaster Tools — per-client API key flow.
//
// Bing's API has no OAuth. The admin pastes the API key for each client's
// Bing Webmaster account (Settings → API Access → Generate). We verify by
// calling GetUserSites and store the first verified site as the client's
// Bing connection. The key is encrypted at rest.

import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";
import AdminShell from "@/components/admin/Shell";
import { Card, CardBody, CardHeader, Button } from "@/components/ui";
import { connectBingAction } from "@/app/admin/actions";

export default async function ConnectBingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAdmin();
  const { id } = await params;
  const client = await data.getClient(id);
  if (!client) return null;

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
          Paste the Bing Webmaster API key for {client.company_name}. Get it
          from <a href="https://www.bing.com/webmasters" target="_blank" rel="noopener noreferrer" className="text-[var(--color-accent)] hover:underline">bing.com/webmasters</a>{" "}
          → Settings → API Access → Generate. The key is encrypted at rest and
          only used for backend syncs.
        </p>

        <Card>
          <CardHeader title="API key" subtitle="Encrypted at rest, never displayed back." />
          <CardBody>
            <form action={connectBingAction} className="space-y-3">
              <input type="hidden" name="client_id" value={id} />
              <input
                type="password"
                name="apikey"
                placeholder="e.g. 1eb029d2a5a64c1898894e2c187436e7"
                autoComplete="off"
                required
                className="w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-elev)] px-3.5 py-2.5 text-sm font-mono"
              />
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
          </CardBody>
        </Card>
      </div>
    </AdminShell>
  );
}
