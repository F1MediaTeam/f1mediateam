// Single "Download your submitted onboarding (.pdf)" button. The PDF is
// rendered on-demand by /api/onboarding-pdf — no Supabase storage involved.

import { Card, CardBody, CardHeader } from "@/components/ui";

interface Props {
  /** When false, the user hasn't submitted yet — render the empty hint. */
  hasOnboarding: boolean;
  /** The client's company name, used to label the file when downloading. */
  clientName: string;
  /** ISO submission timestamp for the subtle "Submitted" caption. */
  submittedAt?: string | null;
}

export default function OnboardingDownloadsCard({ hasOnboarding, clientName, submittedAt }: Props) {
  return (
    <Card>
      <CardHeader title="Submitted Onboarding" />
      <CardBody className="space-y-2">
        {!hasOnboarding ? (
          <div className="text-sm text-[var(--color-text-muted)]">
            No onboarding has been submitted yet. Complete the onboarding wizard to download a copy of your answers as a PDF.
          </div>
        ) : (
          <a
            href="/api/onboarding-pdf"
            download={`f1-onboarding-${clientName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.pdf`}
            className="w-full flex items-center justify-between rounded-lg border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 hover:bg-[var(--color-accent)]/20 px-3 py-3 text-sm transition"
          >
            <div className="flex items-center gap-3">
              <div className="text-left">
                <div className="font-medium">Download your onboarding (.pdf)</div>
                {submittedAt ? (
                  <div className="text-[11px] text-[var(--color-text-muted)] font-mono">
                    Submitted {new Date(submittedAt).toLocaleDateString("en-US", { dateStyle: "medium" })}
                  </div>
                ) : null}
              </div>
            </div>
            <span className="text-[11px] uppercase tracking-wider text-[var(--color-accent)]">
              Download
            </span>
          </a>
        )}
      </CardBody>
    </Card>
  );
}
