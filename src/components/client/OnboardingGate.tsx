"use client";

// 6-page onboarding wizard. One page per F1 Media onboarding doc. The user
// completes a page, clicks Next, and so on. Page 6 has the Terms of Service
// + Privacy Policy checkbox and the final Submit. On submit, the server
// persists the answers, renders a PDF, and saves it to the client's files.

import { useState, useTransition } from "react";
import { submitOnboardingAction } from "@/app/client/actions";
import type { OnboardingData } from "@/lib/types";

interface Props {
  version: string;
  userName: string;
}

// ---------- shared field primitives ----------

const inputClass =
  "w-full rounded-lg border border-black/15 bg-[#F5F7FA] text-black px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/20 focus:bg-white";
const labelClass = "block text-[10px] uppercase tracking-widest text-black/55 mb-1.5 font-semibold";

function Field({
  label, value, onChange, type = "text", placeholder,
}: {
  label: string; value: string;
  onChange: (v: string) => void;
  type?: string; placeholder?: string;
}) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
    </label>
  );
}

function Area({
  label, value, onChange, placeholder, rows = 3,
}: {
  label: string; value: string;
  onChange: (v: string) => void;
  placeholder?: string; rows?: number;
}) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <textarea
        value={value}
        placeholder={placeholder}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
    </label>
  );
}

