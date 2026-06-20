import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";
import AdminShell from "@/components/admin/Shell";
import { Card, CardBody, CardHeader, Button } from "@/components/ui";
import { connectSemrushAction } from "@/app/admin/actions";

export default async function ConnectSemrushPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAdmin();
  const { id } = await params;
  const client = await data.getClient(id);
  if (!client) return null;
  const defaultDomain = (client.websites ?? [])[0] ?? "";

  return (
    <AdminShell session={session} active="/admin/clients">
      <div className="px-8 py-8 max-w-2xl">
        <Link
          href={`/admin/clients/${id}`}
          className="text-xs text-[var(--color-text-muted)] hover:text-white"
        >
          ← Back to {client.company_name}
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight mt-2 mb-1">
          Connect Semrush
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mb-8">
          Paste your Semrush API key and confirm {client.company_name}&apos;s domain.
          The key is encrypted at rest and only used for backend syncs.
        </p>

        <Card>
          <CardHeader title="API key + domain" subtitle="Encrypted at rest, never displayed back." />
          <CardBody>
            <form action={connectSemrushAction} className="space-y-3">
              <input type="hidden" name="client_id" value={id} />
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] mb-1.5">
                  API key
                </label>
                <input
                  type="password"
                  name="apikey"
                  placeholder="32-character key from semrush.com → My Profile → API Units"
                  autoComplete="off"
                  required
                  className="w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-elev)] px-3.5 py-2.5 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] mb-1.5">
                  Domain
                </label>
                <input
                  type="text"
                  name="domain"
                  defaultValue={defaultDomain}
                  placeholder="bucketsofink.com"
                  required
                  className="w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-elev)] px-3.5 py-2.5 text-sm font-mono"
                />
              </div>
              <div className="flex items-center gap-2 pt-2">
                <Button type="submit">Connect</Button>
                <Link
                  href={`/admin/clients/${id}`}
                  className="text-xs text-[var(--color-text-muted)] hover:text-white px-3 py-2"
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
