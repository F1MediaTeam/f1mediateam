// Keyword Lab — find searches worth targeting, then assign them to a client.
//
// Two halves. Discovery expands a phrase into every search Google will suggest
// around it, which is where new keywords come from. Below it, the existing lab
// shows what is already tracked per client.
//
// Neither half shows search volume. That number comes from an index built by
// scraping results for years, no free copy exists, and a plausible invention in
// that column would be planned around by somebody who trusted it.

import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import AdminShell from "@/components/admin/Shell";
import PulseHeader from "@/components/admin/pulse/PulseHeader";
import KeywordLab from "@/components/admin/pulse/KeywordLab";
import KeywordDiscovery from "@/components/admin/pulse/KeywordDiscovery";
import { loadProfiles } from "./store";
import { listSitesAction } from "./discover";

export const dynamic = "force-dynamic";

export default async function KeywordLabPage() {
  const session = await requireAdmin();
  const [profiles, sites] = await Promise.all([loadProfiles(), listSitesAction()]);

  return (
    <AdminShell session={session} active="/admin/pulse">
      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 sm:py-8">
        <PulseHeader
          subtitle="Find searches worth targeting, then assign them to a client."
          crumb={
            <div className="mb-1">
              <Link href="/admin/pulse" className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
                ← All sites
              </Link>
            </div>
          }
        />

        <div
          data-panel=""
          className="mb-8 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4"
        >
          <h2 className="mb-1 text-sm font-semibold">Discover keywords</h2>
          <p className="mb-4 text-xs leading-relaxed text-[var(--color-text-muted)]">
            Enter something a client sells. This asks Google&rsquo;s own autocomplete about the phrase,
            the phrase followed by each letter of the alphabet, and the usual question and buying
            prefixes — roughly three hundred real searches from one seed. Pick the ones worth having
            and send them to a client, with the page that should rank for them.
          </p>
          <KeywordDiscovery sites={sites} />
        </div>

        <KeywordLab initialProfiles={profiles} />
      </div>
    </AdminShell>
  );
}