function YesNo({ label, value, onChange }: { label: string; value: "yes" | "no" | ""; onChange: (v: "yes" | "no" | "") => void }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm py-1.5">
      <span className="text-black/85">{label}</span>
      <div className="flex gap-1.5">
        {(["yes", "no"] as const).map((v) => (
          <button
            type="button"
            key={v}
            onClick={() => onChange(value === v ? "" : v)}
            className={"px-3 py-1 rounded-md text-xs border " + (value === v ? "border-black bg-black text-white" : "border-black/30 text-black/60 hover:border-black/60")}
          >
            {v.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <div className="text-[10px] uppercase tracking-widest text-[#3F8E84] font-bold mb-2">{title}</div>
      <div className="rounded-xl border border-black/10 bg-white p-5 space-y-4">{children}</div>
    </div>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-relaxed text-black/85 mb-3">{children}</p>;
}
function UL({ items }: { items: string[] }) {
  return (
    <ul className="list-disc pl-6 space-y-1 text-sm text-black/85 mb-4">
      {items.map((it, i) => <li key={i}>{it}</li>)}
    </ul>
  );
}

// ---------- main ----------

const AUTH_OPTIONS: { value: NonNullable<OnboardingData["authorization_preference"]>; label: string }[] = [
  { value: "direct_credentials", label: "Direct credential sharing" },
  { value: "temporary_password", label: "Temporary password sharing" },
  { value: "admin_invite",       label: "Administrative invite to F1 Media Team" },
  { value: "dedicated_email",    label: "Dedicated marketing email creation" },
  { value: "other",              label: "Other" },
];

const PAGES = [
  "Account Access",
  "Company Bio",
  "Contacts",
  "Growth Strategy",
  "Services & Locations",
  "Brand Assets & Terms",
] as const;

export default function OnboardingGate({ version, userName }: Props) {
  const [pending, start] = useTransition();
  const [page, setPage] = useState(0);
  const [data, setData] = useState<OnboardingData>({
    google_access: {}, microsoft_access: {}, socials: {},
    contacts: [{}], services: [{}], service_locations: [{}],
  });
  const [accepted, setAccepted] = useState(false);
  const [files, setFiles] = useState<File[]>([]);

  const set = <K extends keyof OnboardingData>(k: K, v: OnboardingData[K]) =>
    setData((d) => ({ ...d, [k]: v }));
  const setGoogleAccess = (k: string, v: boolean) =>
    setData((d) => ({ ...d, google_access: { ...(d.google_access ?? {}), [k]: v } }));
  const setMsftAccess = (k: string, v: boolean) =>
    setData((d) => ({ ...d, microsoft_access: { ...(d.microsoft_access ?? {}), [k]: v } }));

  function updateRow<T>(key: "contacts" | "services" | "service_locations", index: number, patch: Partial<T>) {
    setData((d) => {
      const arr = ([...((d[key] ?? []) as T[])]);
      arr[index] = { ...(arr[index] ?? {}), ...patch };
      return { ...d, [key]: arr };
    });
  }
  function addRow(key: "contacts" | "services" | "service_locations") {
    setData((d) => ({ ...d, [key]: [...((d[key] ?? []) as object[]), {}] }));
  }
  function removeRow(key: "contacts" | "services" | "service_locations", index: number) {
    setData((d) => {
      const arr = ([...((d[key] ?? []) as object[])]);
      arr.splice(index, 1);
      return { ...d, [key]: arr.length ? arr : [{}] };
    });
  }

  function submit() {
    if (!accepted) return;
    // Stamp the uploaded asset filenames into the data blob so the PDF can
    // list them on the final section.
    const enriched: OnboardingData = {
      ...data,
      uploaded_asset_filenames: files.map((f) => f.name),
    };
    const fd = new FormData();
    fd.set("data", JSON.stringify(enriched));
    fd.set("accepted_terms", "on");
    for (const f of files) fd.append("brand_assets", f);
    start(async () => { await submitOnboardingAction(fd); });
  }

  function next() {
    if (page < PAGES.length - 1) {
      setPage(page + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }
  function back() {
    if (page > 0) {
      setPage(page - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  // ---------- page renderers ----------

  function PageHeader({ idx, title }: { idx: number; title: string }) {
    return (
      <div className="px-10 pt-10 pb-6 text-center border-b border-black/10">
        <div className="text-[10px] uppercase tracking-[0.25em] font-mono text-black/45 mb-2">Section {idx + 1} of {PAGES.length}</div>
        <h1 className="text-3xl font-bold tracking-tight text-black">{title}</h1>
      </div>
    );
  }

  function ProgressDots() {
    return (
      <div className="flex justify-center gap-1.5 mt-2">
        {PAGES.map((_, i) => (
          <span key={i} className={"h-1.5 rounded-full transition-all " + (i === page ? "w-8 bg-[#3F8E84]" : i < page ? "w-4 bg-[#3F8E84]/60" : "w-4 bg-black/15")} />
        ))}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-start justify-center px-4 py-6 overflow-y-auto">
      <div className="w-full max-w-5xl my-4 rounded-2xl shadow-[0_30px_80px_-10px_rgba(0,0,0,0.6)] overflow-hidden border border-white/10 bg-white">
        {/* Branded header bar */}
        <div className="relative px-7 py-5 flex items-center justify-between border-b border-black/10" style={{ background: "radial-gradient(120% 200% at 50% -20%, #e2e2e2 0%, #b4b4b4 60%, #8c8c8c 100%)" }}>
          <div role="img" aria-label="F1 Media Team" className="bg-no-repeat bg-center" style={{ height: 56, width: 200, backgroundImage: "url(/logo-dark.png)", backgroundSize: "220px auto" }} />
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.25em] text-black/55 font-mono">Onboarding</div>
            <div className="text-sm font-semibold text-black mt-0.5">Welcome, {userName}</div>
            <ProgressDots />
          </div>
        </div>

        <div className="bg-white text-black">
          {/* ============== PAGE 1 — ACCOUNT ACCESS ============== */}
          {page === 0 ? (
            <>
              <PageHeader idx={0} title="Digital Account Access & Administrative Permissions" />
              <div className="px-10 py-8">
                <P>To properly optimize, monitor, and manage your digital presence, F1 Media Team requires visibility into the email accounts and administrative access connected to your website, search platforms, and social media properties.</P>
                <UL items={["Proper SEO configuration", "Accurate analytics tracking", "Search engine indexing", "Profile verification", "Campaign management", "Platform compliance", "Security continuity"]} />
                <P>We recommend a dedicated marketing email (e.g. <strong>seo@yourcompany.com</strong> or <strong>marketing@yourcompany.com</strong>) that holds administrative access to all platforms and stays with the company through staff changes.</P>

                <Section title="Primary administrative user">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Field label="Email" value={data.primary_admin_email ?? ""} onChange={(v) => set("primary_admin_email", v)} type="email" />
                    <Field label="Username" value={data.primary_admin_username ?? ""} onChange={(v) => set("primary_admin_username", v)} />
                    <Field label="Password" value={data.primary_admin_password ?? ""} onChange={(v) => set("primary_admin_password", v)} type="password" />
                  </div>
                  <YesNo label="Is this email tied to Google services?" value={(data.primary_tied_to_google ?? "") as "yes" | "no" | ""} onChange={(v) => set("primary_tied_to_google", v)} />
                  <YesNo label="Is this email tied to website hosting?" value={(data.primary_tied_to_hosting ?? "") as "yes" | "no" | ""} onChange={(v) => set("primary_tied_to_hosting", v)} />
                </Section>

                <Section title="Secondary administrative user (optional)">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Field label="Email" value={data.secondary_admin_email ?? ""} onChange={(v) => set("secondary_admin_email", v)} type="email" />
                    <Field label="Username" value={data.secondary_admin_username ?? ""} onChange={(v) => set("secondary_admin_username", v)} />
                    <Field label="Password" value={data.secondary_admin_password ?? ""} onChange={(v) => set("secondary_admin_password", v)} type="password" />
                  </div>
                </Section>

                <Section title="Website & hosting access">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Field label="Website URL" value={data.website_url ?? ""} onChange={(v) => set("website_url", v)} placeholder="https://" />
                    <Field label="CMS platform" value={data.cms_platform ?? ""} onChange={(v) => set("cms_platform", v)} placeholder="WordPress, Webflow, custom…" />
                    <Field label="Hosting provider" value={data.hosting_provider ?? ""} onChange={(v) => set("hosting_provider", v)} />
                    <Field label="Domain registrar" value={data.domain_registrar ?? ""} onChange={(v) => set("domain_registrar", v)} />
                    <Field label="Website admin email" value={data.website_admin_email ?? ""} onChange={(v) => set("website_admin_email", v)} type="email" />
                    <Field label="Website username" value={data.website_username ?? ""} onChange={(v) => set("website_username", v)} />
                    <Field label="Website password" value={data.website_password ?? ""} onChange={(v) => set("website_password", v)} type="password" />
                    <Field label="Developer contact (if applicable)" value={data.developer_contact ?? ""} onChange={(v) => set("developer_contact", v)} />
                  </div>
                </Section>

                <Section title="Google access">
                  <Field label="Google admin email" value={data.google_admin_email ?? ""} onChange={(v) => set("google_admin_email", v)} type="email" />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                    {[
                      { k: "analytics", l: "Google Analytics" },
                      { k: "search_console", l: "Google Search Console" },
                      { k: "business_profile", l: "Google Business Profile" },
                      { k: "ads", l: "Google Ads" },
                      { k: "tag_manager", l: "Google Tag Manager" },
                    ].map(({ k, l }) => (
                      <label key={k} className="flex items-center gap-2 text-sm py-1">
                        <input type="checkbox" checked={Boolean((data.google_access ?? {})[k as keyof NonNullable<typeof data.google_access>])} onChange={(e) => setGoogleAccess(k, e.target.checked)} className="h-4 w-4 accent-black" />
                        <span>{l}</span>
                      </label>
                    ))}
                  </div>
                </Section>

                <Section title="Microsoft access">
                  <Field label="Microsoft admin email" value={data.microsoft_admin_email ?? ""} onChange={(v) => set("microsoft_admin_email", v)} type="email" />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                    {[
                      { k: "bing_webmaster", l: "Bing Webmaster Tools" },
                      { k: "ads", l: "Microsoft Ads" },
                    ].map(({ k, l }) => (
                      <label key={k} className="flex items-center gap-2 text-sm py-1">
                        <input type="checkbox" checked={Boolean((data.microsoft_access ?? {})[k as keyof NonNullable<typeof data.microsoft_access>])} onChange={(e) => setMsftAccess(k, e.target.checked)} className="h-4 w-4 accent-black" />
                        <span>{l}</span>
                      </label>
                    ))}
                  </div>
                </Section>

                <Section title="Authorization preference">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {AUTH_OPTIONS.map((o) => (
                      <label key={o.value} className="flex items-center gap-2 text-sm py-1">
                        <input type="radio" name="auth_pref" checked={data.authorization_preference === o.value} onChange={() => set("authorization_preference", o.value)} className="h-4 w-4 accent-black" />
                        <span>{o.label}</span>
                      </label>
                    ))}
                  </div>
                  {data.authorization_preference === "other" ? (
                    <Area label="Tell us more" value={data.authorization_other ?? ""} onChange={(v) => set("authorization_other", v)} rows={2} />
                  ) : null}
                </Section>
              </div>
            </>
          ) : null}

          {/* ============== PAGE 2 — COMPANY BIO & PERFORMANCE ============== */}
          {page === 1 ? (
            <>
              <PageHeader idx={1} title="Company Bio & Performance Insights" />
              <div className="px-10 py-8">
                <P>To position your firm and align messaging, we need a comprehensive view of your company's identity, voice, history, and past marketing performance.</P>
                <Section title="Official company bio">
                  <Area label="Founding story, mission, focus, what differentiates you, notable achievements, community involvement, target clientele." value={data.company_bio ?? ""} onChange={(v) => set("company_bio", v)} rows={8} />
                </Section>
                <Section title="Two strategic brand questions">
                  <Area label="What makes your firm different from other firms in your market?" value={data.brand_diff ?? ""} onChange={(v) => set("brand_diff", v)} rows={4} />
                  <Area label="If a client had to describe your firm in three words, what would they say and why?" value={data.brand_3words ?? ""} onChange={(v) => set("brand_3words", v)} rows={4} />
                </Section>
                <Section title="Where have you seen the most success?">
                  <Field label="Social media — platforms used" value={data.perf_social_used ?? ""} onChange={(v) => set("perf_social_used", v)} />
                  <Area label="Social media — explanation" value={data.perf_social_explanation ?? ""} onChange={(v) => set("perf_social_explanation", v)} />
                  <Field label="Website URL(s)" value={data.perf_website_url ?? ""} onChange={(v) => set("perf_website_url", v)} />
                  <Area label="Website — explanation" value={data.perf_website_explanation ?? ""} onChange={(v) => set("perf_website_explanation", v)} />
                  <Field label="Paid advertising — platforms (Google Ads, Meta, etc.)" value={data.perf_paid_platforms ?? ""} onChange={(v) => set("perf_paid_platforms", v)} />
                  <Area label="Paid ads — explanation" value={data.perf_paid_explanation ?? ""} onChange={(v) => set("perf_paid_explanation", v)} />
                  <Field label="Podcast — name / platform" value={data.perf_podcast_name ?? ""} onChange={(v) => set("perf_podcast_name", v)} />
                  <Area label="Podcast — explanation" value={data.perf_podcast_explanation ?? ""} onChange={(v) => set("perf_podcast_explanation", v)} />
                  <Field label="YouTube" value={data.perf_youtube ?? ""} onChange={(v) => set("perf_youtube", v)} />
                  <Area label="YouTube — explanation" value={data.perf_youtube_explanation ?? ""} onChange={(v) => set("perf_youtube_explanation", v)} />
                  <Area label="SEO — explanation" value={data.perf_seo_explanation ?? ""} onChange={(v) => set("perf_seo_explanation", v)} />
                  <Area label="Referrals — explanation" value={data.perf_referrals_explanation ?? ""} onChange={(v) => set("perf_referrals_explanation", v)} />
                  <Area label="What hasn't worked or is underperforming?" value={data.perf_underperforming ?? ""} onChange={(v) => set("perf_underperforming", v)} rows={4} />
                </Section>
              </div>
            </>
          ) : null}

          {/* ============== PAGE 3 — CONTACTS ============== */}
          {page === 2 ? (
            <>
              <PageHeader idx={2} title="Primary Contact & Communication Directory" />
              <div className="px-10 py-8">
                <P>List who handles approvals, billing, technical access, and emergencies. Add a row per person. Clear structure = faster execution, fewer delays.</P>
                <Section title="Authorized contacts">
                  {(data.contacts ?? []).map((c, i) => (
                    <div key={i} className="rounded-xl border border-black/10 bg-[#FAFAFA] p-4 space-y-3 relative">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <Field label="Full name" value={c.name ?? ""} onChange={(v) => updateRow("contacts", i, { name: v })} />
                        <Field label="Direct email" value={c.email ?? ""} onChange={(v) => updateRow("contacts", i, { email: v })} type="email" />
                        <Field label="Phone" value={c.phone ?? ""} onChange={(v) => updateRow("contacts", i, { phone: v })} />
                        <Field label="Role & notes" value={c.role ?? ""} onChange={(v) => updateRow("contacts", i, { role: v })} placeholder="e.g. Managing Attorney — Final Approvals" />
                      </div>
                      {(data.contacts ?? []).length > 1 ? (
                        <button type="button" onClick={() => removeRow("contacts", i)} className="absolute top-2 right-3 text-[11px] text-black/50 hover:text-red-600">Remove</button>
                      ) : null}
                    </div>
                  ))}
                  <button type="button" onClick={() => addRow("contacts")} className="text-sm font-semibold text-[#3F8E84] hover:underline">+ Add another contact</button>
                </Section>
              </div>
            </>
          ) : null}

          {/* ============== PAGE 4 — GROWTH STRATEGY (informational) ============== */}
          {page === 3 ? (
            <>
              <PageHeader idx={3} title="Digital Authority & Growth Strategy" />
              <div className="px-10 py-8 space-y-6">
                <P><strong>Rank Higher. Get Found. Stay Competitive.</strong></P>
                <P>Our approach is strategic, structured, and performance-driven — designed to expand visibility, attract qualified leads, strengthen brand credibility, and establish long-term competitive advantage.</P>
                <Section title="1. Authority & Visibility Foundation">
                  <UL items={["Brand standardization, messaging, voice, bio, visual identity", "Technical SEO audit, site speed, mobile, conversion flow, schema"]} />
                </Section>
                <Section title="2. Search Engine Domination (SEO)">
                  <UL items={["On-page: keyword mapping, service pages, location pages, content clusters", "Local SEO: GBP, Bing, NAP consistency, citations, map pack", "Technical: indexing, sitemaps, Core Web Vitals, backlink auditing", "Authority: strategic backlink acquisition, guest placements, press"]} />
                </Section>
                <Section title="3. Content & Media Engine">
                  <UL items={["Written: blog, FAQ, pillar pages, conversion copy", "Video: short-form, YouTube SEO, embedded ranking support", "Visual: branded graphics, social templates, ad creatives, infographics"]} />
                </Section>
                <Section title="4. Social Media Ecosystem">
                  <UL items={["Platforms tuned for search visibility + brand positioning", "Consistent posting cadence + AI-referenceable structured content"]} />
                </Section>
                <Section title="5. Performance Tracking & Reporting">
                  <UL items={["Monthly reports with real GSC / GA4 / Bing / SEMrush data", "Strategy reviews tied to deliverables and outcomes"]} />
                </Section>
                <P>This section is informational. No fields to complete — click Next to continue.</P>
              </div>
            </>
          ) : null}

          {/* ============== PAGE 5 — SERVICES & LOCATIONS ============== */}
          {page === 4 ? (
            <>
              <PageHeader idx={4} title="List of Services & Service Locations" />
              <div className="px-10 py-8">
                <P>Search engine performance is tied to clarity. Define what services you offer and where, so we can build optimized service pages, local landing pages, and ranking campaigns.</P>

                <Section title="Services">
                  {(data.services ?? []).map((s, i) => (
                    <div key={i} className="rounded-xl border border-black/10 bg-[#FAFAFA] p-4 space-y-3 relative">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <Field label="Service name" value={s.name ?? ""} onChange={(v) => updateRow("services", i, { name: v })} />
                        <Field label="Audience" value={s.audience ?? ""} onChange={(v) => updateRow("services", i, { audience: v })} />
                      </div>
                      <Area label="Brief description" value={s.description ?? ""} onChange={(v) => updateRow("services", i, { description: v })} rows={2} />
                      <div>
                        <span className={labelClass}>Priority</span>
                        <div className="flex gap-2">
                          {(["high", "medium", "low"] as const).map((p) => (
                            <button key={p} type="button" onClick={() => updateRow("services", i, { priority: s.priority === p ? "" : p })}
                              className={"px-3 py-1 rounded-md text-xs border " + (s.priority === p ? "border-black bg-black text-white" : "border-black/30 text-black/60 hover:border-black/60")}>{p.toUpperCase()}</button>
                          ))}
                        </div>
                      </div>
                      {(data.services ?? []).length > 1 ? (
                        <button type="button" onClick={() => removeRow("services", i)} className="absolute top-2 right-3 text-[11px] text-black/50 hover:text-red-600">Remove</button>
                      ) : null}
                    </div>
                  ))}
                  <button type="button" onClick={() => addRow("services")} className="text-sm font-semibold text-[#3F8E84] hover:underline">+ Add another service</button>
                </Section>

                <Section title="Geographic service areas">
                  {(data.service_locations ?? []).map((l, i) => (
                    <div key={i} className="rounded-xl border border-black/10 bg-[#FAFAFA] p-4 space-y-3 relative">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <Field label="City / area" value={l.city ?? ""} onChange={(v) => updateRow("service_locations", i, { city: v })} />
                        <Field label="Notes" value={l.notes ?? ""} onChange={(v) => updateRow("service_locations", i, { notes: v })} />
                      </div>
                      <YesNo label="Physical office at this location?" value={(l.has_office ?? "") as "yes" | "no" | ""} onChange={(v) => updateRow("service_locations", i, { has_office: v })} />
                      <div>
                        <span className={labelClass}>Priority</span>
                        <div className="flex gap-2">
                          {(["high", "medium", "low"] as const).map((p) => (
                            <button key={p} type="button" onClick={() => updateRow("service_locations", i, { priority: l.priority === p ? "" : p })}
                              className={"px-3 py-1 rounded-md text-xs border " + (l.priority === p ? "border-black bg-black text-white" : "border-black/30 text-black/60 hover:border-black/60")}>{p.toUpperCase()}</button>
                          ))}
                        </div>
                      </div>
                      {(data.service_locations ?? []).length > 1 ? (
                        <button type="button" onClick={() => removeRow("service_locations", i)} className="absolute top-2 right-3 text-[11px] text-black/50 hover:text-red-600">Remove</button>
                      ) : null}
                    </div>
                  ))}
                  <button type="button" onClick={() => addRow("service_locations")} className="text-sm font-semibold text-[#3F8E84] hover:underline">+ Add another location</button>
                </Section>

                <Section title="Market focus">
                  <Area label="Are you targeting one main city or multiple equally?" value={data.market_focus_main_city ?? ""} onChange={(v) => set("market_focus_main_city", v)} rows={2} />
                  <Area label="Are you competing against large firms or local competitors?" value={data.market_focus_competition ?? ""} onChange={(v) => set("market_focus_competition", v)} rows={2} />
                  <Area label="Cities you want to dominate first" value={data.market_focus_priority_cities ?? ""} onChange={(v) => set("market_focus_priority_cities", v)} rows={2} />
                  <Area label="Markets to avoid" value={data.market_focus_avoid ?? ""} onChange={(v) => set("market_focus_avoid", v)} rows={2} />
                </Section>
              </div>
            </>
          ) : null}

          {/* ============== PAGE 6 — BRAND ASSETS + TERMS ============== */}
          {page === 5 ? (
            <>
              <PageHeader idx={5} title="Brand Assets & Media Files" />
              <div className="px-10 py-8">
                <P>Drop your logo files, brand assets, and raw photos here. Editable vector files (.AI, .EPS, .SVG, editable .PDF) are highest priority. High-res PNG and JPG also welcome. We use these for websites, ads, video overlays, social, and print without quality loss.</P>

                <Section title="Brand guidelines">
                  <Field label="Brand color (HEX, RGB, or CMYK)" value={data.brand_color_hex ?? ""} onChange={(v) => set("brand_color_hex", v)} placeholder="#0F172A or 15, 23, 42" />
                  <Field label="Typography / fonts" value={data.brand_fonts ?? ""} onChange={(v) => set("brand_fonts", v)} placeholder="DM Sans, Cormorant Garamond, etc." />
                  <Area label="Notes — usage rules, spacing, tone of voice" value={data.brand_guidelines_notes ?? ""} onChange={(v) => set("brand_guidelines_notes", v)} rows={4} />
                </Section>

                <Section title="Upload files">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => document.getElementById("brand-assets-input")?.click()}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") document.getElementById("brand-assets-input")?.click(); }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.length) setFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files)]); }}
                    className="cursor-pointer rounded-xl border-2 border-dashed border-black/25 bg-[#F8FAFC] hover:bg-white px-6 py-10 text-center transition"
                  >
                    <div className="text-sm font-semibold text-black">Drop your logos, brand assets, or photos here</div>
                    <div className="mt-1 text-[11px] text-black/60">or click to browse · .AI / .EPS / .SVG / .PDF / .PNG / .JPG / raw photos</div>
                    <input id="brand-assets-input" type="file" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) setFiles((prev) => [...prev, ...Array.from(e.target.files!)]); }} />
                  </div>
                  {files.length > 0 ? (
                    <ul className="mt-3 space-y-1.5">
                      {files.map((f, i) => (
                        <li key={i} className="flex items-center justify-between rounded-lg border border-black/10 bg-white px-3 py-2 text-xs">
                          <span>📄 {f.name}</span>
                          <span className="font-mono text-[10px] text-black/50">{(f.size / 1024 / 1024).toFixed(2)} MB</span>
                          <button type="button" onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} className="ml-2 text-black/50 hover:text-red-600">×</button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </Section>

                <Section title="Terms of Service & Privacy Policy">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-1 h-4 w-4 accent-black" />
                    <span className="text-sm text-black">
                      I acknowledge I have read and agree to F1 Media Team&apos;s{" "}
                      <a href="#" className="text-blue-700 underline">Terms of Service</a> and{" "}
                      <a href="#" className="text-blue-700 underline">Privacy Policy</a>.
                      I authorize F1 Media Team to access the platforms listed above for the purpose of executing the agreed-upon services.
                    </span>
                  </label>
                </Section>
              </div>
            </>
          ) : null}

          {/* ============== NAVIGATION ============== */}
          <div className="sticky bottom-0 left-0 right-0 bg-white border-t border-black/10 px-10 py-4 flex items-center justify-between">
            <button
              type="button"
              onClick={back}
              disabled={page === 0 || pending}
              className="rounded-lg border border-black/20 px-5 py-2 text-sm font-medium text-black hover:bg-black/5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ← Back
            </button>
            <div className="text-xs text-black/55 font-mono">
              {page + 1} / {PAGES.length} · {PAGES[page]} · v{version}
            </div>
            {page < PAGES.length - 1 ? (
              <button
                type="button"
                onClick={next}
                className="rounded-lg bg-black px-6 py-2 text-sm font-semibold text-white hover:bg-black/90"
              >
                Next page →
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={!accepted || pending}
                className="rounded-lg bg-[#3F8E84] px-6 py-2 text-sm font-semibold text-white hover:bg-[#3F8E84]/90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {pending ? "Submitting…" : "Submit onboarding"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
