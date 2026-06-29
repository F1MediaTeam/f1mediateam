// Renders a client's completed onboarding into a PDF that mirrors the
// in-app wizard popup — same headers, prose, and field layout, but with
// the client's answers populated inside each field "box" so the doc reads
// like the form they filled out.

import React from "react";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { OnboardingData } from "@/lib/types";

// ---------- styles ----------

const C = {
  ink:       "#0F172A",
  ink_soft:  "#374151",
  muted:     "#6B7280",
  subtle:    "#9CA3AF",
  border:    "#D7DCE3",
  fill_bg:   "#F5F7FA",
  card_bg:   "#FFFFFF",
  rule:      "#E5E7EB",
  brand:     "#3F8E84",
  brand_dim: "#5BA298",
  yes_bg:    "#E8F4F2",
  yes_fg:    "#1E5E55",
  page_bg:   "#FFFFFF",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 44,
    paddingBottom: 56,
    paddingHorizontal: 44,
    backgroundColor: C.page_bg,
    color: C.ink,
    fontFamily: "Helvetica",
    fontSize: 10.5,
    lineHeight: 1.45,
  },

  // section header (matches wizard's "SECTION X OF 6 — Title")
  sectionKicker: {
    fontSize: 8,
    letterSpacing: 2.5,
    color: C.muted,
    textTransform: "uppercase",
    textAlign: "center",
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: C.ink,
    textAlign: "center",
    marginBottom: 18,
  },
  sectionTitleRule: {
    borderBottomWidth: 1,
    borderColor: C.rule,
    marginBottom: 18,
  },

  // prose
  p: { fontSize: 10.5, color: C.ink_soft, marginBottom: 7 },
  pSmall: { fontSize: 9.5, color: C.muted, marginBottom: 6 },
  h2: { fontSize: 14, fontFamily: "Helvetica-Bold", color: C.ink, marginTop: 14, marginBottom: 6 },
  h3: { fontSize: 12, fontFamily: "Helvetica-Bold", color: C.ink, marginTop: 12, marginBottom: 6 },
  ulItem: { flexDirection: "row", marginBottom: 2 },
  ulBullet: { width: 12, color: C.muted },
  ulText: { flex: 1, fontSize: 10, color: C.ink_soft },

  // "Section card" with brand teal eyebrow + bordered body — mirrors the
  // green "<Section title>" headings in the wizard.
  sectionCardEyebrow: {
    fontSize: 8,
    letterSpacing: 2,
    color: C.brand,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    marginTop: 14,
    marginBottom: 4,
  },
  sectionCard: {
    borderWidth: 1,
    borderColor: C.rule,
    borderRadius: 8,
    padding: 12,
    backgroundColor: C.card_bg,
    marginBottom: 8,
  },

  // form fields — bordered "box" so the answer reads like a filled input
  fieldLabel: {
    fontSize: 8,
    letterSpacing: 1.5,
    color: C.muted,
    textTransform: "uppercase",
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
    marginTop: 6,
  },
  fieldBox: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
    backgroundColor: C.fill_bg,
    paddingHorizontal: 9,
    paddingVertical: 7,
    minHeight: 22,
  },
  fieldBoxArea: {
    minHeight: 46,
  },
  fieldValue: { fontSize: 10.5, color: C.ink },
  fieldValuePlaceholder: { fontSize: 10.5, color: C.subtle, fontStyle: "italic" },

  // inline row of yes/no or priority "pills"
  pillRow: { flexDirection: "row", alignItems: "center", marginTop: 2 },
  pill: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 2,
    fontSize: 9,
    color: C.muted,
    marginRight: 6,
  },
  pillOn: {
    borderColor: C.ink,
    backgroundColor: C.ink,
    color: "#FFFFFF",
  },
  pillBrand: {
    borderColor: C.brand,
    backgroundColor: C.yes_bg,
    color: C.yes_fg,
  },

  // checkbox row — mirrors wizard's "label + small box"
  checkboxRow: { flexDirection: "row", alignItems: "center", marginVertical: 2 },
  checkboxGlyph: {
    width: 11,
    height: 11,
    borderWidth: 1,
    borderColor: C.ink,
    borderRadius: 2,
    marginRight: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxGlyphOn: { backgroundColor: C.ink },
  checkboxMark: { color: "#FFFFFF", fontSize: 9, fontFamily: "Helvetica-Bold" },
  checkboxLabel: { fontSize: 10, color: C.ink_soft },

  // grid two-up — react-pdf uses flex by default, so we just use width 50%
  twoCol: { flexDirection: "row", marginHorizontal: -4 },
  twoColCell: { width: "50%", paddingHorizontal: 4 },

  // table-ish list rows (contacts, services, etc.)
  rowCard: {
    borderWidth: 1,
    borderColor: C.rule,
    borderRadius: 6,
    backgroundColor: C.card_bg,
    padding: 9,
    marginTop: 6,
  },
  rowCardTitle: {
    fontSize: 9,
    color: C.muted,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },

  // cover
  cover: { alignItems: "center", justifyContent: "center", paddingTop: 200 },
  brandMark: { fontSize: 9, letterSpacing: 4, color: C.muted, textTransform: "uppercase", marginBottom: 12 },
  coverTitle: { fontSize: 28, fontFamily: "Helvetica-Bold", color: C.ink, textAlign: "center", marginBottom: 12 },
  coverSub: { fontSize: 11, color: C.muted, textAlign: "center" },

  // footer
  footer: { position: "absolute", left: 44, right: 44, bottom: 22, color: C.subtle, fontSize: 8, flexDirection: "row", justifyContent: "space-between" },
});

