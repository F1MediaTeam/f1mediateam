"use client";

import { useState, useTransition } from "react";
import { submitOnboardingAction } from "@/app/client/actions";
import type { OnboardingData } from "@/lib/types";

interface Props {
  version: string;
  userName: string;
}

// ---------- field primitives ----------

function Field({
  label, value, onChange, type = "text", placeholder, half,
}: {
  label: string; value: string;
  onChange: (v: string) => void;
  type?: string; placeholder?: string; half?: boolean;
}) {
  return (
    <label className={"block " + (half ? "" : "")}>
      <span className="block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-[var(--color-border)] bg-white text-black px-3 py-2 text-sm"
      />
    </label>
  );
}

function YesNo({
  label, value, onChange,
}: {
  label: string;
  value: "yes" | "no" | "";
  onChange: (v: "yes" | "no" | "") => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm py-1.5">
      <span className="text-black/85">{label}</span>
      <div className="flex gap-1.5">
        {(["yes", "no"] as const).map((v) => (
          <button
            type="button"
            key={v}
            onClick={() => onChange(value === v ? "" : v)}
            className={
              "px-3 py-1 rounded-md text-xs border " +
              (value === v
                ? "border-black bg-black text-[var(--color-text)]"
                : "border-black/30 text-black/60 hover:border-black/60")
            }
          >
            {v.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}

function H1({ children }: { children: React.ReactNode }) {
  return <h1 className="text-3xl font-bold tracking-tight text-black text-center mb-8">{children}</h1>;
}
function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xl font-bold text-black mt-8 mb-3">{children}</h2>;
}
function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="text-base font-bold text-black mt-5 mb-2">{children}</h3>;
}
function P({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={"text-sm leading-relaxed text-black/85 mb-3 " + className}>{children}</p>;
}
function UL({ items }: { items: string[] }) {
  return (
    <ul className="list-disc pl-6 space-y-1 text-sm text-black/85 mb-4">
      {items.map((t, i) => <li key={i}>{t}</li>)}
    </ul>
  );
}
function SocialBlock({
  platform, urlLabel, urlVal, emailVal, setUrl, setEmail,
}: {
  platform: string;
  urlLabel: string;
  urlVal: string; emailVal: string;
  setUrl: (v: string) => void; setEmail: (v: string) => void;
}) {
  return (
    <div className="mb-4">
      <div className="font-bold text-sm text-black mb-1.5">{platform}:</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <Field label={urlLabel} value={urlVal} onChange={setUrl} />
        <Field label="Admin Email" value={emailVal} onChange={setEmail} type="email" />
      </div>
    </div>
  );
}

// ---------- gate ----------

const AUTH_OPTIONS: { value: NonNullable<OnboardingData["authorization_preference"]>; label: string }[] = [
  { value: "direct_credentials", label: "Direct credential sharing" },
  { value: "temporary_password", label: "Temporary password sharing" },
  { value: "admin_invite",       label: "Administrative invite to F1 Media Team" },
  { value: "dedicated_email",    label: "Dedicated marketing email creation" },
  { value: "other",              label: "Other" },
];

export default function OnboardingGate({ version, userName }: Props) {
  const [pending, start] = useTransition();
  const [data, setData] = useState<OnboardingData>({
    google_access: {}, microsoft_access: {}, socials: {},
  });
  const [accepted, setAccepted] = useState(false);

  const set = <K extends keyof OnboardingData>(k: K, v: OnboardingData[K]) =>
    setData((d) => ({ ...d, [k]: v }));

  const setSocial = (key: string, field: "username" | "admin_email", v: string) =>
    setData((d) => ({
      ...d,
      socials: { ...(d.socials ?? {}), [key]: { ...(d.socials?.[key] ?? {}), [field]: v } },
    }));

  const setGoogleAccess = (k: string, v: boolean | string) =>
    setData((d) => ({ ...d, google_access: { ...(d.google_access ?? {}), [k]: v } }));
  const setMsftAccess = (k: string, v: boolean | string) =>
    setData((d) => ({ ...d, microsoft_access: { ...(d.microsoft_access ?? {}), [k]: v } }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!accepted) return;
    const fd = new FormData();
    fd.set("data", JSON.stringify(data));
    fd.set("accepted_terms", "on");
    start(async () => { await submitOnboardingAction(fd); });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-start justify-center px-4 py-6 overflow-y-auto">
      {/* Popup container with branded chrome */}
      <div className="w-full max-w-3xl my-4 rounded-2xl shadow-[0_30px_80px_-10px_rgba(0,0,0,0.6)] overflow-hidden border border-white/10 bg-[var(--color-bg-card)]">
        {/* Branded header bar — dark logo on the soft-gray field it was designed for */}
        <div
          className="relative px-7 py-5 flex items-center justify-between border-b border-black/10"
          style={{
            background:
              "radial-gradient(120% 200% at 50% -20%, #e2e2e2 0%, #b4b4b4 60%, #8c8c8c 100%)",
          }}
        >
          {/* Compact crop of the dark logo (image is square; show only the wordmark band) */}
          <div
            role="img"
            aria-label="F1 Media Team"
            className="bg-no-repeat bg-center"
            style={{
              height: 56,
              width: 200,
              backgroundImage: "url(/logo-dark.png)",
              backgroundSize: "220px auto",
            }}
          />
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.25em] text-black/55 font-mono">Onboarding</div>
            <div className="text-sm font-semibold text-black mt-0.5">Welcome, {userName}</div>
          </div>
        </div>

        <form onSubmit={submit} className="bg-white text-black">
        <div className="px-10 pt-10 pb-6 text-center border-b border-black/10">
          <H1>Digital Account Access &amp; Administrative<br/>Permissions</H1>
          <div className="text-[10px] uppercase tracking-[0.25em] font-mono text-black/45 -mt-3">
            Platform Access Authorization · v{version}
          </div>
        </div>

        <div className="px-10 py-10">
          <div className="font-bold text-sm text-black mb-2">F1 Media Team Onboarding – Platform Access Authorization</div>
          <P>To properly optimize, monitor, and manage your digital presence, F1 Media Team requires visibility into the email accounts and administrative access connected to your website, search platforms, and social media properties.</P>
          <P>This ensures:</P>
          <UL items={[
            "Proper SEO configuration",
            "Accurate analytics tracking",
            "Search engine indexing",
            "Profile verification",
            "Campaign management",
            "Platform compliance",
            "Security continuity",
          ]} />

          <H2>Account Structure &amp; Access Policy</H2>
          <P>To streamline onboarding, prevent access delays, and ensure long-term operational continuity, F1 Media Team requires the creation of a dedicated marketing email address for your organization.</P>
          <P>This email will serve as the centralized administrative account for all digital platforms and marketing-related services.</P>

          <H2>Required Action</H2>
          <P>Please create a dedicated email address such as:</P>
          <UL items={[
            "seo@yourcompany.com",
            "marketing@yourcompany.com",
            "media@yourcompany.com",
            "social@yourcompany.com",
          ]} />

          <H2>Purpose of This Email</H2>
          <P>This account should:</P>
          <UL items={[
            "Be created under your company's domain",
            "Be owned by your company",
            "Have full administrative access to all digital platforms",
            "Be used exclusively for marketing and digital services",
          ]} />
          <P>This allows F1 Media Team to:</P>
          <UL items={[
            "Receive and accept platform invitations",
            "Verify search engine accounts",
            "Access analytics and webmaster tools",
            "Manage social media permissions",
            "Maintain secure and centralized control",
            "Avoid repeated credential requests",
          ]} />

          <H2>Platforms This Email Should Have Access To</H2>
          <P>Please assign this email administrative access to:</P>
          <UL items={[
            "Website CMS",
            "Hosting provider",
            "Domain registrar",
            "Google Analytics",
            "Google Search Console",
            "Google Business Profile",
            "Google Ads",
            "Microsoft / Bing Webmaster Tools",
            "Social media platforms (Instagram, Facebook, LinkedIn, X, YouTube, TikTok, Pinterest, Medium, Quora, Reddit, etc.)",
            "Any additional marketing or advertising platforms",
          ]} />

          <H2>Why This Is Required</H2>
          <P>Using a dedicated marketing email:</P>
          <UL items={[
            "Prevents disruptions if internal staff changes",
            "Eliminates back-and-forth access requests",
            "Protects personal employee accounts",
            "Improves security structure",
            "Simplifies scaling into future campaigns",
            "Creates a professional digital infrastructure",
          ]} />
          <P>This email will remain your property. F1 Media Team will only utilize granted administrative permissions necessary to execute the agreed-upon services.</P>
          <P className="font-medium">Please complete all applicable sections below.</P>

          {/* ===================== SECTION 1 ===================== */}
          <H2>1. Primary Administrative Email(s)</H2>
          <P>List all email addresses that currently hold administrative access to your digital platforms.</P>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-2">
            <Field label="Primary Admin Email" value={data.primary_admin_email ?? ""} onChange={(v) => set("primary_admin_email", v)} type="email" />
            <Field label="Username" value={data.primary_admin_username ?? ""} onChange={(v) => set("primary_admin_username", v)} />
            <Field label="Password" value={data.primary_admin_password ?? ""} onChange={(v) => set("primary_admin_password", v)} type="password" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <Field label="Secondary Admin Email(s)" value={data.secondary_admin_email ?? ""} onChange={(v) => set("secondary_admin_email", v)} type="email" />
            <Field label="Username" value={data.secondary_admin_username ?? ""} onChange={(v) => set("secondary_admin_username", v)} />
            <Field label="Password" value={data.secondary_admin_password ?? ""} onChange={(v) => set("secondary_admin_password", v)} type="password" />
          </div>
          <YesNo label="Is this email tied to Google services?"  value={data.primary_tied_to_google ?? ""}  onChange={(v) => set("primary_tied_to_google", v)} />
          <YesNo label="Is this email tied to website hosting?"  value={data.primary_tied_to_hosting ?? ""} onChange={(v) => set("primary_tied_to_hosting", v)} />

          {/* ===================== SECTION 2 ===================== */}
          <H2>2. Website &amp; Hosting Access</H2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <Field label="Website URL" value={data.website_url ?? ""} onChange={(v) => set("website_url", v)} placeholder="https://" />
            <Field label="Username" value={data.website_username ?? ""} onChange={(v) => set("website_username", v)} />
            <Field label="Password" value={data.website_password ?? ""} onChange={(v) => set("website_password", v)} type="password" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Domain Registrar (if known)" value={data.domain_registrar ?? ""} onChange={(v) => set("domain_registrar", v)} />
            <Field label="Hosting Provider (if known)" value={data.hosting_provider ?? ""} onChange={(v) => set("hosting_provider", v)} />
            <Field label="Primary Website Access Email" value={data.website_admin_email ?? ""} onChange={(v) => set("website_admin_email", v)} type="email" />
            <Field label="CMS Platform (WordPress, Webflow, Custom, etc.)" value={data.cms_platform ?? ""} onChange={(v) => set("cms_platform", v)} />
          </div>
          <div className="mt-3">
            <Field label="Developer Contact (if applicable)" value={data.developer_contact ?? ""} onChange={(v) => set("developer_contact", v)} />
          </div>

          {/* ===================== SECTION 3 ===================== */}
          <H2>3. Search Engine Accounts</H2>
          <H3>Google Accounts</H3>
          <Field label="Google Account Email (Admin)" value={data.google_admin_email ?? ""} onChange={(v) => set("google_admin_email", v)} type="email" />
          <P className="mt-3 mb-2">Access to the following:</P>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 text-sm text-black/85 mb-3">
            {[
              ["analytics",        "Google Analytics"],
              ["search_console",   "Google Search Console"],
              ["business_profile", "Google Business Profile"],
              ["ads",              "Google Ads"],
              ["tag_manager",      "Tag Manager"],
            ].map(([k, label]) => (
              <label key={k} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(data.google_access?.[k as keyof typeof data.google_access])}
                  onChange={(e) => setGoogleAccess(k, e.target.checked)}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <Field label="Other" value={(data.google_access?.other as string) ?? ""} onChange={(v) => setGoogleAccess("other", v)} />

          <H3>Microsoft / Bing Accounts</H3>
          <Field label="Microsoft Account Email (Admin)" value={data.microsoft_admin_email ?? ""} onChange={(v) => set("microsoft_admin_email", v)} type="email" />
          <P className="mt-3 mb-2">Access to:</P>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 text-sm text-black/85 mb-3">
            {[
              ["bing_webmaster", "Bing Webmaster Tools"],
              ["ads",            "Microsoft Ads"],
            ].map(([k, label]) => (
              <label key={k} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(data.microsoft_access?.[k as keyof typeof data.microsoft_access])}
                  onChange={(e) => setMsftAccess(k, e.target.checked)}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <Field label="Other" value={(data.microsoft_access?.other as string) ?? ""} onChange={(v) => setMsftAccess("other", v)} />

          {/* ===================== SECTION 4 ===================== */}
          <H2>4. Social Media Account Access</H2>
          <P>Please list the email address that holds administrative access for each platform.</P>
          <div className="font-bold text-sm text-black mb-3 flex justify-between">
            <span>Social Platforms</span>
            <span>Passwords</span>
          </div>

          {[
            { k: "instagram", name: "Instagram",   urlLabel: "Username/Handle" },
            { k: "facebook",  name: "Facebook",    urlLabel: "Username/Page URL" },
            { k: "linkedin",  name: "LinkedIn",    urlLabel: "Company Page URL" },
            { k: "x",         name: "X (Twitter)", urlLabel: "Username/Handle" },
            { k: "youtube",   name: "YouTube",     urlLabel: "Channel URL" },
            { k: "tiktok",    name: "TikTok",      urlLabel: "Username/Handle" },
            { k: "pinterest", name: "Pinterest",   urlLabel: "Username/Profile URL" },
            { k: "medium",    name: "Medium",      urlLabel: "Username/Profile URL" },
            { k: "quora",     name: "Quora",       urlLabel: "Username/Profile URL" },
            { k: "reddit",    name: "Reddit",      urlLabel: "Username / Profile URL" },
          ].map((p) => (
            <SocialBlock
              key={p.k}
              platform={p.name}
              urlLabel={p.urlLabel}
              urlVal={data.socials?.[p.k]?.username ?? ""}
              emailVal={data.socials?.[p.k]?.admin_email ?? ""}
              setUrl={(v) => setSocial(p.k, "username", v)}
              setEmail={(v) => setSocial(p.k, "admin_email", v)}
            />
          ))}

          <div className="mb-4">
            <div className="font-bold text-sm text-black mb-1.5">Other Platform:</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <Field label="Profile URL" value={data.socials?.other?.username ?? ""} onChange={(v) => setSocial("other", "username", v)} />
              <Field label="Admin Email" value={data.socials?.other?.admin_email ?? ""} onChange={(v) => setSocial("other", "admin_email", v)} type="email" />
            </div>
          </div>

          {/* ===================== SECTION 5 ===================== */}
          <H2>5. Access Authorization Preference</H2>
          <P>Please indicate your preferred access method:</P>
          <div className="space-y-2 text-sm text-black/85 mb-4">
            {AUTH_OPTIONS.map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="auth_pref"
                  checked={data.authorization_preference === opt.value}
                  onChange={() => set("authorization_preference", opt.value)}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
          {data.authorization_preference === "other" ? (
            <Field label="Please specify" value={data.authorization_other ?? ""} onChange={(v) => set("authorization_other", v)} />
          ) : null}

          {/* ===================== SECURITY NOTE ===================== */}
          <H2>Security Note</H2>
          <P>For security and compliance purposes, F1 Media Team recommends:</P>
          <UL items={[
            "Granting administrative access via email invitation when possible",
            "Avoiding long-term password sharing",
            "Enabling two-factor authentication",
            "Maintaining at least one internal administrator at all times",
          ]} />

          {/* ===================== TERMS + SUBMIT ===================== */}
          <div className="mt-8 rounded-md border border-black/15 bg-black/[0.03] p-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                className="mt-1"
              />
              <span className="text-sm leading-relaxed text-black/85">
                <strong>{userName},</strong> I confirm I have read this document and agree to
                F1 Media Team's <a href="#" className="text-blue-700 underline">Terms of Service</a> and
                {" "}<a href="#" className="text-blue-700 underline">Privacy Policy</a>. I authorize F1 Media Team
                to use the permissions provided above to execute the services we agreed upon, and I
                acknowledge that login activity on my account is recorded for security and audit purposes.
                <span className="block mt-1 text-[10px] text-black/50 font-mono uppercase tracking-widest">Version {version}</span>
              </span>
            </label>
          </div>

          <button
            type="submit"
            disabled={!accepted || pending}
            className="mt-5 w-full rounded-md bg-black py-3 text-sm font-semibold text-[var(--color-text)] transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pending ? "Saving…" : "Submit & enter dashboard"}
          </button>
        </div>
        </form>
      </div>
    </div>
  );
}
