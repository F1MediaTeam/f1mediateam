import { requireAdmin } from "@/lib/auth/session";
import AdminShell from "@/components/admin/Shell";
import { Card, CardBody, CardHeader } from "@/components/ui";
import HtmlTools from "@/components/admin/HtmlTools";

export default async function AdminTools() {
  const session = await requireAdmin();

  return (
    <AdminShell session={session} active="/admin/tools">
      <div className="px-8 py-8 max-w-6xl">
        <div className="mb-8">
          <div className="text-xs uppercase tracking-widest text-[var(--color-text-muted)]">
            Admin
          </div>
          <h1 className="text-3xl font-semibold tracking-tight mt-1">Tools</h1>
        </div>

        <Card>
          <CardHeader
            title="HTML previewer &amp; downloader"
            subtitle="Paste or upload HTML, preview it live, and download it as a .html file"
          />
          <CardBody>
            <HtmlTools />
          </CardBody>
        </Card>
      </div>
    </AdminShell>
  );
}
