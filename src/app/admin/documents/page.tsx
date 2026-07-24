// Admin document library.
//
// Left: a folder per client plus a shared "F1 Media Team" folder. Right: drop
// zone + the selected folder's documents. The selected folder is a ?folder=
// query param ("f1" or a client id), so folders are linkable and the page
// stays a server component.

import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";
import AdminShell from "@/components/admin/Shell";
import { Card, CardBody } from "@/components/ui";
import DocumentUpload from "@/components/admin/DocumentUpload";
import DocumentList from "@/components/admin/DocumentList";
import { Folder, Users } from "lucide-react";

const F1_FOLDER = "f1";

export default async function AdminDocuments({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string }>;
}) {
  const session = await requireAdmin();
  const { folder } = await searchParams;
  const selected = folder ?? F1_FOLDER;

  const [clients, counts] = await Promise.all([data.listClients(), data.documentCounts()]);

  // Resolve the selected folder to a client id (or null for F1 Media) and load
  // just that folder's documents.
  const clientId = selected === F1_FOLDER ? null : selected;
  const documents = await data.listDocuments(clientId);

  const folderLabel =
    selected === F1_FOLDER
      ? "F1 Media Team"
      : clients.find((c) => c.id === selected)?.company_name ?? "Unknown";

  const folders = [
    {
      id: F1_FOLDER,
      label: "F1 Media Team",
      count: counts.get(null) ?? 0,
      icon: <Users size={15} />,
      shared: true,
    },
    ...clients.map((c) => ({
      id: c.id,
      label: c.company_name,
      count: counts.get(c.id) ?? 0,
      icon: <Folder size={15} />,
      shared: false,
    })),
  ];

  return (
    <AdminShell session={session} active="/admin/documents">
      <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-[1400px] mx-auto">
        <div className="mb-6">
          <div className="text-xs uppercase tracking-widest text-[var(--color-text-muted)]">
            Document library
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Documents</h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--color-text-muted)]">
            Store pricing sheets, tier breakdowns, and contracts — one folder per client, plus a
            shared F1 Media Team folder for anything not tied to a single client. Admin only.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[240px_1fr] items-start">
          {/* Folder list */}
          <nav className="space-y-1">
            {folders.map((f) => {
              const active = f.id === selected;
              return (
                <Link
                  key={f.id}
                  href={`/admin/documents?folder=${f.id}`}
                  className={
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition " +
                    (active
                      ? "bg-[var(--color-bg-hover)] text-[var(--color-text)] font-medium"
                      : "text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text)]") +
                    (f.shared ? " mb-1 border-b border-[var(--color-border)] pb-2.5 rounded-b-none" : "")
                  }
                >
                  <span className="text-[var(--color-text-subtle)]">{f.icon}</span>
                  <span className="flex-1 truncate">{f.label}</span>
                  {f.count > 0 ? (
                    <span className="font-mono text-[10px] text-[var(--color-text-subtle)]">
                      {f.count}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>

          {/* Selected folder */}
          <div className="space-y-5">
            <Card>
              <CardBody className="py-5">
                <div className="mb-3 text-sm font-medium">Add to {folderLabel}</div>
                <DocumentUpload folderId={selected} folderLabel={folderLabel} />
              </CardBody>
            </Card>

            <Card>
              <CardBody className="py-5">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-medium">{folderLabel}</span>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {documents.length} document{documents.length === 1 ? "" : "s"}
                  </span>
                </div>
                <DocumentList documents={documents} />
              </CardBody>
            </Card>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
