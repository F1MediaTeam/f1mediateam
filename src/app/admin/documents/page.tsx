// Admin document library.
//
// Left: a fixed top-level folder per client, plus a shared "F1 Media Team"
// folder. Right: a breadcrumb, user-created subfolders (create / rename /
// delete), a drop zone that uploads into the current folder, and that folder's
// documents.
//
// State is two query params — ?folder=<scope> (a client id or "f1") and
// ?dir=<folderId> for the subfolder within it — so everything is linkable and
// the page stays a server component.

import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";
import AdminShell from "@/components/admin/Shell";
import { Card, CardBody } from "@/components/ui";
import DocumentUpload from "@/components/admin/DocumentUpload";
import DocumentList from "@/components/admin/DocumentList";
import FolderManager from "@/components/admin/FolderManager";
import { Folder, Users, ChevronRight } from "lucide-react";
import type { DocumentFolder } from "@/lib/types";

const F1_FOLDER = "f1";

export default async function AdminDocuments({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string; dir?: string }>;
}) {
  const session = await requireAdmin();
  const { folder, dir } = await searchParams;
  const selected = folder ?? F1_FOLDER;
  const currentDir = dir ?? null;

  const [clients, counts] = await Promise.all([data.listClients(), data.documentCounts()]);
  const clientId = selected === F1_FOLDER ? null : selected;

  // All folders in this scope (small), plus the documents in the current dir.
  const [allFolders, documents] = await Promise.all([
    data.listFolders(clientId),
    data.listDocuments(clientId, currentDir),
  ]);
  const foldersById = new Map(allFolders.map((f) => [f.id, f]));

  // Guard against a stale ?dir= from another scope.
  const dirValid = currentDir === null || foldersById.has(currentDir);
  const activeDir = dirValid ? currentDir : null;

  const subfolders = allFolders.filter((f) => (f.parent_id ?? null) === (activeDir ?? null));

  // Walk parents to build the breadcrumb trail.
  const trail: DocumentFolder[] = [];
  let walk = activeDir ? foldersById.get(activeDir) ?? null : null;
  while (walk) {
    trail.unshift(walk);
    walk = walk.parent_id ? foldersById.get(walk.parent_id) ?? null : null;
  }

  const scopeLabel =
    selected === F1_FOLDER
      ? "F1 Media Team"
      : clients.find((c) => c.id === selected)?.company_name ?? "Unknown";

  const scopeFolders = [
    { id: F1_FOLDER, label: "F1 Media Team", count: counts.get(null) ?? 0, icon: <Users size={15} />, shared: true },
    ...clients.map((c) => ({
      id: c.id,
      label: c.company_name,
      count: counts.get(c.id) ?? 0,
      icon: <Folder size={15} />,
      shared: false,
    })),
  ];

  const crumbHref = (d: string | null) =>
    d ? `/admin/documents?folder=${selected}&dir=${d}` : `/admin/documents?folder=${selected}`;

  return (
    <AdminShell session={session} active="/admin/documents">
      <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-[1400px] mx-auto">
        <div className="mb-6">
          <div className="text-xs uppercase tracking-widest text-[var(--color-text-muted)]">
            Document library
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Documents</h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--color-text-muted)]">
            Store pricing sheets, tier breakdowns, and contracts — one folder per client plus a shared
            F1 Media Team folder, with subfolders to organise inside each. Admin only.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[240px_1fr] items-start">
          {/* Top-level folders */}
          <nav className="space-y-1">
            {scopeFolders.map((f) => {
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
                    <span className="font-mono text-[10px] text-[var(--color-text-subtle)]">{f.count}</span>
                  ) : null}
                </Link>
              );
            })}
          </nav>

          <div className="space-y-5">
            {/* Breadcrumb */}
            <div className="flex flex-wrap items-center gap-1 text-sm">
              <Link href={crumbHref(null)} className={activeDir ? "text-[var(--color-accent)] hover:underline" : "font-medium"}>
                {scopeLabel}
              </Link>
              {trail.map((f, i) => (
                <span key={f.id} className="flex items-center gap-1">
                  <ChevronRight size={14} className="text-[var(--color-text-subtle)]" />
                  <Link
                    href={crumbHref(f.id)}
                    className={i === trail.length - 1 ? "font-medium" : "text-[var(--color-accent)] hover:underline"}
                  >
                    {f.name}
                  </Link>
                </span>
              ))}
            </div>

            <Card>
              <CardBody className="py-5">
                <FolderManager scope={selected} parentId={activeDir} subfolders={subfolders} />

                <div className="mb-3 mt-2 border-t border-[var(--color-border)] pt-4 text-sm font-medium">
                  Add to {trail.length ? trail[trail.length - 1].name : scopeLabel}
                </div>
                <DocumentUpload
                  folderId={selected}
                  dirId={activeDir}
                  folderLabel={trail.length ? trail[trail.length - 1].name : scopeLabel}
                />
              </CardBody>
            </Card>

            <Card>
              <CardBody className="py-5">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {trail.length ? trail[trail.length - 1].name : scopeLabel}
                  </span>
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
