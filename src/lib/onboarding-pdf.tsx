// Renders a client's completed onboarding into a PDF that mirrors the
// in-app wizard popup — same headers, prose, and field layout, but with
// the client's answers populated inside each field "box" so the doc reads
// like the form they filled out.

import fs from "node:fs";
import path from "node:path";
import React from "react";
import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { OnboardingData } from "@/lib/types";

// Disable react-pdf's default hyphenation so long page titles wrap at word
// boundaries instead of breaking words like "Permis-sions".
Font.registerHyphenationCallback((word) => [word]);

// Read the F1 Media logo once per cold start — react-pdf accepts a Buffer
// or a data: URI. We use a Buffer so the file ships into the lambda via
// outputFileTracingIncludes in next.config.ts.
let LOGO_BUFFER: Buffer | null = null;
function loadLogo(): Buffer | null {
  if (LOGO_BUFFER) return LOGO_BUFFER;
  try {
    LOGO_BUFFER = fs.readFileSync(path.join(process.cwd(), "public", "logo-dark.png"));
    return LOGO_BUFFER;
  } catch {
    return null;
  }
}

// ---------- color tokens ----------

const C = {
  ink:       "#0F172A",
  ink_soft:  "#374151",
  muted:     "#6B7280",
  subtle:    "#9CA3AF",
  border:    "#D7DCE3",
  fill_bg:   "#F5F7FA",
  rule:      "#E5E7EB",
  brand:     "#3F8E84",
  yes_bg:    "#E8F4F2",
  yes_fg:    "#1E5E55",
};

