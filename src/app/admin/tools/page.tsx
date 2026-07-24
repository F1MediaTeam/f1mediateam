import { requireAdmin } from "@/lib/auth/session";
import AdminShell from "@/components/admin/Shell";
import { Card, CardBody, CardHeader } from "@/components/ui";
import HtmlTools from "@/components/admin/HtmlTools";
import UtmBuilder from "@/components/admin/UtmBuilder";
import SerpPreview from "@/components/admin/SerpPreview";
import RedirectChecker from "@/components/admin/RedirectChecker";

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

        <div className="space-y-6">
          <Card>
            <CardHeader
              title="UTM link builder"
              subtitle="Build a tagged tracking link for campaigns, social, and email"
            />
            <CardBody>
              <UtmBuilder />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="SERP snippet preview"
              subtitle="See how a title and meta description render in Google, with length warnings"
            />
            <CardBody>
              <SerpPreview />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Redirect &amp; status checker"
              subtitle="Follow a URL's redirect chain and see the status code at each hop"
            />
            <CardBody>
              <RedirectChecker />
            </CardBody>
          </Card>

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
      </div>
    </AdminShell>
  );
}
