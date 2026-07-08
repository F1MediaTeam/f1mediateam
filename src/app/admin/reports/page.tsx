// Reports page — the F1 Media Deck Studio.
//
// Submit is handled client-side by GenerateReportForm — fetch() to the API
// then a blob-URL download. The admin never leaves this page; the browser
// drops the .pptx (or dry-run .json) into its downloads shelf.

import { requireAdmin } from "@/lib/auth/session";
import { data } from "@/lib/data";
import { getClientBrandLogoUrlsByClients } from "@/lib/client-logo";
import AdminShell from "@/components/admin/Shell";
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

  // Client logos for the deck-preview cover slide. Dark-theme variant first —
  // the cover keeps the studio's dark surface. One batched query for all.
  const logoMap = await getClientBrandLogoUrlsByClients(
    clients.map((c) => ({ id: c.id, company_name: c.company_name })),
  );
  const logos = Object.fromEntries(
    [...logoMap].map(([id, l]) => [id, l.dark ?? l.light ?? null]),
  );

  const aiOk = aiConfigured();

  return (
    <AdminShell session={session} active="/admin/reports">
      <div className="px-6 sm:px-8 py-8 max-w-7xl">
        <div className="mb-7 animate-studio-rise">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--color-accent)]">
            Deck Studio
          </div>
          <h1 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight leading-[1.05]">
            Meeting decks that{" "}
            <span className="bg-gradient-to-r from-[var(--color-accent)] via-emerald-300 to-[var(--color-accent)] bg-clip-text text-transparent">
              write themselves
            </span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-[var(--color-text-muted)] leading-relaxed">
            Pick a client, a time frame, and the Fieldy chats. Export pulls everything connected —
            Search Console, Analytics, SEMrush, Bing, the onboarding profile, Fieldy meeting notes —
            for the Claude app, then Import its JSON to edit and download the .pptx.
          </p>
        </div>

        {!aiOk ? (
          <div className="mb-6 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-200 text-sm px-4 py-3">
            <strong>ANTHROPIC_API_KEY</strong> is not set on this environment. The generator will
            fail until you add it under Vercel → Project Settings → Environment Variables.
          </div>
        ) : null}

        <GenerateReportForm clients={clients} defaultClientId={clientId} logos={logos} />
      </div>
    </AdminShell>
  );
}
