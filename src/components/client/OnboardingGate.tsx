"use client";

// 6-page onboarding wizard — every word and every field from the six F1
// Media onboarding docs. Page 6 holds the Terms of Service + Privacy Policy
// checkbox. On submit, the server persists the answers, renders the PDF,
// and saves the file so the client can download it from Settings.

import { useEffect, useState, useTransition } from "react";
import { submitOnboardingAction } from "@/app/client/actions";
import { signOutAction } from "@/app/login/actions";
import type { OnboardingData } from "@/lib/types";

interface Props {
  version: string;
  userName: string;
  /** When true, Submit does NOT call the server action — it logs the answers
   *  to console + shows a success alert. Used by /admin/preview/onboarding. */
  preview?: boolean;
}

// ---------- shared field primitives ----------

const inputClass =
  "w-full rounded-lg border border-black/15 bg-[#F5F7FA] text-black px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/20 focus:bg-white";
const labelClass = "block text-[10px] uppercase tracking-widest text-black/55 mb-1.5 font-semibold";

function Field({ label, value, onChange, type = "text", placeholder, error }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; error?: boolean }) {
  const cls = inputClass + (error ? " !border-red-500 !border-2 bg-red-50" : "");
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={cls} />
    </label>
  );
}

function Area({ label, value, onChange, placeholder, rows = 3, error }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; error?: boolean }) {
  const cls = inputClass + (error ? " !border-red-500 !border-2 bg-red-50" : "");
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <textarea value={value} placeholder={placeholder} rows={rows} onChange={(e) => onChange(e.target.value)} className={cls} />
    </label>
  );
}

function YesNo({ label, value, onChange, error }: { label: string; value: "yes" | "no" | ""; onChange: (v: "yes" | "no" | "") => void; error?: boolean }) {
  return (
    <div className={"flex items-center justify-between gap-3 text-sm py-1.5 rounded-md " + (error ? "border-2 border-red-500 bg-red-50 px-2" : "")}>
      <span className="text-black/85">{label}</span>
      <div className="flex gap-1.5">
        {(["yes", "no"] as const).map((v) => (
          <button type="button" key={v} onClick={() => onChange(value === v ? "" : v)} className={"px-3 py-1 rounded-md text-xs border " + (value === v ? "border-black bg-black text-white" : "border-black/30 text-black/60 hover:border-black/60")}>{v.toUpperCase()}</button>
        ))}
      </div>
    </div>
  );
}

