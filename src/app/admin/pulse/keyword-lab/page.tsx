import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import AdminShell from "@/components/admin/Shell";
import PulseHeader from "@/components/admin/pulse/PulseHeader";
import KeywordLab from "@/components/admin/pulse/KeywordLab";
import { loadProfiles } from "./store";

export const dynamic = "force-dynamic";

export default async function KeywordLabPage() {
  const session = await requireAdmin();
  const profiles = await loadProfiles();

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
        <KeywordLab initialProfiles={profiles} />
      </div>
    </AdminShell>
  );
}
