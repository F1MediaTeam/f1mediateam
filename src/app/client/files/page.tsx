import { requireClient } from "@/lib/auth/session";
import { data } from "@/lib/data";
import ClientShell from "@/components/client/Shell";
import { Card, CardBody, CardHeader, Pill, EmptyState } from "@/components/ui";
import { formatBytes } from "@/lib/utils";
import Time from "@/components/shared/Time";

export default async function ClientFiles() {
  const session = await requireClient();
  const client = await data.getClient(session.client_id!);
  if (!client) return null;
  const files = await data.listFiles(client.id);
  const widgetOn = client.config.widgets.files;

  return (
    <ClientShell session={session} client={client} active="/client/files">
      <div className="mb-8">
        <div className="text-xs uppercase tracking-widest text-[var(--color-text-muted)]">
          Files
        </div>
        <h1 className="text-3xl font-semibold tracking-tight mt-1">Your folder</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Reports, video assets, and other materials shared by your account manager.
        </p>
      </div>

      {!widgetOn ? (
        <EmptyState
          title="File sharing isn't enabled on your account"
          description="Your account manager can switch this on for you."
        />
      ) : files.length === 0 ? (
        <EmptyState title="No files yet" description="Anything we upload for you will appear here." />
      ) : (
        <Card>
          <CardHeader title={`${files.length} files`} />
          <CardBody className="space-y-1.5">
            {files.map((f) => (
              <div
                key={f.id}
                className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-4 py-3"
              >
                <div className="min-w-0 flex items-center gap-3">
                  <Pill>{f.category ?? "other"}</Pill>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{f.filename}</div>
                    <div className="text-[11px] text-[var(--color-text-muted)] font-mono mt-0.5">
                      {formatBytes(f.size_bytes)} · uploaded <Time iso={f.created_at} dateOnly />
                    </div>
                  </div>
                </div>
                <span className="text-xs text-[var(--color-text-subtle)]">
                  {/* In Supabase mode this becomes a signed URL */}
                  Download
                </span>
              </div>
            ))}
          </CardBody>
        </Card>
      )}
    </ClientShell>
  );
}
