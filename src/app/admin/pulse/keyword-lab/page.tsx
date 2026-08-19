import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import AdminShell from "@/components/admin/Shell";
import PulseHeader from "@/components/admin/pulse/PulseHeader";
import KeywordLab from "@/components/admin/pulse/KeywordLab";
import { loadProfiles } from "./store";
import { spendSummary, ESTIMATED_COST } from "@/lib/pulse/keyword-lab";

export const dynamic = "force-dynamic";

export default async function KeywordLabPage() {
  const session = await requireAdmin();
  const [profiles, spend] = await Promise.all([loadProfiles(), spendSummary()]);

  return (
    <AdminShell session={session} active="/admin/pulse">
      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 sm:py-8">
        <PulseHeader
          crumb={
            <div className="mb-1">
              <Link href="/admin/pulse" className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
                ← All sites
              </Link>
            </div>
          }
        />
        <KeywordLab initialProfiles={profiles} spend={spend} costs={ESTIMATED_COST} />
      </div>
    </AdminShell>
  );
}
