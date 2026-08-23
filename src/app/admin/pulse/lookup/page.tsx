// Domain Lookup — measure any domain, without permission and without cost.
//
// The thing a sales conversation actually needs: a prospect's domain typed in,
// and a page of findings you can walk them through before you have any access
// to their analytics. Works equally on a competitor.
//
// Nothing is stored. Somebody typing a domain here should not create a record
// for a company that has not agreed to anything.

import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import AdminShell from "@/components/admin/Shell";
import PulseHeader from "@/components/admin/pulse/PulseHeader";
import DomainLookup from "@/components/admin/pulse/DomainLookup";

export const dynamic = "force-dynamic";

export default async function PulseLookupPage() {
  const session = await requireAdmin();

  return (
    <AdminShell session={session} active="/admin/pulse">
      <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6 lg:px-8 sm:py-8">
        <PulseHeader
          subtitle="Measure any domain — a prospect, a competitor, or a client. Free, and nothing is saved."
          crumb={
            <div className="mb-1">
              <Link
                href="/admin/pulse"
                className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              >
                ← All sites
              </Link>
            </div>
          }
        />
        <DomainLookup />
      </div>
    </AdminShell>
  );
}