function Priority({ label, value, onChange, error }: { label: string; value: "high" | "medium" | "low" | ""; onChange: (v: "high" | "medium" | "low" | "") => void; error?: boolean }) {
  return (
    <div className={error ? "rounded-md border-2 border-red-500 bg-red-50 px-2 py-1" : ""}>
      <span className={labelClass}>{label}</span>
      <div className="flex gap-2">
        {(["high", "medium", "low"] as const).map((p) => (
          <button key={p} type="button" onClick={() => onChange(value === p ? "" : p)} className={"px-3 py-1 rounded-md text-xs border " + (value === p ? "border-black bg-black text-white" : "border-black/30 text-black/60 hover:border-black/60")}>{p.toUpperCase()}</button>
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

function H2({ children }: { children: React.ReactNode }) { return <h2 className="text-xl font-bold text-black mt-8 mb-3">{children}</h2>; }
function H3({ children }: { children: React.ReactNode }) { return <h3 className="text-base font-bold text-black mt-5 mb-2">{children}</h3>; }
function P({ children }: { children: React.ReactNode }) { return <p className="text-sm leading-relaxed text-black/85 mb-3">{children}</p>; }
function UL({ items }: { items: React.ReactNode[] }) { return <ul className="list-disc pl-6 space-y-1 text-sm text-black/85 mb-4">{items.map((it, i) => <li key={i}>{it}</li>)}</ul>; }

// ---------- main ----------

const AUTH_OPTIONS: { value: NonNullable<OnboardingData["authorization_preference"]>; label: string }[] = [
  { value: "direct_credentials", label: "Direct credential sharing" },
  { value: "temporary_password", label: "Temporary password sharing" },
  { value: "admin_invite",       label: "Administrative invite to F1 Media Team" },
  { value: "dedicated_email",    label: "Dedicated marketing email creation" },
  { value: "other",              label: "Other" },
];

const SOCIAL_PLATFORMS: { key: string; label: string; urlLabel: string }[] = [
  { key: "instagram", label: "Instagram", urlLabel: "Username / Handle" },
  { key: "facebook",  label: "Facebook",  urlLabel: "Username / Page URL" },
  { key: "linkedin",  label: "LinkedIn",  urlLabel: "Company Page URL" },
  { key: "x",         label: "X (Twitter)", urlLabel: "Username / Handle" },
  { key: "youtube",   label: "YouTube",   urlLabel: "Channel URL" },
  { key: "tiktok",    label: "TikTok",    urlLabel: "Username / Handle" },
  { key: "pinterest", label: "Pinterest", urlLabel: "Profile URL" },
  { key: "medium",    label: "Medium",    urlLabel: "Profile URL" },
  { key: "quora",     label: "Quora",     urlLabel: "Profile URL" },
  { key: "reddit",    label: "Reddit",    urlLabel: "Profile URL" },
  { key: "threads",   label: "Threads",   urlLabel: "Username / Handle" },
  { key: "tumblr",    label: "Tumblr",    urlLabel: "Profile URL" },
  { key: "other",     label: "Other platform", urlLabel: "Profile URL" },
];

const PAGES = ["Account Access", "Company Bio", "Contacts", "Growth Strategy", "Services & Locations", "Brand Assets & Terms"] as const;

// localStorage key for in-flight onboarding. Bump the version suffix if the
// OnboardingData shape changes in an incompatible way.
const STORAGE_KEY = "f1m_onboarding_draft_v1";
const PREVIEW_STORAGE_KEY = "f1m_onboarding_draft_v1_preview";

const EMPTY_DATA: OnboardingData = {
  google_access: {}, microsoft_access: {}, socials: {},
  contacts: [{}], services: [{}], service_locations: [{}],
  counties_served: [{}], out_of_state: [{}],
  primary_city: {}, statewide_coverage: {},
};

export default function OnboardingGate({ version, userName, preview = false }: Props) {
  const [pending, start] = useTransition();
  const storageKey = preview ? PREVIEW_STORAGE_KEY : STORAGE_KEY;
  // Read the saved draft synchronously on first render so the user lands
  // right back on the page they were filling out.
  const [page, setPage] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return 0;
      const parsed = JSON.parse(raw);
      const p = Number(parsed?.page);
      return Number.isFinite(p) && p >= 0 && p < 6 ? p : 0;
    } catch { return 0; }
  });
  const [data, setData] = useState<OnboardingData>(() => {
    if (typeof window === "undefined") return EMPTY_DATA;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return EMPTY_DATA;
      const parsed = JSON.parse(raw);
      return parsed?.data && typeof parsed.data === "object"
        ? { ...EMPTY_DATA, ...parsed.data }
        : EMPTY_DATA;
    } catch { return EMPTY_DATA; }
  });
  const [accepted, setAccepted] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return Boolean(parsed?.accepted);
    } catch { return false; }
  });
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [attempted, setAttempted] = useState(false); // user tried to advance with missing fields

  // Persist on any change so refresh / accidental close don't drop the work.
  // (File uploads can't be serialized — the user has to re-pick those.)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({ data, page, accepted, savedAt: Date.now() }),
      );
    } catch { /* quota / private mode — ignore */ }
  }, [data, page, accepted, storageKey]);
  const err = (filledOK: boolean) => attempted && !filledOK; // show red if attempted AND not filled

  const set = <K extends keyof OnboardingData>(k: K, v: OnboardingData[K]) => setData((d) => ({ ...d, [k]: v }));
  const setGoogleAccess = (k: string, v: boolean) => setData((d) => ({ ...d, google_access: { ...(d.google_access ?? {}), [k]: v } }));
  const setMsftAccess = (k: string, v: boolean) => setData((d) => ({ ...d, microsoft_access: { ...(d.microsoft_access ?? {}), [k]: v } }));
  const setSocial = (key: string, field: "username" | "admin_email", v: string) => setData((d) => ({ ...d, socials: { ...(d.socials ?? {}), [key]: { ...(d.socials?.[key] ?? {}), [field]: v } } }));

  function updateRow<T>(key: "contacts" | "services" | "service_locations" | "counties_served" | "out_of_state", index: number, patch: Partial<T>) {
    setData((d) => {
      const arr = ([...(((d as unknown as Record<string, T[]>)[key]) ?? [])]);
      arr[index] = { ...(arr[index] ?? ({} as T)), ...patch };
      return { ...d, [key]: arr };
    });
  }
  function addRow(key: "contacts" | "services" | "service_locations" | "counties_served" | "out_of_state") {
    setData((d) => ({ ...d, [key]: [...(((d as unknown as Record<string, object[]>)[key]) ?? []), {}] }));
  }
  function removeRow(key: "contacts" | "services" | "service_locations" | "counties_served" | "out_of_state", index: number) {
    setData((d) => {
      const arr = ([...(((d as unknown as Record<string, object[]>)[key]) ?? [])]);
      arr.splice(index, 1);
      return { ...d, [key]: arr.length ? arr : [{}] };
    });
  }

  // ---------- validation ----------
  const filled = (s?: string | null) => typeof s === "string" && s.trim().length > 0;
  const yn = (v?: string | null) => v === "yes" || v === "no";

  function validatePage(idx: number): boolean {
    switch (idx) {
      case 0: {
        // Primary admin (secondary admin row is optional)
        if (!filled(data.primary_admin_email) || !filled(data.primary_admin_username) || !filled(data.primary_admin_password)) return false;
        if (!yn(data.primary_tied_to_google) || !yn(data.primary_tied_to_hosting)) return false;
        // Website & hosting — hosting_provider and developer_contact are
        // labelled "if known"/"if applicable" so they aren't required.
        if (
          !filled(data.website_url) || !filled(data.website_username) || !filled(data.website_password) ||
          !filled(data.domain_registrar) || !filled(data.website_admin_email) ||
          !filled(data.cms_platform)
        ) return false;
        // Google + Microsoft — only the admin email is required.
        // The platform checkboxes are intentionally optional: a client may
        // not use every Google/Microsoft product, so they tick only the
        // ones they actually want F1 Media to access.
        if (!filled(data.google_admin_email)) return false;
        if (!filled(data.microsoft_admin_email)) return false;
        // Every social platform: username + admin email
        for (const p of SOCIAL_PLATFORMS) {
          const s = data.socials?.[p.key];
          if (!filled(s?.username) || !filled(s?.admin_email)) return false;
        }
        // Auth preference
        if (!data.authorization_preference) return false;
        if (data.authorization_preference === "other" && !filled(data.authorization_other)) return false;
        return true;
      }
      case 1: {
        if (!filled(data.company_bio) || !filled(data.brand_diff) || !filled(data.brand_3words)) return false;
        // Channel sub-fields are only required when the client has ticked
        // that channel's checkbox (i.e. said "yes, we use this"). Unticked
        // channels are skipped entirely.
        if (data.perf_social_active   && (!filled(data.perf_social_used)      || !filled(data.perf_social_explanation)))   return false;
        if (data.perf_website_active  && (!filled(data.perf_website_url)      || !filled(data.perf_website_explanation)))  return false;
        if (data.perf_paid_active     && (!filled(data.perf_paid_platforms)   || !filled(data.perf_paid_explanation)))     return false;
        if (data.perf_podcast_active  && (!filled(data.perf_podcast_name)     || !filled(data.perf_podcast_explanation)))  return false;
        if (data.perf_other_active    && (!filled(data.perf_other)            || !filled(data.perf_other_explanation)))    return false;
        if (
          !filled(data.perf_underperforming_channel) || !filled(data.perf_underperforming_attempted) ||
          !filled(data.perf_underperforming) || !filled(data.perf_additional_notes) ||
          !filled(data.ideal_client) || !filled(data.highest_revenue_cases) ||
          !filled(data.cases_to_avoid) || !filled(data.saturated_markets) || !filled(data.growth_opportunity)
        ) return false;
        return true;
      }
      case 2: {
        const rows = data.contacts ?? [];
        if (rows.length === 0) return false;
        for (const c of rows) {
          if (!filled(c.name) || !filled(c.email) || !filled(c.phone) || !filled(c.role)) return false;
        }
        return true;
      }
      case 3: return true; // informational page — no fields
      case 4: {
        // Services: at least one, all rows fully filled
        const svcs = data.services ?? [];
        if (svcs.length === 0) return false;
        for (const s of svcs) {
          if (!filled(s.name) || !filled(s.description) || !filled(s.audience) || !s.priority) return false;
        }
        // Primary city — every field
        const pc = data.primary_city ?? {};
        if (
          !filled(pc.name) || !yn(pc.has_office) || !filled(pc.office_address) ||
          !yn(pc.virtual_service) || !pc.priority || !yn(pc.revenue_market) || !filled(pc.notes)
        ) return false;
        // Surrounding cities — at least one, all filled
        const sc = data.service_locations ?? [];
        if (sc.length === 0) return false;
        for (const l of sc) {
          if (!filled(l.city) || !yn(l.has_office) || !l.priority || !filled(l.notes)) return false;
        }
        // Counties — at least one, all filled
        const co = data.counties_served ?? [];
        if (co.length === 0) return false;
        for (const c of co) {
          if (!filled(c.name) || !yn(c.office_in_county) || !c.priority || !filled(c.notes)) return false;
        }
        // Statewide coverage — section header says "(if applicable)", so
        // nothing here is required. Whatever the client fills in is captured.
        // Out-of-state representation — same: "(if applicable)" → optional.
        // Future expansion targets/timeline — the doc labels these "if known".
        // Capture whatever they enter; do not block the page.
        // Market focus questions
        if (
          !filled(data.market_focus_main_city) || !filled(data.market_focus_competition) ||
          !filled(data.market_focus_priority_cities) || !filled(data.market_focus_avoid)
        ) return false;
        return true;
      }
      case 5: {
        if (!filled(data.brand_color_hex) || !filled(data.brand_fonts) || !filled(data.brand_guidelines_notes)) return false;
        if (files.length === 0) return false;
        if (!accepted) return false;
        return true;
      }
    }
    return true;
  }
  const canAdvance = validatePage(page);

  function submit() {
    if (!preview && !accepted) return;
    const enriched: OnboardingData = { ...data, uploaded_asset_filenames: files.map((f) => f.name) };
    if (preview) {
      // eslint-disable-next-line no-console
      console.log("[onboarding preview] would submit:", enriched, "files:", files.map((f) => f.name));
      window.alert(
        "Preview mode — nothing was actually submitted.\n\n" +
          `Captured ${Object.keys(enriched).length} fields and ${files.length} files. ` +
          "Check the browser console for the full payload.",
      );
      return;
    }
    const fd = new FormData();
    fd.set("data", JSON.stringify(enriched));
    fd.set("accepted_terms", "on");
    for (const f of files) fd.append("brand_assets", f);
    // Clear the saved draft once we hand the payload off — a future
    // onboarding for this device should start clean.
    try { window.localStorage.removeItem(storageKey); } catch { /* ignore */ }
    start(async () => { await submitOnboardingAction(fd); });
  }

  function next() {
    // Preview mode skips validation so you can click through every page.
    if (!preview && !canAdvance) {
      setAttempted(true);
      // Scroll to the first red-outlined field so the customer sees what's missing.
      requestAnimationFrame(() => {
        const firstMissing = document.querySelector(".onboarding-body .\\!border-red-500, .onboarding-body .border-red-500");
        firstMissing?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      return;
    }
    if (page < PAGES.length - 1) {
      setPage(page + 1);
      setAttempted(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }
  function back() {
    if (page > 0) {
      setPage(page - 1);
      setAttempted(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function PageHeader({ idx, title }: { idx: number; title: string; sub?: string }) {
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
    <div
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-start justify-center px-4 py-6 overflow-y-auto"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => e.preventDefault()}
    >
      <div className="w-full max-w-5xl my-4 rounded-2xl shadow-[0_30px_80px_-10px_rgba(0,0,0,0.6)] overflow-hidden border border-white/10 bg-white">
        <div className="relative px-7 py-5 flex items-center justify-between border-b border-black/10" style={{ background: "radial-gradient(120% 200% at 50% -20%, #e2e2e2 0%, #b4b4b4 60%, #8c8c8c 100%)" }}>
          <div role="img" aria-label="F1 Media Team" className="bg-no-repeat bg-center" style={{ height: 56, width: 200, backgroundImage: "url(/logo-dark.png)", backgroundSize: "220px auto" }} />
          <div className="text-right flex flex-col items-end">
            <div className="flex items-center gap-3">
              <div className="text-[10px] uppercase tracking-[0.25em] text-black/55 font-mono">Onboarding</div>
              {preview ? null : (
                <form action={signOutAction}>
                  <button
                    type="submit"
                    title="Sign out and return to login"
                    className="group inline-flex items-center gap-1.5 rounded-full border border-red-600/40 bg-transparent px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] font-semibold text-red-600 hover:bg-red-600 hover:text-white hover:border-red-600 transition-colors"
                  >
                    <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M15 17l5-5-5-5" />
                      <path d="M20 12H9" />
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    </svg>
                    Sign out
                  </button>
                </form>
              )}
            </div>
            <div className="text-sm font-semibold text-black mt-0.5">Welcome, {userName}</div>
            <ProgressDots />
          </div>
        </div>

        <div className="onboarding-body bg-white text-black">
          {/* ============== PAGE 1 — ACCOUNT ACCESS ============== */}
          {page === 0 ? (
            <>
              <PageHeader idx={0} title="Digital Account Access & Administrative Permissions" sub="F1 Media Team Onboarding – Platform Access Authorization" />
              <div className="px-10 py-8">
                <P>To properly optimize, monitor, and manage your digital presence, F1 Media Team requires visibility into the email accounts and administrative access connected to your website, search platforms, and social media properties.</P>
                <P>This ensures:</P>
                <UL items={["Proper SEO configuration", "Accurate analytics tracking", "Search engine indexing", "Profile verification", "Campaign management", "Platform compliance", "Security continuity"]} />

                <H2>Account Structure & Access Policy</H2>
                <P>To streamline onboarding, prevent access delays, and ensure long-term operational continuity, F1 Media Team requires the creation of a dedicated marketing email address for your organization.</P>
                <P>This email will serve as the centralized administrative account for all digital platforms and marketing-related services.</P>

                <H2>Required Action</H2>
                <P>Please create a dedicated email address such as:</P>
                <UL items={["seo@yourcompany.com", "marketing@yourcompany.com", "media@yourcompany.com", "social@yourcompany.com"]} />

                <H2>Purpose of This Email</H2>
                <P>This account should:</P>
                <UL items={["Be created under your company's domain", "Be owned by your company", "Have full administrative access to all digital platforms", "Be used exclusively for marketing and digital services"]} />
                <P>This allows F1 Media Team to:</P>
                <UL items={["Receive and accept platform invitations", "Verify search engine accounts", "Access analytics and webmaster tools", "Manage social media permissions", "Maintain secure and centralized control", "Avoid repeated credential requests"]} />

                <H2>Platforms This Email Should Have Access To</H2>
                <P>Please assign this email administrative access to:</P>
                <UL items={["Website CMS", "Hosting provider", "Domain registrar", "Google Analytics", "Google Search Console", "Google Business Profile", "Google Ads", "Microsoft / Bing Webmaster Tools", "Social media platforms (Instagram, Facebook, LinkedIn, X, YouTube, TikTok, Pinterest, Medium, Quora, Reddit, etc.)", "Any additional marketing or advertising platforms"]} />

                <H2>Why This Is Required</H2>
                <P>Using a dedicated marketing email:</P>
                <UL items={["Prevents disruptions if internal staff changes", "Eliminates back-and-forth access requests", "Protects personal employee accounts", "Improves security structure", "Simplifies scaling into future campaigns", "Creates a professional digital infrastructure"]} />
                <P><em>This email will remain your property. F1 Media Team will only utilize granted administrative permissions necessary to execute the agreed-upon services.</em></P>
                <P>Please complete all applicable sections below.</P>

                <Section title="1. Primary Administrative Email(s)">
                  <P>List all email addresses that currently hold administrative access to your digital platforms.</P>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Field label="Primary admin email" value={data.primary_admin_email ?? ""} onChange={(v) => set("primary_admin_email", v)} type="email" error={err(filled(data.primary_admin_email))} />
                    <Field label="Username" value={data.primary_admin_username ?? ""} onChange={(v) => set("primary_admin_username", v)} error={err(filled(data.primary_admin_username))} />
                    <Field label="Password" value={data.primary_admin_password ?? ""} onChange={(v) => set("primary_admin_password", v)} type="password" error={err(filled(data.primary_admin_password))} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Field label="Secondary admin email (optional)" value={data.secondary_admin_email ?? ""} onChange={(v) => set("secondary_admin_email", v)} type="email" />
                    <Field label="Username (optional)" value={data.secondary_admin_username ?? ""} onChange={(v) => set("secondary_admin_username", v)} />
                    <Field label="Password (optional)" value={data.secondary_admin_password ?? ""} onChange={(v) => set("secondary_admin_password", v)} type="password" />
                  </div>
                  <YesNo label="Is this email tied to Google services?" value={(data.primary_tied_to_google ?? "") as "yes" | "no" | ""} onChange={(v) => set("primary_tied_to_google", v)} error={err(yn(data.primary_tied_to_google))} />
                  <YesNo label="Is this email tied to website hosting?" value={(data.primary_tied_to_hosting ?? "") as "yes" | "no" | ""} onChange={(v) => set("primary_tied_to_hosting", v)} error={err(yn(data.primary_tied_to_hosting))} />
                </Section>

                <Section title="2. Website & Hosting Access">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Field label="Website URL" value={data.website_url ?? ""} onChange={(v) => set("website_url", v)} placeholder="https://" error={err(filled(data.website_url))} />
                    <Field label="Username" value={data.website_username ?? ""} onChange={(v) => set("website_username", v)} error={err(filled(data.website_username))} />
                    <Field label="Password" value={data.website_password ?? ""} onChange={(v) => set("website_password", v)} type="password" error={err(filled(data.website_password))} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Field label="Domain registrar (if known)" value={data.domain_registrar ?? ""} onChange={(v) => set("domain_registrar", v)} error={err(filled(data.domain_registrar))} />
                    <Field label="Hosting provider (if known)" value={data.hosting_provider ?? ""} onChange={(v) => set("hosting_provider", v)} />
                    <Field label="Primary website access email" value={data.website_admin_email ?? ""} onChange={(v) => set("website_admin_email", v)} type="email" error={err(filled(data.website_admin_email))} />
                    <Field label="CMS platform (WordPress, Webflow, custom, etc.)" value={data.cms_platform ?? ""} onChange={(v) => set("cms_platform", v)} error={err(filled(data.cms_platform))} />
                    <Field label="Developer contact (if applicable)" value={data.developer_contact ?? ""} onChange={(v) => set("developer_contact", v)} />
                  </div>
                </Section>

                <Section title="3. Search Engine Accounts">
                  <H3>Google Accounts</H3>
                  <Field label="Google account email (admin)" value={data.google_admin_email ?? ""} onChange={(v) => set("google_admin_email", v)} type="email" error={err(filled(data.google_admin_email))} />
                  <P>Access to the following:</P>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                    {[
                      { k: "analytics", l: "Google Analytics" },
                      { k: "search_console", l: "Google Search Console" },
                      { k: "business_profile", l: "Google Business Profile" },
                      { k: "ads", l: "Google Ads" },
                      { k: "tag_manager", l: "Tag Manager" },
                    ].map(({ k, l }) => (
                      <label key={k} className="flex items-center gap-2 text-sm py-1">
                        <input type="checkbox" checked={Boolean((data.google_access ?? {})[k as keyof NonNullable<typeof data.google_access>])} onChange={(e) => setGoogleAccess(k, e.target.checked)} className="h-4 w-4 accent-black" />
                        <span>{l}</span>
                      </label>
                    ))}
                  </div>
                  <Field label="Other" value={String((data.google_access ?? {}).other ?? "")} onChange={(v) => setData((d) => ({ ...d, google_access: { ...(d.google_access ?? {}), other: v } }))} />

                  <H3>Microsoft / Bing Accounts</H3>
                  <Field label="Microsoft account email (admin)" value={data.microsoft_admin_email ?? ""} onChange={(v) => set("microsoft_admin_email", v)} type="email" error={err(filled(data.microsoft_admin_email))} />
                  <P>Access to:</P>
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
                  <Field label="Other" value={String((data.microsoft_access ?? {}).other ?? "")} onChange={(v) => setData((d) => ({ ...d, microsoft_access: { ...(d.microsoft_access ?? {}), other: v } }))} />
                </Section>

                <Section title="4. Social Media Account Access">
                  <P>Please list the email address that holds administrative access for each platform.</P>
                  {SOCIAL_PLATFORMS.map((p) => {
                    const v = data.socials?.[p.key] ?? {};
                    return (
                      <div key={p.key} className="border-t border-black/10 pt-3">
                        <div className="text-sm font-bold text-black mb-2">{p.label}</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <Field label={p.urlLabel} value={v.username ?? ""} onChange={(val) => setSocial(p.key, "username", val)} error={err(filled(v.username))} />
                          <Field label="Admin email" value={v.admin_email ?? ""} onChange={(val) => setSocial(p.key, "admin_email", val)} type="email" error={err(filled(v.admin_email))} />
                        </div>
                      </div>
                    );
                  })}
                </Section>

                <Section title="5. Access Authorization Preference">
                  <P>Please indicate your preferred access method:</P>
                  <div className={"grid grid-cols-1 md:grid-cols-2 gap-2 " + (err(Boolean(data.authorization_preference)) ? "rounded-md border-2 border-red-500 bg-red-50 px-2 py-1" : "")}>
                    {AUTH_OPTIONS.map((o) => (
                      <label key={o.value} className="flex items-center gap-2 text-sm py-1">
                        <input type="radio" name="auth_pref" checked={data.authorization_preference === o.value} onChange={() => set("authorization_preference", o.value)} className="h-4 w-4 accent-black" />
                        <span>{o.label}</span>
                      </label>
                    ))}
                  </div>
                  {data.authorization_preference === "other" ? (
                    <Area label="Tell us more" value={data.authorization_other ?? ""} onChange={(v) => set("authorization_other", v)} rows={2} error={err(filled(data.authorization_other))} />
                  ) : null}
                  <div className="mt-4 rounded-lg border border-black/10 bg-[#FAFAFA] px-4 py-3">
                    <div className="text-xs font-bold text-black mb-1">Security Note</div>
                    <P>For security and compliance purposes, F1 Media Team recommends:</P>
                    <UL items={["Granting administrative access via email invitation when possible", "Avoiding long-term password sharing", "Enabling two-factor authentication", "Maintaining at least one internal administrator at all times"]} />
                  </div>
                </Section>
              </div>
            </>
          ) : null}

          {/* ============== PAGE 2 — COMPANY BIO & PERFORMANCE ============== */}
          {page === 1 ? (
            <>
              <PageHeader idx={1} title="Company Bio & Performance Insights" sub="F1 Media Team Onboarding – Brand Positioning & Growth Analysis" />
              <div className="px-10 py-8">
                <P>To effectively position your company, develop authoritative messaging, and structure a high-performance digital strategy, we require a comprehensive understanding of your company&apos;s identity, voice, history, and past marketing performance.</P>
                <P>This section helps us:</P>
                <UL items={["Strengthen brand authority", "Align your messaging with your ideal customer", "Identify high-performing channels", "Eliminate underperforming strategies"]} />
                <P>Please complete all sections in detail.</P>

                <Section title="1. Official Company Bio">
                  <P>Please provide a detailed company bio including:</P>
                  <UL items={["When the company was founded", "Why it was founded", "Mission and core values", "Business focus and philosophy", "What differentiates your company from competitors", "Notable achievements, recognitions, or milestones", "Community involvement (if applicable)", "Target customers"]} />
                  <Area label="Company bio" value={data.company_bio ?? ""} onChange={(v) => set("company_bio", v)} rows={9} error={err(filled(data.company_bio))} />
                </Section>

                <Section title="2. Two Strategic Brand Questions">
                  <P><strong>Question 1:</strong> What makes your company different from competitors in your market? (Examples: customer experience, product quality, responsiveness, niche focus, pricing, expertise, etc.)</P>
                  <Area label="Response" value={data.brand_diff ?? ""} onChange={(v) => set("brand_diff", v)} rows={5} error={err(filled(data.brand_diff))} />
                  <P><strong>Question 2:</strong> If a customer had to describe your company in three words, what would they say and why?</P>
                  <Area label="Response" value={data.brand_3words ?? ""} onChange={(v) => set("brand_3words", v)} rows={5} error={err(filled(data.brand_3words))} />
                </Section>

                <Section title="3. Marketing Performance Analysis">
                  <P>Understanding what has worked (and what hasn&apos;t) allows us to refine your strategy and allocate resources effectively.</P>
                  <H3>Where Have You Seen the Most Success?</H3>
                  <P>Please indicate all that apply and explain why you believe it performed well.</P>

                  <div className="space-y-4">
                    {([
                      { key: "perf_social_active",  label: "Social Media",
                        fields: <>
                          <Field label="Platforms used" value={data.perf_social_used ?? ""} onChange={(v) => set("perf_social_used", v)} error={data.perf_social_active ? err(filled(data.perf_social_used)) : false} />
                          <Area label="Explanation" value={data.perf_social_explanation ?? ""} onChange={(v) => set("perf_social_explanation", v)} rows={4} error={data.perf_social_active ? err(filled(data.perf_social_explanation)) : false} />
                        </>,
                        active: data.perf_social_active },
                      { key: "perf_website_active", label: "Website",
                        fields: <>
                          <Field label="Website URL(s)" value={data.perf_website_url ?? ""} onChange={(v) => set("perf_website_url", v)} error={data.perf_website_active ? err(filled(data.perf_website_url)) : false} />
                          <Area label="Explanation" value={data.perf_website_explanation ?? ""} onChange={(v) => set("perf_website_explanation", v)} rows={4} error={data.perf_website_active ? err(filled(data.perf_website_explanation)) : false} />
                        </>,
                        active: data.perf_website_active },
                      { key: "perf_paid_active",    label: "Paid Advertising",
                        fields: <>
                          <Field label="Platforms used (Google Ads, Meta, etc.)" value={data.perf_paid_platforms ?? ""} onChange={(v) => set("perf_paid_platforms", v)} error={data.perf_paid_active ? err(filled(data.perf_paid_platforms)) : false} />
                          <Area label="Explanation" value={data.perf_paid_explanation ?? ""} onChange={(v) => set("perf_paid_explanation", v)} rows={4} error={data.perf_paid_active ? err(filled(data.perf_paid_explanation)) : false} />
                        </>,
                        active: data.perf_paid_active },
                      { key: "perf_podcast_active", label: "Podcast",
                        fields: <>
                          <Field label="Podcast name / platform" value={data.perf_podcast_name ?? ""} onChange={(v) => set("perf_podcast_name", v)} error={data.perf_podcast_active ? err(filled(data.perf_podcast_name)) : false} />
                          <Area label="Explanation" value={data.perf_podcast_explanation ?? ""} onChange={(v) => set("perf_podcast_explanation", v)} rows={4} error={data.perf_podcast_active ? err(filled(data.perf_podcast_explanation)) : false} />
                        </>,
                        active: data.perf_podcast_active },
                      { key: "perf_other_active",   label: "Other",
                        fields: <>
                          <Field label="Channel / source" value={data.perf_other ?? ""} onChange={(v) => set("perf_other", v)} error={data.perf_other_active ? err(filled(data.perf_other)) : false} />
                          <Area label="Explanation" value={data.perf_other_explanation ?? ""} onChange={(v) => set("perf_other_explanation", v)} rows={4} error={data.perf_other_active ? err(filled(data.perf_other_explanation)) : false} />
                        </>,
                        active: data.perf_other_active },
                    ] as const).map(({ key, label, fields, active }) => (
                      <div key={key}>
                        <label className="flex items-center gap-2 cursor-pointer select-none mb-2">
                          <input
                            type="checkbox"
                            checked={Boolean(active)}
                            onChange={(e) => set(key, e.target.checked)}
                            className="h-4 w-4 accent-black"
                          />
                          <span className="text-xs font-bold uppercase text-black/70">{label}</span>
                        </label>
                        <div className="space-y-3 pl-6">{fields}</div>
                      </div>
                    ))}
                  </div>

                  <H3>Where Have You Seen the Least Success?</H3>
                  <P>Please describe channels, campaigns, or efforts that did not produce desired results.</P>
                  <Field label="Channel / Platform" value={data.perf_underperforming_channel ?? ""} onChange={(v) => set("perf_underperforming_channel", v)} error={err(filled(data.perf_underperforming_channel))} />
                  <Field label="What was attempted" value={data.perf_underperforming_attempted ?? ""} onChange={(v) => set("perf_underperforming_attempted", v)} error={err(filled(data.perf_underperforming_attempted))} />
                  <Area label="Why you believe it underperformed" value={data.perf_underperforming ?? ""} onChange={(v) => set("perf_underperforming", v)} rows={6} error={err(filled(data.perf_underperforming))} />
                  <Area label="Additional notes" value={data.perf_additional_notes ?? ""} onChange={(v) => set("perf_additional_notes", v)} rows={5} error={err(filled(data.perf_additional_notes))} />
                </Section>

                <Section title="4. Additional Strategic Insights (Optional but Recommended)">
                  <P>The following help us identify your ideal positioning and growth lanes:</P>
                  <Area label="Who is your ideal customer?" value={data.ideal_client ?? ""} onChange={(v) => set("ideal_client", v)} error={err(filled(data.ideal_client))} />
                  <Area label="Which products or services drive the most revenue?" value={data.highest_revenue_cases ?? ""} onChange={(v) => set("highest_revenue_cases", v)} error={err(filled(data.highest_revenue_cases))} />
                  <Area label="Are there any customers or projects you prefer not to take on?" value={data.cases_to_avoid ?? ""} onChange={(v) => set("cases_to_avoid", v)} error={err(filled(data.cases_to_avoid))} />
                  <Area label="Which markets or segments feel saturated?" value={data.saturated_markets ?? ""} onChange={(v) => set("saturated_markets", v)} error={err(filled(data.saturated_markets))} />
                  <Area label="Where do you see the greatest growth opportunity?" value={data.growth_opportunity ?? ""} onChange={(v) => set("growth_opportunity", v)} error={err(filled(data.growth_opportunity))} />
                </Section>
              </div>
            </>
          ) : null}

          {/* ============== PAGE 3 — CONTACTS ============== */}
          {page === 2 ? (
            <>
              <PageHeader idx={2} title="Primary Contact & Communication Directory" sub="F1 Media Team Onboarding – Authorized Contacts" />
              <div className="px-10 py-8">
                <P>To ensure efficient communication, streamlined approvals, and proper coordination throughout your campaign, F1 Media Team requires a designated contact directory for your organization.</P>
                <P>Because we will be managing SEO strategy, website optimization, content development, media production, and digital performance tracking, it is essential that we understand:</P>
                <UL items={["Who is responsible for approvals", "Who handles billing and financial communication", "Who manages technical access", "Who should be contacted for urgent matters", "Who will serve as the primary decision-maker"]} />
                <P>Clear communication channels prevent delays, miscommunication, and bottlenecks in execution.</P>

                <H2>Contact List Instructions</H2>
                <P>Please complete the chart below with the following information:</P>
                <UL items={[
                  <><strong>Email:</strong> Direct professional email address (no shared inboxes unless intentional)</>,
                  <><strong>Name (First & Last):</strong> Full legal name of the individual</>,
                  <><strong>Phone Number:</strong> Direct line or mobile number</>,
                  <><strong>Role & Notes:</strong> Title within the company and their specific responsibility in relation to this project (Examples: Owner – Final Approvals | Office Manager – Scheduling & Documents | Marketing Lead – Content Review)</>,
                ]} />

                <H2>Recommended Roles to Include</H2>
                <P>For optimal workflow, we recommend identifying:</P>
                <UL items={["Primary Decision Maker", "Secondary Decision Maker", "Billing Contact", "Website / Technical Contact", "Content Approval Contact", "Emergency Contact (if different)", "Administrative Liaison"]} />
                <P>If multiple individuals share responsibilities, please list each separately.</P>

                <H2>Communication Protocol</H2>
                <P>Once submitted, F1 Media Team will:</P>
                <UL items={["Establish a primary communication channel", "Define approval timelines", "Set response expectations", "Document escalation procedures (if necessary)"]} />
                <P><em>Clear structure = faster execution, stronger results, and fewer delays.</em></P>

                <Section title="Authorized contacts">
                  {(data.contacts ?? []).map((c, i) => (
                    <div key={i} className="rounded-xl border border-black/10 bg-[#FAFAFA] p-4 space-y-3 relative">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <Field label="Full name (First & Last)" value={c.name ?? ""} onChange={(v) => updateRow("contacts", i, { name: v })} error={err(filled(c.name))} />
                        <Field label="Direct email" value={c.email ?? ""} onChange={(v) => updateRow("contacts", i, { email: v })} type="email" error={err(filled(c.email))} />
                        <Field label="Phone number" value={c.phone ?? ""} onChange={(v) => updateRow("contacts", i, { phone: v })} error={err(filled(c.phone))} />
                        <Field label="Role & notes" value={c.role ?? ""} onChange={(v) => updateRow("contacts", i, { role: v })} placeholder="e.g. Owner – Final Approvals" error={err(filled(c.role))} />
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

          {/* ============== PAGE 4 — DIGITAL AUTHORITY & GROWTH STRATEGY ============== */}
          {page === 3 ? (
            <>
              <PageHeader idx={3} title="DIGITAL AUTHORITY & GROWTH STRATEGY" sub="F1 Media Team Framework" />
              <div className="px-10 py-8">
                <P><strong>Rank Higher. Get Found. Stay Competitive.</strong></P>
                <P>We build complete digital authority systems designed to increase visibility, generate qualified leads, and create long-term competitive dominance. Our approach is strategic, structured, and performance-driven — designed to expand visibility, attract qualified leads, strengthen brand credibility, and establish long-term competitive advantage. Below is the comprehensive framework we use to design, implement, and continuously optimize your digital growth ecosystem. This process is not short term but about long term consistency across all platforms to help your pages, brand, and overall website convey the same message. This process is about keeping your company moving and consistently staying ranked, which is important.</P>

                <H2>1 Authority & Visibility Foundation</H2>
                <P><em>Build the Structure Before Scaling the Growth</em></P>
                <P>Before driving traffic, we ensure your brand and digital infrastructure are positioned for authority.</P>
                <H3>Brand Infrastructure</H3>
                <P>We refine and standardize your brand to ensure clarity, consistency, and credibility.</P>
                <UL items={["Logo & brand asset standardization", "Messaging & positioning strategy", "Brand voice development", "Company bio & authority narrative", "Visual identity alignment"]} />
                <H3>Website Optimization</H3>
                <P>Your website becomes a performance-driven conversion asset.</P>
                <UL items={["Technical SEO audit", "Site speed optimization", "Mobile performance enhancement", "Conversion flow optimization", "UX structure & internal linking strategy", "Schema & structured data implementation"]} />

                <H2>2 Search Engine Domination (SEO)</H2>
                <P><em>Own Your Market in Organic Search</em></P>
                <P>We implement a multi-layered SEO strategy designed for visibility and long-term ranking growth.</P>
                <H3>On-Page SEO</H3>
                <UL items={["Keyword strategy mapping", "Service page optimization", "Location-based landing pages", "Content clusters", "Meta structure optimization", "Image & media optimization"]} />
                <H3>Local SEO</H3>
                <UL items={["Google Business Profile optimization", "Bing & Microsoft listings", "NAP consistency management", "Directory citations", "Local map pack positioning"]} />
                <H3>Technical SEO</H3>
                <UL items={["Indexing & crawl issue resolution", "Sitemap configuration", "Core Web Vitals optimization", "Backlink profile auditing"]} />
                <H3>Authority Building</H3>
                <UL items={["Strategic backlink acquisition", "Guest content placements", "Press & media features"]} />

                <H2>3 Content & Media Engine</H2>
                <P><em>Create Content That Builds Authority & Converts</em></P>
                <P>Content is not about volume — it is about positioning and impact.</P>
                <H3>Written Content</H3>
                <UL items={["Strategic blog development", "Educational authority content", "FAQ expansion", "Long-form pillar pages", "Conversion-focused copywriting"]} />
                <H3>Video Strategy</H3>
                <UL items={["Short-form video content", "Educational authority videos", "YouTube SEO optimization", "Video repurposing strategy", "Embedded video ranking support"]} />
                <H3>Visual Media</H3>
                <UL items={["Branded graphics", "Social templates", "Ad creatives", "Infographics"]} />

                <H2>4 Social Media Ecosystem</H2>
                <P><em>Build Presence. Build Authority. Build Audience.</em></P>
                <P>We structure your social platforms to support search visibility and brand positioning.</P>
                <H3>Platform Setup & Optimization</H3>
                <UL items={["Instagram", "Facebook", "LinkedIn", "X (Twitter)", "YouTube", "TikTok", "Pinterest", "Reddit", "Medium", "Quora", "Other(s)"]} />
                <H3>Content Distribution Strategy</H3>
                <UL items={["Structured posting schedules", "Cross-platform repurposing", "Authority positioning content", "Engagement growth strategies", "Consistency"]} />
                <H3>Community & Engagement</H3>
                <UL items={["Comment strategy", "Direct message engagement structure", "Audience targeting refinement", "Brand reputation monitoring", "Consistency"]} />

                <H2>5 Paid Growth & Retargeting</H2>
                <P><em>Accelerate Visibility & Capture Demand</em></P>
                <P>While SEO builds long-term authority, paid campaigns accelerate growth.</P>
                <H3>Paid Search</H3>
                <UL items={["Google Ads", "Bing Ads", "Local Service Ads"]} />
                <H3>Paid Social</H3>
                <UL items={["Meta advertising", "YouTube ads", "Retargeting campaigns"]} />
                <H3>Conversion Tracking & Optimization</H3>
                <UL items={["Event tracking", "ROI optimization", "Funnel refinement"]} />

                <H2>6 Data, Analytics & Continuous Optimization</H2>
                <P><em>Measure. Refine. Improve. Scale.</em></P>
                <P>Every decision we make is data-driven.</P>
                <H3>Tracking Infrastructure</H3>
                <UL items={["Google Analytics", "Search Console", "Tag Manager", "Heatmaps", "Call tracking"]} />
                <H3>Performance Reporting</H3>
                <UL items={["Monthly reporting dashboards", "Keyword ranking movement", "Traffic analysis", "Conversion tracking"]} />
                <H3>Continuous Optimization</H3>
                <UL items={["A/B testing", "Conversion rate improvements", "Content updates", "Algorithm monitoring"]} />

                <H2>7 Market Expansion Strategy</H2>
                <P><em>Scale Beyond Your Current Position</em></P>
                <P>Once your foundation and rankings are established, we expand strategically.</P>
                <H3>Geographic Expansion</H3>
                <UL items={["City-based landing pages", "County-level domination", "Statewide authority buildout"]} />
                <H3>Service Expansion</H3>
                <UL items={["New service area rollouts", "Vertical authority positioning", "Market gap analysis"]} />

                <H2>Our Commitment</H2>
                <P>F1 Media Team does not focus on short-term spikes, which will happen as we are starting and focusing on cleaning up pre-existing pages with better structure.</P>
                <P>Our digital structure ecosystems are designed for long-term authority, consistent visibility, and measurable growth.</P>
                <P>When you partner with F1 Media Team, you are not purchasing isolated marketing services — you are investing in a strategic digital dominance framework.</P>

                <div className="mt-6 rounded-lg border border-black/10 bg-[#FAFAFA] px-4 py-3 text-sm text-black/70">
                  This section is informational. No fields to fill — click <strong>Next page →</strong> to continue.
                </div>
              </div>
            </>
          ) : null}

          {/* ============== PAGE 5 — SERVICES & LOCATIONS ============== */}
          {page === 4 ? (
            <>
              <PageHeader idx={4} title="List of Services & Service Locations" sub="F1 Media Team Onboarding – SEO & Market Targeting" />
              <div className="px-10 py-8">
                <P>To build a strategic SEO and digital visibility plan, F1 Media Team requires a complete breakdown of your services and the geographic areas you serve.</P>
                <P>Search engine performance is directly tied to clarity. In order to rank higher, get found, and stay competitive, we must clearly define:</P>
                <UL items={["What services you offer", "How those services are structured", "Where you provide those services", "Which locations are priority markets"]} />
                <P>This information allows us to develop optimized service pages, local landing pages, content strategies, and geographic ranking campaigns.</P>

                <H2>1. Complete List of Services</H2>
                <P>Please provide a full breakdown of:</P>
                <UL items={["Core service categories", "Sub-services within each category", "Specialized offerings", "High-ticket or priority services", "New or expanding services", "Services you want to phase out (if any)"]} />
                <P>For each service, please indicate:</P>
                <UL items={["Is this a primary revenue driver?", "Is this a competitive market?", "Is this a priority for growth?"]} />
                <P><em>Example format: Service Name · Brief Description · Priority Level (High / Medium / Low) · Primary Target Audience</em></P>

                <Section title="Services">
                  {(data.services ?? []).map((s, i) => (
                    <div key={i} className="rounded-xl border border-black/10 bg-[#FAFAFA] p-4 space-y-3 relative">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <Field label="Service name" value={s.name ?? ""} onChange={(v) => updateRow("services", i, { name: v })} error={err(filled(s.name))} />
                        <Field label="Primary target audience" value={s.audience ?? ""} onChange={(v) => updateRow("services", i, { audience: v })} error={err(filled(s.audience))} />
                      </div>
                      <Area label="Brief description" value={s.description ?? ""} onChange={(v) => updateRow("services", i, { description: v })} rows={2} error={err(filled(s.description))} />
                      <Priority label="Priority level" value={(s.priority ?? "") as "high" | "medium" | "low" | ""} onChange={(v) => updateRow("services", i, { priority: v })} error={err(Boolean(s.priority))} />
                      {(data.services ?? []).length > 1 ? (
                        <button type="button" onClick={() => removeRow("services", i)} className="absolute top-2 right-3 text-[11px] text-black/50 hover:text-red-600">Remove</button>
                      ) : null}
                    </div>
                  ))}
                  <button type="button" onClick={() => addRow("services")} className="text-sm font-semibold text-[#3F8E84] hover:underline">+ Add another service</button>
                </Section>

                <H2>2. Geographic Service Areas</H2>
                <P>Please list all areas where your company actively provides services.</P>
                <P>Include:</P>
                <UL items={["Primary city", "Surrounding cities", "Counties", "Statewide coverage (if applicable)", "Nationwide coverage (if applicable)"]} />
                <P>For each location, indicate:</P>
                <UL items={["Physical office location (if applicable)", "Virtual service area", "Priority markets", "Expansion targets"]} />

                <H2>3. Market Focus Clarification</H2>
                <P>To properly structure local SEO, please clarify:</P>
                <UL items={["Are you targeting one main city or multiple cities equally?", "Are you competing against large national companies or local competitors?", "Are there cities you want to dominate first?", "Are there markets you want to avoid?"]} />
                <P>This helps us determine whether to build:</P>
                <UL items={["City-specific landing pages", "Service + city combinations", "Statewide authority content", "Local directory optimization", "Google Business Profile expansion strategy"]} />

                <H2>Why This Matters</H2>
                <P>Search engines rank relevance and consistency. If your services and locations are not clearly structured, indexed, and strategically mapped, your competitors will outrank you in key markets.</P>
                <P>This section allows F1 Media Team to:</P>
                <UL items={["Build a keyword strategy aligned with real revenue goals", "Create targeted location-based landing pages", "Develop content clusters around each service", "Optimize for both local and statewide visibility", "Strengthen authority within specific service categories"]} />
                <P><em>Clear structure = stronger rankings, higher visibility, and better-qualified leads.</em></P>

                <Section title="PRIMARY CITY">
                  <Field label="City / Area" value={data.primary_city?.name ?? ""} onChange={(v) => set("primary_city", { ...(data.primary_city ?? {}), name: v })} error={err(filled(data.primary_city?.name))} />
                  <YesNo label="Office Location" value={(data.primary_city?.has_office ?? "") as "yes" | "no" | ""} onChange={(v) => set("primary_city", { ...(data.primary_city ?? {}), has_office: v })} error={err(yn(data.primary_city?.has_office))} />
                  <Area label="Physical Office Address (if applicable)" value={data.primary_city?.office_address ?? ""} onChange={(v) => set("primary_city", { ...(data.primary_city ?? {}), office_address: v })} rows={2} error={err(filled(data.primary_city?.office_address))} />
                  <YesNo label="Virtual Service Area" value={(data.primary_city?.virtual_service ?? "") as "yes" | "no" | ""} onChange={(v) => set("primary_city", { ...(data.primary_city ?? {}), virtual_service: v })} error={err(yn(data.primary_city?.virtual_service))} />
                  <Priority label="Priority Level" value={(data.primary_city?.priority ?? "") as "high" | "medium" | "low" | ""} onChange={(v) => set("primary_city", { ...(data.primary_city ?? {}), priority: v })} error={err(Boolean(data.primary_city?.priority))} />
                  <YesNo label="Is this a Primary Revenue Market?" value={(data.primary_city?.revenue_market ?? "") as "yes" | "no" | ""} onChange={(v) => set("primary_city", { ...(data.primary_city ?? {}), revenue_market: v })} error={err(yn(data.primary_city?.revenue_market))} />
                  <Area label="Notes (competitiveness, target customers, special focus, etc.)" value={data.primary_city?.notes ?? ""} onChange={(v) => set("primary_city", { ...(data.primary_city ?? {}), notes: v })} rows={3} error={err(filled(data.primary_city?.notes))} />
                </Section>

                <Section title="SURROUNDING CITIES">
                  <P>Complete one block per city.</P>
                  {(data.service_locations ?? []).map((l, i) => (
                    <div key={i} className="rounded-xl border border-black/10 bg-[#FAFAFA] p-4 space-y-3 relative">
                      <Field label="City / Area" value={l.city ?? ""} onChange={(v) => updateRow("service_locations", i, { city: v })} error={err(filled(l.city))} />
                      <YesNo label="Office Location" value={(l.has_office ?? "") as "yes" | "no" | ""} onChange={(v) => updateRow("service_locations", i, { has_office: v })} error={err(yn(l.has_office))} />
                      <Priority label="Priority Level" value={(l.priority ?? "") as "high" | "medium" | "low" | ""} onChange={(v) => updateRow("service_locations", i, { priority: v })} error={err(Boolean(l.priority))} />
                      <Area label="Notes" value={l.notes ?? ""} onChange={(v) => updateRow("service_locations", i, { notes: v })} rows={2} error={err(filled(l.notes))} />
                      {(data.service_locations ?? []).length > 1 ? (
                        <button type="button" onClick={() => removeRow("service_locations", i)} className="absolute top-2 right-3 text-[11px] text-black/50 hover:text-red-600">Remove</button>
                      ) : null}
                    </div>
                  ))}
                  <button type="button" onClick={() => addRow("service_locations")} className="text-sm font-semibold text-[#3F8E84] hover:underline">+ Add another city</button>
                </Section>

                <Section title="COUNTIES SERVED">
                  {(data.counties_served ?? []).map((c, i) => (
                    <div key={i} className="rounded-xl border border-black/10 bg-[#FAFAFA] p-4 space-y-3 relative">
                      <Field label="County Name" value={c.name ?? ""} onChange={(v) => updateRow("counties_served", i, { name: v })} error={err(filled(c.name))} />
                      <YesNo label="Office located in this county?" value={(c.office_in_county ?? "") as "yes" | "no" | ""} onChange={(v) => updateRow("counties_served", i, { office_in_county: v })} error={err(yn(c.office_in_county))} />
                      <Priority label="Priority Level" value={(c.priority ?? "") as "high" | "medium" | "low" | ""} onChange={(v) => updateRow("counties_served", i, { priority: v })} error={err(Boolean(c.priority))} />
                      <Area label="Notes" value={c.notes ?? ""} onChange={(v) => updateRow("counties_served", i, { notes: v })} rows={2} error={err(filled(c.notes))} />
                      {(data.counties_served ?? []).length > 1 ? (
                        <button type="button" onClick={() => removeRow("counties_served", i)} className="absolute top-2 right-3 text-[11px] text-black/50 hover:text-red-600">Remove</button>
                      ) : null}
                    </div>
                  ))}
                  <button type="button" onClick={() => addRow("counties_served")} className="text-sm font-semibold text-[#3F8E84] hover:underline">+ Add another county</button>
                </Section>

                <Section title="STATEWIDE COVERAGE (If Applicable)">
                  <YesNo label="Do you provide services statewide?" value={(data.statewide_coverage?.provides ?? "") as "yes" | "no" | ""} onChange={(v) => set("statewide_coverage", { ...(data.statewide_coverage ?? {}), provides: v })} />
                  <Area label="If yes, please specify limitations or exclusions" value={data.statewide_coverage?.limitations ?? ""} onChange={(v) => set("statewide_coverage", { ...(data.statewide_coverage ?? {}), limitations: v })} rows={3} />
                  <Priority label="Priority Level for Statewide Visibility" value={(data.statewide_coverage?.priority ?? "") as "high" | "medium" | "low" | ""} onChange={(v) => set("statewide_coverage", { ...(data.statewide_coverage ?? {}), priority: v })} />
                </Section>

                <Section title="OUT-OF-STATE SERVICE (If Applicable)">
                  {(data.out_of_state ?? []).map((o, i) => (
                    <div key={i} className="rounded-xl border border-black/10 bg-[#FAFAFA] p-4 space-y-3 relative">
                      <Field label="State" value={o.state ?? ""} onChange={(v) => updateRow("out_of_state", i, { state: v })} />
                      <Field label="Service type provided in this state" value={o.service_type ?? ""} onChange={(v) => updateRow("out_of_state", i, { service_type: v })} />
                      <YesNo label="Authorized to operate in this state?" value={(o.licensed ?? "") as "yes" | "no" | ""} onChange={(v) => updateRow("out_of_state", i, { licensed: v })} />
                      <YesNo label="Physical office in this state?" value={(o.office ?? "") as "yes" | "no" | ""} onChange={(v) => updateRow("out_of_state", i, { office: v })} />
                      <Priority label="Priority Level" value={(o.priority ?? "") as "high" | "medium" | "low" | ""} onChange={(v) => updateRow("out_of_state", i, { priority: v })} />
                      <Area label="Notes" value={o.notes ?? ""} onChange={(v) => updateRow("out_of_state", i, { notes: v })} rows={2} />
                      {(data.out_of_state ?? []).length > 1 ? (
                        <button type="button" onClick={() => removeRow("out_of_state", i)} className="absolute top-2 right-3 text-[11px] text-black/50 hover:text-red-600">Remove</button>
                      ) : null}
                    </div>
                  ))}
                  <button type="button" onClick={() => addRow("out_of_state")} className="text-sm font-semibold text-[#3F8E84] hover:underline">+ Add another state</button>
                </Section>

                <Section title="FUTURE EXPANSION TARGETS">
                  <Area label="List cities, counties, or states you plan to expand into within the next 6–24 months" value={data.future_expansion_targets ?? ""} onChange={(v) => set("future_expansion_targets", v)} rows={3} error={err(filled(data.future_expansion_targets))} />
                  <Field label="Estimated expansion timeline (if known)" value={data.future_expansion_timeline ?? ""} onChange={(v) => set("future_expansion_timeline", v)} />
                </Section>

                <Section title="Market focus">
                  <Area label="Are you targeting one main city or multiple cities equally?" value={data.market_focus_main_city ?? ""} onChange={(v) => set("market_focus_main_city", v)} rows={2} error={err(filled(data.market_focus_main_city))} />
                  <Area label="Are you competing against large national companies or local competitors?" value={data.market_focus_competition ?? ""} onChange={(v) => set("market_focus_competition", v)} rows={2} error={err(filled(data.market_focus_competition))} />
                  <Area label="Cities you want to dominate first" value={data.market_focus_priority_cities ?? ""} onChange={(v) => set("market_focus_priority_cities", v)} rows={2} error={err(filled(data.market_focus_priority_cities))} />
                  <Area label="Markets to avoid" value={data.market_focus_avoid ?? ""} onChange={(v) => set("market_focus_avoid", v)} rows={2} error={err(filled(data.market_focus_avoid))} />
                </Section>
              </div>
            </>
          ) : null}

          {/* ============== PAGE 6 — BRAND ASSETS + TERMS ============== */}
          {page === 5 ? (
            <>
              <PageHeader idx={5} title="Brand Assets & Media Files Required" sub="F1 Media Team Onboarding – Asset Collection" />
              <div className="px-10 py-8">
                <P>To successfully execute your SEO, branding, content, and consistent digital visibility strategy, F1 Media Team requires access to your official brand and media assets. These materials allow us to maintain visual consistency, brand authority, and professional quality across all platforms.</P>
                <P>As outlined in our mission — <strong>Rank Higher. Get Found. Consistently Stay Competitive.</strong> — we build a cohesive digital ecosystem. To do that effectively, we need original, high-quality source files.</P>

                <H2>1. Company Logos (All Versions & Formats)</H2>
                <P>Please provide all available versions of your logo, including:</P>
                <UL items={["Primary logo", "Secondary / alternate logo variations", "Icon or favicon versions", "Horizontal and vertical layouts", "Black, white, and full-color versions"]} />
                <H3>Required File Formats:</H3>
                <P><strong>Editable / Vector Files (Highest Priority):</strong></P>
                <UL items={[".AI (Adobe Illustrator) Fonts Outlined", ".EPS", ".SVG", "Editable .PDF"]} />
                <P><strong>High-Resolution Files:</strong></P>
                <UL items={["Transparent .PNG", "High-resolution .JPG"]} />
                <P><em>Editable vector files are critical for resizing, reformatting, and adapting your logo across websites, directories, ads, video overlays, social media, and print without loss of quality.</em></P>

                <H2>2. Brand Guidelines (If Available)</H2>
                <P>If your company has an established brand guide, please provide:</P>
                <UL items={["Brand color codes (HEX, RGB, CMYK)", "Typography / font files / Types", "Logo usage guidelines", "Spacing requirements", "Brand tone and messaging standards"]} />
                <P>If no formal brand guide exists, F1 Media Team can assist in formalizing one.</P>

                <Section title="Brand guidelines">
                  <Field label="Brand color (HEX, RGB, or CMYK)" value={data.brand_color_hex ?? ""} onChange={(v) => set("brand_color_hex", v)} placeholder="#0F172A or 15, 23, 42" error={err(filled(data.brand_color_hex))} />
                  <Field label="Typography / fonts" value={data.brand_fonts ?? ""} onChange={(v) => set("brand_fonts", v)} placeholder="DM Sans, Cormorant Garamond, etc." error={err(filled(data.brand_fonts))} />
                  <Area label="Notes — usage rules, spacing, tone of voice" value={data.brand_guidelines_notes ?? ""} onChange={(v) => set("brand_guidelines_notes", v)} rows={4} error={err(filled(data.brand_guidelines_notes))} />
                </Section>

                <H2>3. Raw Photos & Media Files</H2>
                <P>To maximize authenticity, SEO impact, and brand authority, we request:</P>
                <UL items={["Raw, unedited company photos", "Office location photos (interior & exterior)", "Team headshots (high resolution)", "Candid team photos", "Event photos", "Community involvement photos", "Behind-the-scenes images", "Professional photography (if available)"]} />
                <P><em>Original raw files are preferred over compressed images pulled from social media or websites.</em></P>

                <H2>4. Video Assets (If Available)</H2>
                <UL items={["Raw video footage", "B-roll footage", "Interview recordings", "Past commercials or promotional content", "Brand intro/outro files"]} />
                <P>These assets help us create optimized video content for website embedding, YouTube SEO, social media campaigns, and digital authority building.</P>

                <H2>5. Website & Marketing Access (If Applicable)</H2>
                <UL items={["Website login credentials", "Hosting access (if needed)", "Google Analytics access", "Google Search Console access", "Google Business Profile access", "Social media account access"]} />
                <P><em>Secure access ensures proper optimization, tracking, and performance monitoring.</em></P>

                <H2>Why This Is Important</H2>
                <P>F1 Media Team is not simply launching campaigns — we are building a long-term consistent digital marketing authority system designed to:</P>
                <UL items={["Improve search rankings", "Increase brand visibility", "Strengthen market positioning", "Ensure visual consistency across all platforms", "Create scalable media assets for ongoing growth"]} />
                <P><em>The quality of the input assets directly impacts the quality of output results.</em></P>

                <Section title="Upload files">
                  <P>Drop your logos, brand assets, raw photos, and video files here. Editable vector files (.AI, .EPS, .SVG, editable .PDF) are highest priority. High-res PNG and JPG also welcome.</P>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => document.getElementById("brand-assets-input")?.click()}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") document.getElementById("brand-assets-input")?.click(); }}
                    onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragging(true); }}
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "copy"; setDragging(true); }}
                    onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); if (e.currentTarget === e.target) setDragging(false); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDragging(false);
                      const dropped = Array.from(e.dataTransfer.files ?? []);
                      if (dropped.length) setFiles((prev) => [...prev, ...dropped]);
                    }}
                    className={
                      "cursor-pointer rounded-xl border-2 border-dashed px-6 py-10 text-center transition " +
                      (dragging
                        ? "border-[#3F8E84] bg-[#3F8E84]/10"
                        : err(files.length > 0)
                        ? "border-red-500 bg-red-50"
                        : "border-black/25 bg-[#F8FAFC] hover:bg-white")
                    }
                  >
                    <div className="text-sm font-semibold text-black">Drop your logos, brand assets, photos, or videos here</div>
                    <div className="mt-1 text-[11px] text-black/60">or click to browse · .AI / .EPS / .SVG / .PDF / .PNG / .JPG / video</div>
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
                  <label className={"flex items-start gap-3 cursor-pointer rounded-md p-2 " + (err(accepted) ? "border-2 border-red-500 bg-red-50" : "")}>
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
            <button type="button" onClick={back} disabled={page === 0 || pending} className="rounded-lg border border-black/20 px-5 py-2 text-sm font-medium text-black hover:bg-black/5 disabled:opacity-40 disabled:cursor-not-allowed">← Back</button>
            <div />

            {page < PAGES.length - 1 ? (
              <button type="button" onClick={next} className="rounded-lg bg-black px-6 py-2 text-sm font-semibold text-white hover:bg-black/90">Next page →</button>
            ) : (
              <div className="flex flex-col items-end gap-1">
                {!preview && !accepted ? (
                  <div className="text-[11px] text-red-600 font-medium">
                    You must check the Terms of Service &amp; Privacy Policy box to submit.
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    if (!preview && !canAdvance) {
                      setAttempted(true);
                      requestAnimationFrame(() => {
                        const firstMissing = document.querySelector(".onboarding-body .\\!border-red-500, .onboarding-body .border-red-500");
                        firstMissing?.scrollIntoView({ behavior: "smooth", block: "center" });
                      });
                      return;
                    }
                    submit();
                  }}
                  disabled={pending || (!preview && !accepted)}
                  className="rounded-lg bg-[#3F8E84] px-6 py-2 text-sm font-semibold text-white hover:bg-[#3F8E84]/90 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {pending ? "Submitting…" : "Submit onboarding"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
