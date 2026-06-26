// Server-side panel that renders the client's onboarding answers on the
// admin profile page. Pulls every field they filled in (admin accounts,
// website/hosting, Google + Microsoft access, socials, authorization
// preference) and groups them into readable sections. Passwords are masked
// by default — click the eye to reveal in place.

import { data } from "@/lib/data";
import { Card, CardBody, CardHeader, Pill } from "@/components/ui";
import RevealSecret from "./RevealSecret";

interface Props {
  clientId: string;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[180px_1fr] gap-3 py-1.5 border-b border-[var(--color-border)]/60 last:border-b-0">
      <div className="text-[11px] uppercase tracking-wider text-[var(--color-text-muted)] truncate">{label}</div>
      <div className="text-sm text-[var(--color-text)] break-words">{value || <span className="text-[var(--color-text-subtle)]">—</span>}</div>
    </div>
  );
}

function YesNo({ v }: { v?: "yes" | "no" | "" }) {
  if (!v) return <span className="text-[var(--color-text-subtle)]">—</span>;
  return (
    <Pill tone={v === "yes" ? "ok" : "default"}>
      {v === "yes" ? "Yes" : "No"}
    </Pill>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-[var(--color-accent)] mb-2">{title}</div>
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-1">
        {children}
      </div>
    </div>
  );
}

const SOCIAL_LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  x: "X (Twitter)",
  twitter: "X (Twitter)",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  youtube: "YouTube",
  pinterest: "Pinterest",
  reddit: "Reddit",
  threads: "Threads",
};

export default async function ClientOnboardingPanel({ clientId }: Props) {
  const ob = await data.getOnboarding(clientId);

  if (!ob) {
    return (
      <Card>
        <CardHeader title="Onboarding" subtitle="Client account info, access, and preferences" />
        <CardBody>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-4 py-6 text-center">
            <div className="text-sm text-[var(--color-text-muted)]">This client hasn&apos;t submitted onboarding yet.</div>
            <div className="mt-1 text-[11px] text-[var(--color-text-subtle)]">
              The form appears for them the first time they sign in to the portal.
            </div>
          </div>
        </CardBody>
      </Card>
    );
  }

  const d = (ob.data ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
  const yn = (v: unknown) => (v === "yes" || v === "no" ? (v as "yes" | "no") : "");
  const googleAccess = (d.google_access ?? {}) as Record<string, unknown>;
  const microsoftAccess = (d.microsoft_access ?? {}) as Record<string, unknown>;
  const socials = (d.socials ?? {}) as Record<string, { username?: string; admin_email?: string }>;

  function flags(obj: Record<string, unknown>, fields: { key: string; label: string }[]): React.ReactNode {
    const on: string[] = [];
    for (const f of fields) if (obj[f.key]) on.push(f.label);
    if (on.length === 0) return <span className="text-[var(--color-text-subtle)]">none granted</span>;
    return (
      <div className="flex flex-wrap gap-1.5">
        {on.map((label) => (
          <span key={label} className="rounded-full border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 px-2 py-0.5 text-[11px] text-[var(--color-accent)]">{label}</span>
        ))}
      </div>
    );
  }

  const socialEntries = Object.entries(socials).filter(([, v]) => v && (v.username || v.admin_email));

  return (
    <Card>
      <CardHeader
        title="Onboarding"
        subtitle={`Submitted ${new Date(ob.submitted_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })} · Terms ${ob.terms_version}${ob.accepted_terms ? " · accepted" : ""}`}
      />
      <CardBody className="space-y-5">
        <Section title="Primary admin user">
          <Row label="Email" value={str(d.primary_admin_email)} />
          <Row label="Username" value={str(d.primary_admin_username)} />
          <Row label="Password" value={str(d.primary_admin_password) ? <RevealSecret value={str(d.primary_admin_password)} /> : ""} />
          <Row label="Tied to Google" value={<YesNo v={yn(d.primary_tied_to_google)} />} />
          <Row label="Tied to hosting" value={<YesNo v={yn(d.primary_tied_to_hosting)} />} />
        </Section>

        {(d.secondary_admin_email || d.secondary_admin_username || d.secondary_admin_password) ? (
          <Section title="Secondary admin user">
            <Row label="Email" value={str(d.secondary_admin_email)} />
            <Row label="Username" value={str(d.secondary_admin_username)} />
            <Row label="Password" value={str(d.secondary_admin_password) ? <RevealSecret value={str(d.secondary_admin_password)} /> : ""} />
          </Section>
        ) : null}

        <Section title="Website & hosting">
          <Row label="Website URL" value={str(d.website_url) ? <a href={str(d.website_url)} target="_blank" rel="noopener noreferrer" className="text-[var(--color-accent)] hover:underline">{str(d.website_url)}</a> : ""} />
          <Row label="CMS" value={str(d.cms_platform)} />
          <Row label="Hosting provider" value={str(d.hosting_provider)} />
          <Row label="Domain registrar" value={str(d.domain_registrar)} />
          <Row label="Website admin email" value={str(d.website_admin_email)} />
          <Row label="Website username" value={str(d.website_username)} />
          <Row label="Website password" value={str(d.website_password) ? <RevealSecret value={str(d.website_password)} /> : ""} />
          <Row label="Developer contact" value={str(d.developer_contact)} />
        </Section>

        <Section title="Google access">
          <Row label="Admin email" value={str(d.google_admin_email)} />
          <Row
            label="Granted"
            value={flags(googleAccess, [
              { key: "analytics", label: "Analytics" },
              { key: "search_console", label: "Search Console" },
              { key: "business_profile", label: "Business Profile" },
              { key: "ads", label: "Google Ads" },
              { key: "tag_manager", label: "Tag Manager" },
            ])}
          />
          {str(googleAccess.other) ? <Row label="Other" value={str(googleAccess.other)} /> : null}
        </Section>

        <Section title="Microsoft access">
          <Row label="Admin email" value={str(d.microsoft_admin_email)} />
          <Row
            label="Granted"
            value={flags(microsoftAccess, [
              { key: "bing_webmaster", label: "Bing Webmaster" },
              { key: "ads", label: "Microsoft Ads" },
            ])}
          />
          {str(microsoftAccess.other) ? <Row label="Other" value={str(microsoftAccess.other)} /> : null}
        </Section>

        {socialEntries.length > 0 ? (
          <Section title="Social accounts">
            {socialEntries.map(([platform, v]) => (
              <Row
                key={platform}
                label={SOCIAL_LABELS[platform.toLowerCase()] ?? platform}
                value={
                  <div className="flex flex-col gap-0.5">
                    {v.username ? <div className="font-mono text-xs">@{v.username}</div> : null}
                    {v.admin_email ? <div className="text-[11px] text-[var(--color-text-muted)]">{v.admin_email}</div> : null}
                  </div>
                }
              />
            ))}
          </Section>
        ) : null}

        <Section title="Authorization preference">
          <Row label="Approach" value={str(d.authorization_preference).replace(/_/g, " ") || ""} />
          {str(d.authorization_other) ? <Row label="Notes" value={str(d.authorization_other)} /> : null}
        </Section>
      </CardBody>
    </Card>
  );
}