// ---------- helpers ----------

const v = (s: unknown): string => {
  if (s == null) return "";
  const t = typeof s === "string" ? s : String(s);
  return t.trim();
};
const yn = (s: unknown): "yes" | "no" | "" => (s === "yes" ? "yes" : s === "no" ? "no" : "");
const isOn = (obj: Record<string, unknown> | undefined, key: string) => Boolean(obj?.[key]);

// ---------- form atoms (mirror wizard's Field / Area / YesNo / Priority / Checkbox) ----------

function FormField({ label, value, area = false }: { label: string; value: string; area?: boolean }) {
  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.fieldBox, area ? styles.fieldBoxArea : {}]}>
        {value ? (
          <Text style={styles.fieldValue}>{value}</Text>
        ) : (
          <Text style={styles.fieldValuePlaceholder}>—</Text>
        )}
      </View>
    </View>
  );
}

function PillRow({ label, options, value }: { label: string; options: { v: string; label: string }[]; value: string }) {
  return (
    <View style={{ marginTop: 6 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.pillRow}>
        {options.map((o) => (
          <Text
            key={o.v}
            style={[styles.pill, value === o.v ? styles.pillOn : {}]}
          >
            {o.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

function YesNoRow({ label, value }: { label: string; value: "yes" | "no" | "" }) {
  return (
    <PillRow
      label={label}
      options={[{ v: "yes", label: "YES" }, { v: "no", label: "NO" }]}
      value={value}
    />
  );
}

function PriorityRow({ label, value }: { label: string; value: string }) {
  return (
    <PillRow
      label={label}
      options={[{ v: "high", label: "HIGH" }, { v: "medium", label: "MEDIUM" }, { v: "low", label: "LOW" }]}
      value={value}
    />
  );
}

function CheckboxLine({ label, checked }: { label: string; checked: boolean }) {
  return (
    <View style={styles.checkboxRow}>
      <View style={[styles.checkboxGlyph, checked ? styles.checkboxGlyphOn : {}]}>
        {checked ? <Text style={styles.checkboxMark}>X</Text> : null}
      </View>
      <Text style={styles.checkboxLabel}>{label}</Text>
    </View>
  );
}

function SectionCard({ eyebrow, children }: { eyebrow: string; children: React.ReactNode }) {
  return (
    <>
      <Text style={styles.sectionCardEyebrow}>{eyebrow}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </>
  );
}

function TwoCol({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <View style={styles.twoCol}>
      <View style={styles.twoColCell}>{left}</View>
      <View style={styles.twoColCell}>{right}</View>
    </View>
  );
}

function UL({ items }: { items: string[] }) {
  return (
    <View style={{ marginBottom: 6 }}>
      {items.map((it, i) => (
        <View key={i} style={styles.ulItem}>
          <Text style={styles.ulBullet}>•</Text>
          <Text style={styles.ulText}>{it}</Text>
        </View>
      ))}
    </View>
  );
}

function PageHeader({ idx, title }: { idx: number; title: string }) {
  return (
    <>
      <Text style={styles.sectionKicker}>Section {idx + 1} of 6</Text>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionTitleRule} />
    </>
  );
}

function Footer({ page, total, client }: { page: number; total: number; client: string }) {
  return (
    <View style={styles.footer} fixed>
      <Text>{client} · F1 Media Onboarding</Text>
      <Text>{page} / {total}</Text>
    </View>
  );
}

// ---------- doc 1: account access ----------

function Doc1AccountAccess({ d }: { d: OnboardingData }) {
  const g = (d.google_access ?? {}) as Record<string, unknown>;
  const m = (d.microsoft_access ?? {}) as Record<string, unknown>;
  const socials = d.socials ?? {};
  const socialKeys: { key: string; label: string; urlLabel: string }[] = [
    { key: "instagram", label: "Instagram",     urlLabel: "Username / Handle" },
    { key: "facebook",  label: "Facebook",      urlLabel: "Username / Page URL" },
    { key: "linkedin",  label: "LinkedIn",      urlLabel: "Company Page URL" },
    { key: "x",         label: "X (Twitter)",   urlLabel: "Username / Handle" },
    { key: "youtube",   label: "YouTube",       urlLabel: "Channel URL" },
    { key: "tiktok",    label: "TikTok",        urlLabel: "Username / Handle" },
    { key: "pinterest", label: "Pinterest",     urlLabel: "Profile URL" },
    { key: "medium",    label: "Medium",        urlLabel: "Profile URL" },
    { key: "quora",     label: "Quora",         urlLabel: "Profile URL" },
    { key: "reddit",    label: "Reddit",        urlLabel: "Profile URL" },
    { key: "threads",   label: "Threads",       urlLabel: "Username / Handle" },
    { key: "tumblr",    label: "Tumblr",        urlLabel: "Profile URL" },
    { key: "other",     label: "Other platform", urlLabel: "Profile URL" },
  ];
  return (
    <>
      <Text style={styles.p}>
        To properly optimize, monitor, and manage your digital presence, F1 Media Team requires visibility into the email accounts and administrative access connected to your website, search platforms, and social media properties.
      </Text>

      <SectionCard eyebrow="1. Primary Administrative Email(s)">
        <Text style={styles.h3}>Primary user</Text>
        <FormField label="Email" value={v(d.primary_admin_email)} />
        <FormField label="Username" value={v(d.primary_admin_username)} />
        <FormField label="Password" value={d.primary_admin_password ? "[provided]" : ""} />
        <YesNoRow label="Tied to a Google account?" value={yn(d.primary_tied_to_google)} />
        <YesNoRow label="Tied to your hosting / domain?" value={yn(d.primary_tied_to_hosting)} />

        <Text style={styles.h3}>Secondary user</Text>
        <FormField label="Email" value={v(d.secondary_admin_email)} />
        <FormField label="Username" value={v(d.secondary_admin_username)} />
        <FormField label="Password" value={d.secondary_admin_password ? "[provided]" : ""} />
      </SectionCard>

      <SectionCard eyebrow="2. Website &amp; Hosting Access">
        <FormField label="Website URL" value={v(d.website_url)} />
        <TwoCol
          left={<FormField label="Website username" value={v(d.website_username)} />}
          right={<FormField label="Website password" value={d.website_password ? "[provided]" : ""} />}
        />
        <TwoCol
          left={<FormField label="Domain registrar (if known)" value={v(d.domain_registrar)} />}
          right={<FormField label="Hosting provider (if known)" value={v(d.hosting_provider)} />}
        />
        <TwoCol
          left={<FormField label="Primary website access email" value={v(d.website_admin_email)} />}
          right={<FormField label="CMS platform" value={v(d.cms_platform)} />}
        />
        <FormField label="Developer contact (if applicable)" value={v(d.developer_contact)} />
      </SectionCard>

      <SectionCard eyebrow="3. Search Engine Accounts">
        <Text style={styles.h3}>Google Accounts</Text>
        <FormField label="Google account email (admin)" value={v(d.google_admin_email)} />
        <Text style={styles.fieldLabel}>Access to the following:</Text>
        <View style={{ marginTop: 2 }}>
          <CheckboxLine label="Google Analytics"        checked={isOn(g, "analytics")} />
          <CheckboxLine label="Google Search Console"   checked={isOn(g, "search_console")} />
          <CheckboxLine label="Google Business Profile" checked={isOn(g, "business_profile")} />
          <CheckboxLine label="Google Ads"              checked={isOn(g, "ads")} />
          <CheckboxLine label="Tag Manager"             checked={isOn(g, "tag_manager")} />
        </View>
        <FormField label="Other" value={v((g as { other?: unknown }).other)} />

        <Text style={styles.h3}>Microsoft / Bing Accounts</Text>
        <FormField label="Microsoft account email (admin)" value={v(d.microsoft_admin_email)} />
        <Text style={styles.fieldLabel}>Access to:</Text>
        <View style={{ marginTop: 2 }}>
          <CheckboxLine label="Bing Webmaster Tools" checked={isOn(m, "bing_webmaster")} />
          <CheckboxLine label="Microsoft Ads"        checked={isOn(m, "ads")} />
        </View>
        <FormField label="Other" value={v((m as { other?: unknown }).other)} />
      </SectionCard>

      <SectionCard eyebrow="4. Social Media Account Access">
        <Text style={styles.pSmall}>Please list the email address that holds administrative access for each platform.</Text>
        {socialKeys.map(({ key, label, urlLabel }) => {
          const s = socials[key] ?? {};
          return (
            <View key={key} style={{ marginTop: 4 }}>
              <Text style={styles.h3}>{label}</Text>
              <TwoCol
                left={<FormField label={urlLabel} value={v(s.username)} />}
                right={<FormField label="Admin email" value={v(s.admin_email)} />}
              />
            </View>
          );
        })}
      </SectionCard>

      <SectionCard eyebrow="5. Authorization Preference">
        <Text style={styles.pSmall}>How would you like to grant access?</Text>
        <CheckboxLine label="Direct credential sharing"                checked={d.authorization_preference === "direct_credentials"} />
        <CheckboxLine label="Temporary password sharing"               checked={d.authorization_preference === "temporary_password"} />
        <CheckboxLine label="Administrative invite to F1 Media Team"   checked={d.authorization_preference === "admin_invite"} />
        <CheckboxLine label="Dedicated marketing email creation"       checked={d.authorization_preference === "dedicated_email"} />
        <CheckboxLine label="Other"                                    checked={d.authorization_preference === "other"} />
        {d.authorization_preference === "other" ? (
          <FormField label="Please specify" value={v(d.authorization_other)} />
        ) : null}
      </SectionCard>
    </>
  );
}

// ---------- doc 2: bio + performance ----------

function PerfChannel({
  label,
  active,
  fields,
}: {
  label: string;
  active: boolean | undefined;
  fields: React.ReactNode;
}) {
  return (
    <View style={{ marginTop: 8 }}>
      <CheckboxLine label={label} checked={Boolean(active)} />
      <View style={{ paddingLeft: 18, marginTop: 4 }}>{fields}</View>
    </View>
  );
}

function Doc2Bio({ d }: { d: OnboardingData }) {
  return (
    <>
      <Text style={styles.p}>
        Tell us about your company and how you&apos;ve historically gone to market — so we can build on what&apos;s already working and re-route effort away from what hasn&apos;t.
      </Text>

      <SectionCard eyebrow="1. Company Bio">
        <FormField label="Company bio" value={v(d.company_bio)} area />
      </SectionCard>

      <SectionCard eyebrow="2. Brand Positioning">
        <FormField label="What makes your firm different from other firms in your market?" value={v(d.brand_diff)} area />
        <FormField label="If a client had to describe your firm in three words, what would they say?" value={v(d.brand_3words)} />
      </SectionCard>

      <SectionCard eyebrow="3. Marketing Performance Analysis">
        <Text style={styles.h3}>Where Have You Seen the Most Success?</Text>
        <Text style={styles.pSmall}>Please indicate all that apply and explain why you believe it performed well.</Text>

        <PerfChannel
          label="Social Media"
          active={d.perf_social_active}
          fields={<>
            <FormField label="Platforms used" value={v(d.perf_social_used)} />
            <FormField label="Explanation" value={v(d.perf_social_explanation)} area />
          </>}
        />
        <PerfChannel
          label="Website"
          active={d.perf_website_active}
          fields={<>
            <FormField label="Website URL(s)" value={v(d.perf_website_url)} />
            <FormField label="Explanation" value={v(d.perf_website_explanation)} area />
          </>}
        />
        <PerfChannel
          label="Paid Advertising"
          active={d.perf_paid_active}
          fields={<>
            <FormField label="Platforms used (Google Ads, Meta, etc.)" value={v(d.perf_paid_platforms)} />
            <FormField label="Explanation" value={v(d.perf_paid_explanation)} area />
          </>}
        />
        <PerfChannel
          label="Podcast"
          active={d.perf_podcast_active}
          fields={<>
            <FormField label="Podcast name / platform" value={v(d.perf_podcast_name)} />
            <FormField label="Explanation" value={v(d.perf_podcast_explanation)} area />
          </>}
        />
        <PerfChannel
          label="Other"
          active={d.perf_other_active}
          fields={<>
            <FormField label="Channel / source" value={v(d.perf_other)} />
            <FormField label="Explanation" value={v(d.perf_other_explanation)} area />
          </>}
        />

        <Text style={styles.h3}>Where Have You Seen the Least Success?</Text>
        <Text style={styles.pSmall}>Please describe channels, campaigns, or efforts that did not produce desired results.</Text>
        <FormField label="Channel / Platform" value={v(d.perf_underperforming_channel)} />
        <FormField label="What was attempted" value={v(d.perf_underperforming_attempted)} />
        <FormField label="Why you believe it underperformed" value={v(d.perf_underperforming)} area />
        <FormField label="Additional notes" value={v(d.perf_additional_notes)} area />
      </SectionCard>

      <SectionCard eyebrow="4. Additional Strategic Insights (Optional but Recommended)">
        <FormField label="Who is your ideal client?" value={v(d.ideal_client)} area />
        <FormField label="What type of cases generate the highest revenue?" value={v(d.highest_revenue_cases)} area />
        <FormField label="What type of cases do you prefer not to take?" value={v(d.cases_to_avoid)} area />
        <FormField label="What markets feel saturated?" value={v(d.saturated_markets)} area />
        <FormField label="Where do you see the greatest growth opportunity?" value={v(d.growth_opportunity)} area />
      </SectionCard>
    </>
  );
}

// ---------- doc 3: contacts ----------

function Doc3Contacts({ d }: { d: OnboardingData }) {
  const contacts = d.contacts ?? [];
  return (
    <>
      <Text style={styles.p}>
        Authorized contacts and their responsibilities in this engagement.
      </Text>
      <SectionCard eyebrow="Authorized Contacts">
        {contacts.length === 0 ? (
          <Text style={styles.fieldValuePlaceholder}>No contacts provided.</Text>
        ) : (
          contacts.map((c, i) => (
            <View key={i} style={styles.rowCard}>
              <Text style={styles.rowCardTitle}>Contact #{i + 1}</Text>
              <TwoCol
                left={<FormField label="Full name" value={v(c.name)} />}
                right={<FormField label="Email" value={v(c.email)} />}
              />
              <TwoCol
                left={<FormField label="Phone" value={v(c.phone)} />}
                right={<FormField label="Role &amp; notes" value={v(c.role)} />}
              />
            </View>
          ))
        )}
      </SectionCard>
    </>
  );
}

// ---------- doc 4: strategy (informational) ----------

function Doc4Strategy() {
  return (
    <>
      <Text style={styles.p}>
        The F1 Media digital growth framework spans five pillars:
      </Text>
      <UL items={[
        "Authority & Visibility Foundation",
        "Search Engine Domination (SEO)",
        "Content & Media Engine",
        "Social Media Ecosystem",
        "Performance Tracking & Reporting",
      ]} />
      <Text style={styles.pSmall}>
        This page is informational — no fields are submitted. The client acknowledged the framework as part of completing onboarding.
      </Text>
    </>
  );
}

// ---------- doc 5: services & locations ----------

function Doc5Services({ d }: { d: OnboardingData }) {
  const svcs = d.services ?? [];
  const locs = d.service_locations ?? [];
  const counties = d.counties_served ?? [];
  const out = d.out_of_state ?? [];
  const pc = d.primary_city ?? {};
  const sw = d.statewide_coverage ?? {};
  return (
    <>
      <Text style={styles.p}>
        Services offered, the geographies they cover today, and where the firm is heading.
      </Text>

      <SectionCard eyebrow="1. List of Services">
        {svcs.length === 0 ? (
          <Text style={styles.fieldValuePlaceholder}>—</Text>
        ) : (
          svcs.map((s, i) => (
            <View key={i} style={styles.rowCard}>
              <Text style={styles.rowCardTitle}>Service #{i + 1}</Text>
              <FormField label="Service name" value={v(s.name)} />
              <FormField label="Description" value={v(s.description)} area />
              <FormField label="Audience" value={v(s.audience)} />
              <PriorityRow label="Priority" value={v(s.priority)} />
            </View>
          ))
        )}
      </SectionCard>

      <SectionCard eyebrow="2. Primary City / Headquarters">
        <FormField label="City" value={v(pc.name)} />
        <YesNoRow label="Do you have a physical office in this city?" value={yn(pc.has_office)} />
        <FormField label="Office address" value={v(pc.office_address)} />
        <YesNoRow label="Do you provide virtual service from this city?" value={yn(pc.virtual_service)} />
        <PriorityRow label="Priority" value={v(pc.priority)} />
        <YesNoRow label="Is this your primary revenue market?" value={yn(pc.revenue_market)} />
        <FormField label="Notes" value={v(pc.notes)} area />
      </SectionCard>

      <SectionCard eyebrow="3. Surrounding Cities Served">
        {locs.length === 0 ? (
          <Text style={styles.fieldValuePlaceholder}>—</Text>
        ) : (
          locs.map((l, i) => (
            <View key={i} style={styles.rowCard}>
              <Text style={styles.rowCardTitle}>City #{i + 1}</Text>
              <FormField label="City" value={v(l.city)} />
              <YesNoRow label="Office in this city?" value={yn(l.has_office)} />
              <PriorityRow label="Priority" value={v(l.priority)} />
              <FormField label="Notes" value={v(l.notes)} area />
            </View>
          ))
        )}
      </SectionCard>

      <SectionCard eyebrow="4. Counties Served">
        {counties.length === 0 ? (
          <Text style={styles.fieldValuePlaceholder}>—</Text>
        ) : (
          counties.map((c, i) => (
            <View key={i} style={styles.rowCard}>
              <Text style={styles.rowCardTitle}>County #{i + 1}</Text>
              <FormField label="County" value={v(c.name)} />
              <YesNoRow label="Office in this county?" value={yn(c.office_in_county)} />
              <PriorityRow label="Priority" value={v(c.priority)} />
              <FormField label="Notes" value={v(c.notes)} area />
            </View>
          ))
        )}
      </SectionCard>

      <SectionCard eyebrow="5. Statewide Coverage (if applicable)">
        <YesNoRow label="Do you provide services statewide?" value={yn(sw.provides)} />
        <FormField label="If yes, please specify limitations or exclusions" value={v(sw.limitations)} area />
        <PriorityRow label="Priority level for statewide visibility" value={v(sw.priority)} />
      </SectionCard>

      <SectionCard eyebrow="6. Out-of-State Representation (if applicable)">
        {out.length === 0 ? (
          <Text style={styles.fieldValuePlaceholder}>—</Text>
        ) : (
          out.map((o, i) => (
            <View key={i} style={styles.rowCard}>
              <Text style={styles.rowCardTitle}>State #{i + 1}</Text>
              <FormField label="State" value={v(o.state)} />
              <FormField label="Service type provided in this state" value={v(o.service_type)} />
              <YesNoRow label="Licensed to practice in this state?" value={yn(o.licensed)} />
              <YesNoRow label="Physical office in this state?" value={yn(o.office)} />
              <PriorityRow label="Priority" value={v(o.priority)} />
              <FormField label="Notes" value={v(o.notes)} area />
            </View>
          ))
        )}
      </SectionCard>

      <SectionCard eyebrow="7. Future Expansion Targets">
        <FormField label="List cities, counties, or states you plan to expand into within the next 6–24 months" value={v(d.future_expansion_targets)} area />
        <FormField label="Estimated expansion timeline (if known)" value={v(d.future_expansion_timeline)} />
      </SectionCard>

      <SectionCard eyebrow="8. Market Focus">
        <FormField label="Main city or multiple equally?" value={v(d.market_focus_main_city)} area />
        <FormField label="Competing against large firms or local boutiques?" value={v(d.market_focus_competition)} area />
        <FormField label="Which cities do you want to dominate first?" value={v(d.market_focus_priority_cities)} area />
        <FormField label="Markets to avoid" value={v(d.market_focus_avoid)} area />
      </SectionCard>
    </>
  );
}

// ---------- doc 6: brand assets + terms ----------

function Doc6Assets({ d, accepted, termsVersion }: { d: OnboardingData; accepted: boolean; termsVersion: string }) {
  const files = d.uploaded_asset_filenames ?? [];
  return (
    <>
      <Text style={styles.p}>
        Visual identity assets and the terms acknowledgement signed at submission.
      </Text>

      <SectionCard eyebrow="1. Brand Guidelines">
        <TwoCol
          left={<FormField label="Brand color (HEX / RGB)" value={v(d.brand_color_hex)} />}
          right={<FormField label="Typography / fonts" value={v(d.brand_fonts)} />}
        />
        <FormField label="Notes / brand guidelines" value={v(d.brand_guidelines_notes)} area />
      </SectionCard>

      <SectionCard eyebrow="2. Uploaded Brand Assets">
        {files.length === 0 ? (
          <Text style={styles.fieldValuePlaceholder}>No files were attached.</Text>
        ) : (
          <View>
            {files.map((f, i) => (
              <View key={i} style={styles.checkboxRow}>
                <Text style={styles.ulBullet}>•</Text>
                <Text style={styles.checkboxLabel}>{f}</Text>
              </View>
            ))}
          </View>
        )}
      </SectionCard>

      <SectionCard eyebrow="3. Terms Acknowledgement">
        <CheckboxLine label={`I have read and agree to the F1 Media portal terms (version ${termsVersion}).`} checked={accepted} />
      </SectionCard>
    </>
  );
}

// ---------- main entry ----------

interface Props {
  clientName: string;
  submittedAt: string;
  data: OnboardingData;
  termsVersion: string;
  /** "City, Region, Country" derived from Vercel edge geo headers. */
  submittedLocation?: string | null;
  /** Originating IP if available — printed in fine print on the cover. */
  submittedIp?: string | null;
}

export async function renderOnboardingPdf(props: Props): Promise<Buffer> {
  const { clientName, submittedAt, data, termsVersion, submittedLocation, submittedIp } = props;
  const submitted = new Date(submittedAt);
  const date = submitted.toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" });
  const iso = submitted.toISOString();

  const doc = (
    <Document title={`${clientName} — F1 Media Onboarding`} author="F1 Media Team">
      <Page size="LETTER" style={styles.page}>
        <View style={styles.cover}>
          <Text style={styles.brandMark}>F1 Media Team · Onboarding</Text>
          <Text style={styles.coverTitle}>{clientName}</Text>
          <Text style={styles.coverSub}>Submitted {date}</Text>
          {submittedLocation ? (
            <Text style={[styles.coverSub, { marginTop: 4 }]}>Location: {submittedLocation}</Text>
          ) : null}
          <Text style={[styles.coverSub, { marginTop: 4, fontSize: 9, color: C.subtle }]}>{iso}{submittedIp ? `  ·  IP ${submittedIp}` : ""}</Text>
          <Text style={[styles.coverSub, { marginTop: 10 }]}>Terms accepted · v{termsVersion}</Text>
        </View>
        <Footer page={1} total={7} client={clientName} />
      </Page>

      <Page size="LETTER" style={styles.page}>
        <PageHeader idx={0} title="Digital Account Access &amp; Administrative Permissions" />
        <Doc1AccountAccess d={data} />
        <Footer page={2} total={7} client={clientName} />
      </Page>

      <Page size="LETTER" style={styles.page}>
        <PageHeader idx={1} title="Company Bio &amp; Performance Insights" />
        <Doc2Bio d={data} />
        <Footer page={3} total={7} client={clientName} />
      </Page>

      <Page size="LETTER" style={styles.page}>
        <PageHeader idx={2} title="Primary Contact &amp; Communication Directory" />
        <Doc3Contacts d={data} />
        <Footer page={4} total={7} client={clientName} />
      </Page>

      <Page size="LETTER" style={styles.page}>
        <PageHeader idx={3} title="Digital Authority &amp; Growth Strategy" />
        <Doc4Strategy />
        <Footer page={5} total={7} client={clientName} />
      </Page>

      <Page size="LETTER" style={styles.page}>
        <PageHeader idx={4} title="List of Services &amp; Service Locations" />
        <Doc5Services d={data} />
        <Footer page={6} total={7} client={clientName} />
      </Page>

      <Page size="LETTER" style={styles.page}>
        <PageHeader idx={5} title="Brand Assets &amp; Media Files Required" />
        <Doc6Assets d={data} accepted={true} termsVersion={termsVersion} />
        <Footer page={7} total={7} client={clientName} />
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}
