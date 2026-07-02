// Reports page — F1 Media monthly .pptx generator.
//
// Submit is handled client-side by GenerateReportForm — fetch() to the API
// then a blob-URL download. The admin never leaves this page; the browser
// drops the .pptx (or dry-run .json) into its downloads shelf.

import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";
import AdminShell from "@/components/admin/Shell";
import { Card, CardBody, CardHeader } from "@/components/ui";
import { aiConfigured } from "@/lib/deck/ai-narrative";
import GenerateReportForm from "@/components/admin/GenerateReportForm";

export default async function AdminReports({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const session = await requireAdmin();
  const sp = await searchParams;
  const clients = await data.listClients();
  const clientId = sp.client ?? clients[0]?.id ?? "";

  const aiOk = aiConfigured();

  return (
    <AdminShell session={session} active="/admin/reports">
      <div className="px-8 py-8 max-w-7xl">
        <div className="mb-8">
          <div className="text-xs uppercase tracking-widest text-[var(--color-text-muted)]">Reports</div>
          <h1 className="text-3xl font-semibold tracking-tight mt-1">Client meeting decks</h1>
        </div>

        {!aiOk ? (
          <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-200 text-sm px-4 py-3">
            <strong>ANTHROPIC_API_KEY</strong> is not set on this environment. The .pptx generator will fail until you add it under Vercel → Project Settings → Environment Variables.
          </div>
        ) : null}

        <Card className="mb-8">
          <CardHeader
            title="Generate a client deck"
            subtitle="Pick a company and meeting type — Claude builds meeting-ready slides from everything connected: Search Console, Analytics, SEMrush, Bing, onboarding, Fieldy meeting notes, and the content board. Preview, edit, then generate."
          />
          <CardBody>
            <GenerateReportForm
              clients={clients}
              defaultClientId={clientId}
            />
          </CardBody>
        </Card>
      </div>
    </AdminShell>
  );
}
