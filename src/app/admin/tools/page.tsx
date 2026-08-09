import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";
import AdminShell from "@/components/admin/Shell";
import { Card, CardBody, CardHeader } from "@/components/ui";
import HtmlTools from "@/components/admin/HtmlTools";
import UtmBuilder from "@/components/admin/UtmBuilder";
import SerpPreview from "@/components/admin/SerpPreview";
import RedirectChecker from "@/components/admin/RedirectChecker";
import PageSpeedCheck from "@/components/admin/PageSpeedCheck";

export default async function AdminTools() {
  const session = await requireAdmin();
  // Only needed so a run can be filed against a client.
  const clients = await data.listClients();

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
              title="Page speed &amp; Core Web Vitals"
              subtitle="Check any URL — load times, page weight, and the specific files slowing it down"
            />
            <CardBody>
              <PageSpeedCheck clients={clients.map((c) => ({ id: c.id, company_name: c.company_name }))} />
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
              title="HTML previewer &amp; editor"
              subtitle="Paste HTML on the left and edit the live preview directly — text, colours, fonts, links, and images all write back to the code"
            />
            <CardBody className="space-y-4">
              <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-4 py-3 text-[13px] leading-relaxed text-[var(--color-text-muted)]">
                The <strong className="font-medium text-[var(--color-text)]">Blocks</strong> tab
                holds drag-and-drop sections in the same four categories as{" "}
                <a
                  href="https://reactbits.dev/llms.txt"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[var(--color-accent)] underline underline-offset-2 hover:opacity-80"
                >
                  reactbits.dev
                </a>{" "}
                — but as self-contained HTML + CSS, so they keep working in the downloaded file.
                ReactBits itself ships JSX built on GSAP, Framer Motion, and three.js, which needs a
                React build step and can&apos;t run in a static page.
              </p>
              <HtmlTools />
            </CardBody>
          </Card>
        </div>
      </div>
    </AdminShell>
  );
}