const styles = StyleSheet.create({
  page: {
    // The wizard popup is rendered against a white rounded card on a
    // darker page. Inside that card the top is a gray "chrome" band and
    // the body is white. To mirror that in a PDF page, we use no outer
    // padding — the gray header sits flush at the top — and the body
    // content has its own horizontal padding via the bodyPad container.
    paddingTop: 0,
    paddingBottom: 56,
    paddingHorizontal: 0,
    backgroundColor: "#FFFFFF",
    color: C.ink,
    fontFamily: "Helvetica",
    fontSize: 10.5,
    lineHeight: 1.45,
  },

  // The gray header chrome from the wizard popup: F1 logo on the left,
  // "ONBOARDING" eyebrow + welcome line + progress dots on the right,
  // sitting against a soft gray block.
  pageBand: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#C8CACE",
    paddingHorizontal: 28,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderColor: "rgba(0,0,0,0.10)",
  },
  pageBandLogo: { width: 220, height: 58, objectFit: "contain" },
  pageBandLogoFallback: { fontSize: 22, fontFamily: "Helvetica-Bold", color: C.ink, letterSpacing: 2 },
  pageBandRightCol: { alignItems: "flex-end" },
  pageBandEyebrow: {
    fontSize: 8,
    letterSpacing: 4,
    color: "rgba(0,0,0,0.55)",
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
  },
  pageBandWelcome: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: C.ink,
    marginTop: 3,
  },
  pageBandTimestamp: {
    fontSize: 8,
    color: "rgba(0,0,0,0.55)",
    marginTop: 2,
  },
  progressDotsRow: { flexDirection: "row", marginTop: 6 },
  progressDot: { height: 4, borderRadius: 2, marginLeft: 3 },
  progressDotInactive: { width: 14, backgroundColor: "rgba(0,0,0,0.18)" },
  progressDotPast:     { width: 14, backgroundColor: "rgba(63,142,132,0.55)" },
  progressDotCurrent:  { width: 26, backgroundColor: C.brand },

  // Padded inner body that holds the wizard content. The PDF body grid
  // matches the wizard's px-10 in the popup.
  bodyPad: { paddingHorizontal: 36, paddingTop: 28 },

  sectionKicker: {
    fontSize: 8,
    letterSpacing: 4,
    color: "rgba(0,0,0,0.45)",
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    textAlign: "center",
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: C.ink,
    textAlign: "center",
    marginBottom: 4,
    letterSpacing: -0.2,
  },
  sectionTitleRule: {
    borderBottomWidth: 1,
    borderColor: "rgba(0,0,0,0.10)",
    marginTop: 18,
    marginBottom: 16,
  },

  p: { fontSize: 10.5, color: C.ink_soft, marginBottom: 7 },
  pSmall: { fontSize: 9.5, color: C.muted, marginBottom: 6 },
  h3: { fontSize: 12, fontFamily: "Helvetica-Bold", color: C.ink, marginTop: 12, marginBottom: 6 },

  ulItem: { flexDirection: "row", marginBottom: 2 },
  ulBullet: { width: 12, color: C.muted },
  ulText: { flex: 1, fontSize: 10, color: C.ink_soft },

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
    backgroundColor: "#FFFFFF",
    marginBottom: 8,
  },

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

  pillRow: { flexDirection: "row", alignItems: "center", marginTop: 2 },
  pill: {
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.30)",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.5,
    color: "rgba(0,0,0,0.60)",
    marginRight: 6,
  },
  pillOn: { borderColor: C.ink, backgroundColor: C.ink, color: "#FFFFFF" },

  checkboxRow: { flexDirection: "row", alignItems: "center", marginVertical: 2 },
  checkboxGlyph: {
    width: 14,
    height: 14,
    borderWidth: 1,
    borderColor: C.ink,
    borderRadius: 2,
    marginRight: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 1,
  },
  checkboxGlyphOn: { backgroundColor: C.ink },
  checkboxMark: { color: "#FFFFFF", fontSize: 10, fontFamily: "Helvetica-Bold", lineHeight: 1, textAlign: "center" },
  checkboxLabel: { fontSize: 10, color: C.ink_soft },

  twoCol: { flexDirection: "row", marginHorizontal: -4 },
  twoColCell: { width: "50%", paddingHorizontal: 4 },

  rowCard: {
    borderWidth: 1,
    borderColor: C.rule,
    borderRadius: 6,
    backgroundColor: "#FFFFFF",
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

  footer: {
    position: "absolute",
    left: 44,
    right: 44,
    bottom: 22,
    color: C.subtle,
    fontSize: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

// ---------- helpers ----------

const safeStr = (s: unknown): string => {
  if (s == null) return "";
  const t = typeof s === "string" ? s : String(s);
  return t.trim();
};
const yn = (s: unknown): "yes" | "no" | "" => (s === "yes" ? "yes" : s === "no" ? "no" : "");
const isOn = (obj: Record<string, unknown> | undefined, key: string) => Boolean(obj?.[key]);

// ---------- atoms ----------

function FormField({ label, value, area = false }: { label: string; value: string; area?: boolean }) {
  const boxStyle = area ? [styles.fieldBox, styles.fieldBoxArea] : styles.fieldBox;
  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={boxStyle}>
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
          <Text key={o.v} style={value === o.v ? [styles.pill, styles.pillOn] : styles.pill}>
            {o.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

function YesNoRow({ label, value }: { label: string; value: "yes" | "no" | "" }) {
  return <PillRow label={label} options={[{ v: "yes", label: "YES" }, { v: "no", label: "NO" }]} value={value} />;
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
  const glyphStyle = checked ? [styles.checkboxGlyph, styles.checkboxGlyphOn] : styles.checkboxGlyph;
  return (
    <View style={styles.checkboxRow}>
      <View style={glyphStyle}>
        {checked ? <Text style={styles.checkboxMark}>X</Text> : null}
      </View>
      <Text style={styles.checkboxLabel}>{label}</Text>
    </View>
  );
}

function SectionCard({ eyebrow, children }: { eyebrow: string; children: React.ReactNode }) {
  return (
    <View>
      <Text style={styles.sectionCardEyebrow}>{eyebrow}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
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

function PageBand({
  clientName,
  submittedLine,
  pageIdx,
  totalPages,
  logoBuf,
}: {
  clientName: string;
  submittedLine: string;
  pageIdx: number;
  totalPages: number;
  logoBuf: Buffer | null;
}) {
  return (
    <View style={styles.pageBand}>
      {logoBuf ? (
        <Image src={logoBuf as unknown as string} style={styles.pageBandLogo} />
      ) : (
        <Text style={styles.pageBandLogoFallback}>F1 / MEDIA TEAM</Text>
      )}
      <View style={styles.pageBandRightCol}>
        <Text style={styles.pageBandEyebrow}>ONBOARDING</Text>
        <Text style={styles.pageBandWelcome}>{clientName}</Text>
        <Text style={styles.pageBandTimestamp}>{submittedLine}</Text>
        <View style={styles.progressDotsRow}>
          {Array.from({ length: totalPages }).map((_, i) => {
            const dotStyle =
              i === pageIdx
                ? [styles.progressDot, styles.progressDotCurrent]
                : i < pageIdx
                ? [styles.progressDot, styles.progressDotPast]
                : [styles.progressDot, styles.progressDotInactive];
            return <View key={i} style={dotStyle} />;
          })}
        </View>
      </View>
    </View>
  );
}

function PageHeader({ idx, title }: { idx: number; title: string }) {
  return (
    <View>
      <Text style={styles.sectionKicker}>Section {idx + 1} of 6</Text>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionTitleRule} />
    </View>
  );
}

function Footer({ page, total }: { page: number; total: number }) {
  return (
    <View style={styles.footer} fixed>
      <Text>Page {page} of {total}</Text>
      <Text>F1 Media Onboarding</Text>
    </View>
  );
}

// ---------- section 1: account access ----------

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
    <View>
      <Text style={styles.p}>
        To properly optimize, monitor, and manage your digital presence, F1 Media Team requires visibility into the email accounts and administrative access connected to your website, search platforms, and social media properties.
      </Text>

      <SectionCard eyebrow="1. Primary Administrative Email(s)">
        <Text style={styles.h3}>Primary user</Text>
        <FormField label="Email" value={safeStr(d.primary_admin_email)} />
        <FormField label="Username" value={safeStr(d.primary_admin_username)} />
        <FormField label="Password" value={d.primary_admin_password ? "[provided]" : ""} />
        <YesNoRow label="Tied to a Google account?" value={yn(d.primary_tied_to_google)} />
        <YesNoRow label="Tied to your hosting / domain?" value={yn(d.primary_tied_to_hosting)} />

        <Text style={styles.h3}>Secondary user</Text>
        <FormField label="Email" value={safeStr(d.secondary_admin_email)} />
        <FormField label="Username" value={safeStr(d.secondary_admin_username)} />
        <FormField label="Password" value={d.secondary_admin_password ? "[provided]" : ""} />
      </SectionCard>

      <SectionCard eyebrow="2. Website and Hosting Access">
        <FormField label="Website URL" value={safeStr(d.website_url)} />
        <TwoCol
          left={<FormField label="Website username" value={safeStr(d.website_username)} />}
          right={<FormField label="Website password" value={d.website_password ? "[provided]" : ""} />}
        />
        <TwoCol
          left={<FormField label="Domain registrar (if known)" value={safeStr(d.domain_registrar)} />}
          right={<FormField label="Hosting provider (if known)" value={safeStr(d.hosting_provider)} />}
        />
        <TwoCol
          left={<FormField label="Primary website access email" value={safeStr(d.website_admin_email)} />}
          right={<FormField label="CMS platform" value={safeStr(d.cms_platform)} />}
        />
        <FormField label="Developer contact (if applicable)" value={safeStr(d.developer_contact)} />
      </SectionCard>

      <SectionCard eyebrow="3. Search Engine Accounts">
        <Text style={styles.h3}>Google Accounts</Text>
        <FormField label="Google account email (admin)" value={safeStr(d.google_admin_email)} />
        <Text style={styles.fieldLabel}>Access to the following:</Text>
        <View>
          <CheckboxLine label="Google Analytics"        checked={isOn(g, "analytics")} />
          <CheckboxLine label="Google Search Console"   checked={isOn(g, "search_console")} />
          <CheckboxLine label="Google Business Profile" checked={isOn(g, "business_profile")} />
          <CheckboxLine label="Google Ads"              checked={isOn(g, "ads")} />
          <CheckboxLine label="Tag Manager"             checked={isOn(g, "tag_manager")} />
        </View>
        <FormField label="Other" value={safeStr((g as { other?: unknown }).other)} />

        <Text style={styles.h3}>Microsoft / Bing Accounts</Text>
        <FormField label="Microsoft account email (admin)" value={safeStr(d.microsoft_admin_email)} />
        <Text style={styles.fieldLabel}>Access to:</Text>
        <View>
          <CheckboxLine label="Bing Webmaster Tools" checked={isOn(m, "bing_webmaster")} />
          <CheckboxLine label="Microsoft Ads"        checked={isOn(m, "ads")} />
        </View>
        <FormField label="Other" value={safeStr((m as { other?: unknown }).other)} />
      </SectionCard>

      <SectionCard eyebrow="4. Social Media Account Access">
        <Text style={styles.pSmall}>Please list the email address that holds administrative access for each platform.</Text>
        {socialKeys.map(({ key, label, urlLabel }) => {
          const s = socials[key] ?? {};
          return (
            <View key={key} wrap={false} style={{ marginTop: 4 }}>
              <Text style={styles.h3}>{label}</Text>
              <TwoCol
                left={<FormField label={urlLabel} value={safeStr(s.username)} />}
                right={<FormField label="Admin email" value={safeStr(s.admin_email)} />}
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
          <FormField label="Please specify" value={safeStr(d.authorization_other)} />
        ) : null}
      </SectionCard>
    </View>
  );
}

// ---------- section 2: bio + performance ----------

function PerfChannel({ label, active, fields }: { label: string; active: boolean | undefined; fields: React.ReactNode }) {
  return (
    <View wrap={false} style={{ marginTop: 8 }}>
      <CheckboxLine label={label} checked={Boolean(active)} />
      <View style={{ paddingLeft: 18, marginTop: 4 }}>{fields}</View>
    </View>
  );
}

function Doc2Bio({ d }: { d: OnboardingData }) {
  return (
    <View>
      <Text style={styles.p}>
        Tell us about your company and how you have historically gone to market — so we can build on what is already working and re-route effort away from what has not.
      </Text>

      <SectionCard eyebrow="1. Company Bio">
        <FormField label="Company bio" value={safeStr(d.company_bio)} area />
      </SectionCard>

      <SectionCard eyebrow="2. Brand Positioning">
        <FormField label="What makes your firm different from other firms in your market?" value={safeStr(d.brand_diff)} area />
        <FormField label="If a client had to describe your firm in three words, what would they say?" value={safeStr(d.brand_3words)} />
      </SectionCard>

      <SectionCard eyebrow="3. Marketing Performance Analysis">
        <Text style={styles.h3}>Where Have You Seen the Most Success?</Text>
        <Text style={styles.pSmall}>Please indicate all that apply and explain why you believe it performed well.</Text>

        <PerfChannel
          label="Social Media"
          active={d.perf_social_active}
          fields={<View>
            <FormField label="Platforms used" value={safeStr(d.perf_social_used)} />
            <FormField label="Explanation" value={safeStr(d.perf_social_explanation)} area />
          </View>}
        />
        <PerfChannel
          label="Website"
          active={d.perf_website_active}
          fields={<View>
            <FormField label="Website URL(s)" value={safeStr(d.perf_website_url)} />
            <FormField label="Explanation" value={safeStr(d.perf_website_explanation)} area />
          </View>}
        />
        <PerfChannel
          label="Paid Advertising"
          active={d.perf_paid_active}
          fields={<View>
            <FormField label="Platforms used (Google Ads, Meta, etc.)" value={safeStr(d.perf_paid_platforms)} />
            <FormField label="Explanation" value={safeStr(d.perf_paid_explanation)} area />
          </View>}
        />
        <PerfChannel
          label="Podcast"
          active={d.perf_podcast_active}
          fields={<View>
            <FormField label="Podcast name / platform" value={safeStr(d.perf_podcast_name)} />
            <FormField label="Explanation" value={safeStr(d.perf_podcast_explanation)} area />
          </View>}
        />
        <PerfChannel
          label="Other"
          active={d.perf_other_active}
          fields={<View>
            <FormField label="Channel / source" value={safeStr(d.perf_other)} />
            <FormField label="Explanation" value={safeStr(d.perf_other_explanation)} area />
          </View>}
        />

        <Text style={styles.h3}>Where Have You Seen the Least Success?</Text>
        <Text style={styles.pSmall}>Please describe channels, campaigns, or efforts that did not produce desired results.</Text>
        <FormField label="Channel / Platform" value={safeStr(d.perf_underperforming_channel)} />
        <FormField label="What was attempted" value={safeStr(d.perf_underperforming_attempted)} />
        <FormField label="Why you believe it underperformed" value={safeStr(d.perf_underperforming)} area />
        <FormField label="Additional notes" value={safeStr(d.perf_additional_notes)} area />
      </SectionCard>

      <SectionCard eyebrow="4. Additional Strategic Insights (Optional but Recommended)">
        <FormField label="Who is your ideal client?" value={safeStr(d.ideal_client)} area />
        <FormField label="What type of cases generate the highest revenue?" value={safeStr(d.highest_revenue_cases)} area />
        <FormField label="What type of cases do you prefer not to take?" value={safeStr(d.cases_to_avoid)} area />
        <FormField label="What markets feel saturated?" value={safeStr(d.saturated_markets)} area />
        <FormField label="Where do you see the greatest growth opportunity?" value={safeStr(d.growth_opportunity)} area />
      </SectionCard>
    </View>
  );
}

// ---------- section 3: contacts ----------

function Doc3Contacts({ d }: { d: OnboardingData }) {
  const contacts = d.contacts ?? [];
  return (
    <View>
      <Text style={styles.p}>Authorized contacts and their responsibilities in this engagement.</Text>
      <SectionCard eyebrow="Authorized Contacts">
        {contacts.length === 0 ? (
          <Text style={styles.fieldValuePlaceholder}>No contacts provided.</Text>
        ) : (
          contacts.map((c, i) => (
            <View key={i} wrap={false} style={styles.rowCard}>
              <Text style={styles.rowCardTitle}>Contact #{i + 1}</Text>
              <TwoCol
                left={<FormField label="Full name" value={safeStr(c.name)} />}
                right={<FormField label="Email" value={safeStr(c.email)} />}
              />
              <TwoCol
                left={<FormField label="Phone" value={safeStr(c.phone)} />}
                right={<FormField label="Role and notes" value={safeStr(c.role)} />}
              />
            </View>
          ))
        )}
      </SectionCard>
    </View>
  );
}

// ---------- section 4: strategy (informational) ----------

function Doc4Strategy() {
  return (
    <View>
      <Text style={styles.p}>The F1 Media digital growth framework spans five pillars:</Text>
      <UL items={[
        "Authority and Visibility Foundation",
        "Search Engine Domination (SEO)",
        "Content and Media Engine",
        "Social Media Ecosystem",
        "Performance Tracking and Reporting",
      ]} />
      <Text style={styles.pSmall}>
        This page is informational — no fields are submitted. The client acknowledged the framework as part of completing onboarding.
      </Text>
    </View>
  );
}

// ---------- section 5: services and locations ----------

function Doc5Services({ d }: { d: OnboardingData }) {
  const svcs = d.services ?? [];
  const locs = d.service_locations ?? [];
  const counties = d.counties_served ?? [];
  const out = d.out_of_state ?? [];
  const pc = d.primary_city ?? {};
  const sw = d.statewide_coverage ?? {};
  return (
    <View>
      <Text style={styles.p}>Services offered, the geographies they cover today, and where the firm is heading.</Text>

      <SectionCard eyebrow="1. List of Services">
        {svcs.length === 0 ? (
          <Text style={styles.fieldValuePlaceholder}>—</Text>
        ) : (
          svcs.map((s, i) => (
            <View key={i} wrap={false} style={styles.rowCard}>
              <Text style={styles.rowCardTitle}>Service #{i + 1}</Text>
              <FormField label="Service name" value={safeStr(s.name)} />
              <FormField label="Description" value={safeStr(s.description)} area />
              <FormField label="Audience" value={safeStr(s.audience)} />
              <PriorityRow label="Priority" value={safeStr(s.priority)} />
            </View>
          ))
        )}
      </SectionCard>

      <SectionCard eyebrow="2. Primary City / Headquarters">
        <FormField label="City" value={safeStr(pc.name)} />
        <YesNoRow label="Do you have a physical office in this city?" value={yn(pc.has_office)} />
        <FormField label="Office address" value={safeStr(pc.office_address)} />
        <YesNoRow label="Do you provide virtual service from this city?" value={yn(pc.virtual_service)} />
        <PriorityRow label="Priority" value={safeStr(pc.priority)} />
        <YesNoRow label="Is this your primary revenue market?" value={yn(pc.revenue_market)} />
        <FormField label="Notes" value={safeStr(pc.notes)} area />
      </SectionCard>

      <SectionCard eyebrow="3. Surrounding Cities Served">
        {locs.length === 0 ? (
          <Text style={styles.fieldValuePlaceholder}>—</Text>
        ) : (
          locs.map((l, i) => (
            <View key={i} wrap={false} style={styles.rowCard}>
              <Text style={styles.rowCardTitle}>City #{i + 1}</Text>
              <FormField label="City" value={safeStr(l.city)} />
              <YesNoRow label="Office in this city?" value={yn(l.has_office)} />
              <PriorityRow label="Priority" value={safeStr(l.priority)} />
              <FormField label="Notes" value={safeStr(l.notes)} area />
            </View>
          ))
        )}
      </SectionCard>

      <SectionCard eyebrow="4. Counties Served">
        {counties.length === 0 ? (
          <Text style={styles.fieldValuePlaceholder}>—</Text>
        ) : (
          counties.map((c, i) => (
            <View key={i} wrap={false} style={styles.rowCard}>
              <Text style={styles.rowCardTitle}>County #{i + 1}</Text>
              <FormField label="County" value={safeStr(c.name)} />
              <YesNoRow label="Office in this county?" value={yn(c.office_in_county)} />
              <PriorityRow label="Priority" value={safeStr(c.priority)} />
              <FormField label="Notes" value={safeStr(c.notes)} area />
            </View>
          ))
        )}
      </SectionCard>

      <SectionCard eyebrow="5. Statewide Coverage (if applicable)">
        <YesNoRow label="Do you provide services statewide?" value={yn(sw.provides)} />
        <FormField label="If yes, please specify limitations or exclusions" value={safeStr(sw.limitations)} area />
        <PriorityRow label="Priority level for statewide visibility" value={safeStr(sw.priority)} />
      </SectionCard>

      <SectionCard eyebrow="6. Out-of-State Representation (if applicable)">
        {out.length === 0 ? (
          <Text style={styles.fieldValuePlaceholder}>—</Text>
        ) : (
          out.map((o, i) => (
            <View key={i} wrap={false} style={styles.rowCard}>
              <Text style={styles.rowCardTitle}>State #{i + 1}</Text>
              <FormField label="State" value={safeStr(o.state)} />
              <FormField label="Service type provided in this state" value={safeStr(o.service_type)} />
              <YesNoRow label="Licensed to practice in this state?" value={yn(o.licensed)} />
              <YesNoRow label="Physical office in this state?" value={yn(o.office)} />
              <PriorityRow label="Priority" value={safeStr(o.priority)} />
              <FormField label="Notes" value={safeStr(o.notes)} area />
            </View>
          ))
        )}
      </SectionCard>

      <SectionCard eyebrow="7. Future Expansion Targets">
        <FormField label="List cities, counties, or states you plan to expand into within the next 6 to 24 months" value={safeStr(d.future_expansion_targets)} area />
        <FormField label="Estimated expansion timeline (if known)" value={safeStr(d.future_expansion_timeline)} />
      </SectionCard>

      <SectionCard eyebrow="8. Market Focus">
        <FormField label="Main city or multiple equally?" value={safeStr(d.market_focus_main_city)} area />
        <FormField label="Competing against large firms or local boutiques?" value={safeStr(d.market_focus_competition)} area />
        <FormField label="Which cities do you want to dominate first?" value={safeStr(d.market_focus_priority_cities)} area />
        <FormField label="Markets to avoid" value={safeStr(d.market_focus_avoid)} area />
      </SectionCard>
    </View>
  );
}

// ---------- section 6: brand assets + terms ----------

function Doc6Assets({ d, termsVersion }: { d: OnboardingData; termsVersion: string }) {
  const files = d.uploaded_asset_filenames ?? [];
  return (
    <View>
      <Text style={styles.p}>Visual identity assets and the terms acknowledgement signed at submission.</Text>

      <SectionCard eyebrow="1. Brand Guidelines">
        <TwoCol
          left={<FormField label="Brand color (HEX / RGB)" value={safeStr(d.brand_color_hex)} />}
          right={<FormField label="Typography / fonts" value={safeStr(d.brand_fonts)} />}
        />
        <FormField label="Notes / brand guidelines" value={safeStr(d.brand_guidelines_notes)} area />
      </SectionCard>

      <SectionCard eyebrow="2. Uploaded Brand Assets">
        {files.length === 0 ? (
          <Text style={styles.fieldValuePlaceholder}>No files were attached.</Text>
        ) : (
          <View>
            {files.map((f, i) => (
              <View key={i} style={styles.ulItem}>
                <Text style={styles.ulBullet}>•</Text>
                <Text style={styles.ulText}>{f}</Text>
              </View>
            ))}
          </View>
        )}
      </SectionCard>

      <SectionCard eyebrow="3. Terms Acknowledgement">
        <CheckboxLine label={`I have read and agree to the F1 Media portal terms (version ${termsVersion}).`} checked={true} />
      </SectionCard>
    </View>
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
  /** Originating IP if available. */
  submittedIp?: string | null;
  /** IANA timezone (e.g. "America/Phoenix") for formatting the timestamp.
   *  When omitted, falls back to UTC and labels the time accordingly. */
  submittedTimezone?: string | null;
}

export async function renderOnboardingPdf(props: Props): Promise<Buffer> {
  const { clientName, submittedAt, data, termsVersion, submittedLocation, submittedIp, submittedTimezone } = props;
  const submitted = new Date(submittedAt);
  // Use the client's IANA timezone so the rendered time matches what they
  // saw when they hit Submit. If we don't know the zone, render UTC + label.
  const tz = submittedTimezone || "UTC";
  let formattedDate: string;
  try {
    formattedDate = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      dateStyle: "long",
      timeStyle: "short",
    }).format(submitted);
  } catch {
    formattedDate = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      dateStyle: "long",
      timeStyle: "short",
    }).format(submitted);
  }
  const tzSuffix = tz === "UTC" ? " UTC" : ` (${tz.split("/").pop()?.replace(/_/g, " ")})`;
  const submittedLineParts = [
    `Submitted ${formattedDate}${tzSuffix}`,
    submittedLocation || null,
    submittedIp ? `IP ${submittedIp}` : null,
  ].filter(Boolean) as string[];
  const submittedLine = submittedLineParts.join("  ·  ");

  const TOTAL = 6;
  const logoBuf = loadLogo();

  const sections: { idx: number; title: string; body: React.ReactNode }[] = [
    { idx: 0, title: "Digital Account Access & Administrative Permissions", body: <Doc1AccountAccess d={data} /> },
    { idx: 1, title: "Company Bio & Performance Insights", body: <Doc2Bio d={data} /> },
    { idx: 2, title: "Primary Contact & Communication Directory", body: <Doc3Contacts d={data} /> },
    { idx: 3, title: "Digital Authority & Growth Strategy", body: <Doc4Strategy /> },
    { idx: 4, title: "List of Services & Service Locations", body: <Doc5Services d={data} /> },
    { idx: 5, title: "Brand Assets & Media Files Required", body: <Doc6Assets d={data} termsVersion={termsVersion} /> },
  ];

  const doc = (
    <Document title={`${clientName} — F1 Media Onboarding`} author="F1 Media Team">
      {sections.map((s) => (
        <Page key={s.idx} size="LETTER" style={styles.page} wrap>
          <PageBand
            clientName={clientName}
            submittedLine={submittedLine}
            pageIdx={s.idx}
            totalPages={TOTAL}
            logoBuf={logoBuf}
          />
          <View style={styles.bodyPad}>
            <PageHeader idx={s.idx} title={s.title} />
            {s.body}
          </View>
          <Footer page={s.idx + 1} total={TOTAL} />
        </Page>
      ))}
    </Document>
  );

  return renderToBuffer(doc);
}
