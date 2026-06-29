// Renders a client's completed onboarding into a PDF that mirrors the
// in-app wizard popup — same headers, prose, and field layout, but with
// the client's answers populated inside each field "box" so the doc reads
// like the form they filled out.

import fs from "node:fs";
import path from "node:path";
import React from "react";
import { Document, Font, Image, Page, Path, StyleSheet, Svg, Text, View, renderToBuffer } from "@react-pdf/renderer";
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
    paddingLeft: 0,            // logo sits flush left like the wizard
    paddingRight: 28,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: "rgba(0,0,0,0.10)",
  },
  // Bigger fixed-width box so the Image renders at full intended size and
  // the right column can't squeeze the logo. width-only on the Image lets
  // it scale naturally without the contain-mode shrink we saw before.
  pageBandLogoBox: { width: 180, alignItems: "flex-start", justifyContent: "center", paddingLeft: 18 },
  pageBandLogo: { width: 150 },
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
    fontSize: 26,
    fontFamily: "Helvetica-Bold",
    color: C.ink,
    textAlign: "center",
    marginBottom: 4,
    letterSpacing: -0.3,
    lineHeight: 1.15,
  },
  sectionTitleRule: {
    borderBottomWidth: 1,
    borderColor: "rgba(0,0,0,0.10)",
    marginTop: 18,
    marginBottom: 16,
  },

  p:     { fontSize: 10.5, color: C.ink_soft, marginBottom: 8 },
  pSmall:{ fontSize: 9.5,  color: C.muted,    marginBottom: 6 },
  em:    { fontSize: 10.5, color: C.ink_soft, marginBottom: 8, fontStyle: "italic" },
  h2:    { fontSize: 16, fontFamily: "Helvetica-Bold", color: C.ink, marginTop: 16, marginBottom: 8 },
  h3:    { fontSize: 13, fontFamily: "Helvetica-Bold", color: C.ink, marginTop: 12, marginBottom: 6 },

  ulItem:   { flexDirection: "row", marginBottom: 3 },
  ulBullet: { width: 12, color: C.ink_soft, fontSize: 10.5 },
  ulText:   { flex: 1, fontSize: 10.5, color: C.ink_soft },

  // 3-col field grid for credential rows (email | username | password)
  row3:     { flexDirection: "row", marginHorizontal: -4 },
  row3Cell: { width: "33.3333%", paddingHorizontal: 4 },

  // Inline Yes/No: question label on the left, YES/NO pills right-aligned.
  inlineYNRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    paddingVertical: 2,
  },
  inlineYNText: { fontSize: 10.5, color: C.ink, flex: 1 },
  inlineYNPills: { flexDirection: "row", alignItems: "center" },

  // 2-col checkbox grid (Google Analytics | Google Search Console …)
  checkGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 4 },
  checkCell: { width: "50%", paddingVertical: 3 },

  // Radio option (empty circle + label) for the authorization preference
  radioRow:   { flexDirection: "row", flexWrap: "wrap", marginTop: 4 },
  radioCell:  { width: "50%", paddingVertical: 4 },
  radioInner: { flexDirection: "row", alignItems: "center" },
  radioGlyph: {
    width: 12,
    height: 12,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.45)",
    borderRadius: 6,
    marginRight: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  radioGlyphOn:  { borderColor: C.ink },
  radioGlyphDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.ink },
  radioLabel:    { fontSize: 10.5, color: C.ink },

  // Soft callout box used for the "Security Note" recommendation block.
  noteBox: {
    backgroundColor: "#F5F7FA",
    borderWidth: 1,
    borderColor: C.rule,
    borderRadius: 8,
    padding: 10,
    marginTop: 12,
  },
  noteTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", color: C.ink, marginBottom: 4 },

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
  pillBox: {
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.30)",
    borderRadius: 5,
    paddingHorizontal: 11,
    paddingVertical: 4,
    marginRight: 6,
    minWidth: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  pillBoxOn: {
    borderColor: C.ink,
    backgroundColor: C.ink,
  },
  pillText: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "rgba(0,0,0,0.65)",
    textAlign: "center",
  },
  pillTextOn: { color: "#FFFFFF" },

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
  },
  checkboxGlyphOn: { backgroundColor: C.ink },
  // ✓ in Helvetica is U+2713. Rendering as a Text with no extra padding,
  // centered inside a 14×14 box, gives a clean checkmark instead of an
  // off-center "X".
  checkboxMark: {
    color: "#FFFFFF",
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    lineHeight: 1,
  },
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
    <View wrap={false}>
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
    <View wrap={false} style={{ marginTop: 6 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.pillRow}>
        {options.map((o) => {
          const on = value === o.v;
          return (
            <View key={o.v} style={on ? [styles.pillBox, styles.pillBoxOn] : styles.pillBox}>
              <Text style={on ? [styles.pillText, styles.pillTextOn] : styles.pillText}>
                {o.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function YesNoRow({ label, value }: { label: string; value: "yes" | "no" | "" }) {
  return <PillRow label={label} options={[{ v: "yes", label: "YES" }, { v: "no", label: "NO" }]} value={value} />;
}

// Wizard-style inline Yes/No: a question on the left, YES/NO pills on the right.
function InlineYesNo({ question, value }: { question: string; value: "yes" | "no" | "" }) {
  const options: { v: "yes" | "no"; label: string }[] = [
    { v: "yes", label: "YES" },
    { v: "no", label: "NO" },
  ];
  return (
    <View wrap={false} style={styles.inlineYNRow}>
      <Text style={styles.inlineYNText}>{question}</Text>
      <View style={styles.inlineYNPills}>
        {options.map((o) => {
          const on = value === o.v;
          return (
            <View key={o.v} style={on ? [styles.pillBox, styles.pillBoxOn] : styles.pillBox}>
              <Text style={on ? [styles.pillText, styles.pillTextOn] : styles.pillText}>
                {o.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// Three-column field grid for credential rows (email / username / password).
function Row3({ a, b, c }: { a: React.ReactNode; b: React.ReactNode; c: React.ReactNode }) {
  return (
    <View wrap={false} style={styles.row3}>
      <View style={styles.row3Cell}>{a}</View>
      <View style={styles.row3Cell}>{b}</View>
      <View style={styles.row3Cell}>{c}</View>
    </View>
  );
}

// Wizard's "Access to the following:" 2-column checkbox grid.
function CheckboxGrid({ items }: { items: { label: string; checked: boolean }[] }) {
  return (
    <View style={styles.checkGrid}>
      {items.map((it, i) => (
        <View key={i} style={styles.checkCell}>
          <CheckboxLine label={it.label} checked={it.checked} />
        </View>
      ))}
    </View>
  );
}

// Empty circle + filled-dot if selected — for the access-method radio group.
function RadioOption({ label, selected }: { label: string; selected: boolean }) {
  const glyphStyle = selected ? [styles.radioGlyph, styles.radioGlyphOn] : styles.radioGlyph;
  return (
    <View style={styles.radioInner}>
      <View style={glyphStyle}>
        {selected ? <View style={styles.radioGlyphDot} /> : null}
      </View>
      <Text style={styles.radioLabel}>{label}</Text>
    </View>
  );
}

function RadioGrid({ options, value }: { options: { v: string; label: string }[]; value: string }) {
  return (
    <View style={styles.radioRow}>
      {options.map((o) => (
        <View key={o.v} style={styles.radioCell}>
          <RadioOption label={o.label} selected={value === o.v} />
        </View>
      ))}
    </View>
  );
}

function SecurityNote({ title, lines }: { title: string; lines: string[] }) {
  return (
    <View style={styles.noteBox}>
      <Text style={styles.noteTitle}>{title}</Text>
      <Text style={styles.p}>For security and compliance purposes, F1 Media Team recommends:</Text>
      <UL items={lines} />
    </View>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <Text style={styles.h2}>{children}</Text>;
}
function P({ children }: { children: React.ReactNode }) {
  return <Text style={styles.p}>{children}</Text>;
}
function Em({ children }: { children: React.ReactNode }) {
  return <Text style={styles.em}>{children}</Text>;
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
        {checked ? (
          <Svg width={9} height={9} viewBox="0 0 12 12">
            <Path d="M2 6.5 L5 9.5 L10 3.5" stroke="#FFFFFF" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        ) : null}
      </View>
      <Text style={styles.checkboxLabel}>{label}</Text>
    </View>
  );
}

function SectionCard({ eyebrow, children }: { eyebrow: string; children: React.ReactNode }) {
  // Cards may be taller than a single page (the social-media card has 13
  // platforms, the services card can have many rows) so we DON'T set
  // wrap={false} on the card itself — that caused react-pdf to compress
  // the card and overlap labels with their inputs. The eyebrow alone is
  // kept with the first child via the marginTop on the eyebrow style;
  // individual sub-rows lock themselves together with their own wrap=false.
  return (
    <View>
      <Text style={styles.sectionCardEyebrow}>{eyebrow}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function TwoCol({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <View wrap={false} style={styles.twoCol}>
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
      <View style={styles.pageBandLogoBox}>
        {logoBuf ? (
          <Image src={logoBuf as unknown as string} style={styles.pageBandLogo} />
        ) : (
          <Text style={styles.pageBandLogoFallback}>F1 / MEDIA TEAM</Text>
        )}
      </View>
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

      <H2>Account Structure & Access Policy</H2>
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
      <Em>This email will remain your property. F1 Media Team will only utilize granted administrative permissions necessary to execute the agreed-upon services.</Em>
      <P>Please complete all applicable sections below.</P>

      <SectionCard eyebrow="1. Primary Administrative Email(s)">
        <P>List all email addresses that currently hold administrative access to your digital platforms.</P>
        <Row3
          a={<FormField label="Primary admin email" value={safeStr(d.primary_admin_email)} />}
          b={<FormField label="Username" value={safeStr(d.primary_admin_username)} />}
          c={<FormField label="Password" value={d.primary_admin_password ? "[provided]" : ""} />}
        />
        <Row3
          a={<FormField label="Secondary admin email" value={safeStr(d.secondary_admin_email)} />}
          b={<FormField label="Username" value={safeStr(d.secondary_admin_username)} />}
          c={<FormField label="Password" value={d.secondary_admin_password ? "[provided]" : ""} />}
        />
        <InlineYesNo question="Is this email tied to Google services?" value={yn(d.primary_tied_to_google)} />
        <InlineYesNo question="Is this email tied to website hosting?" value={yn(d.primary_tied_to_hosting)} />
      </SectionCard>

      <SectionCard eyebrow="2. Website & Hosting Access">
        <Row3
          a={<FormField label="Website URL" value={safeStr(d.website_url)} />}
          b={<FormField label="Username" value={safeStr(d.website_username)} />}
          c={<FormField label="Password" value={d.website_password ? "[provided]" : ""} />}
        />
        <TwoCol
          left={<FormField label="Domain registrar (if known)" value={safeStr(d.domain_registrar)} />}
          right={<FormField label="Hosting provider (if known)" value={safeStr(d.hosting_provider)} />}
        />
        <TwoCol
          left={<FormField label="Primary website access email" value={safeStr(d.website_admin_email)} />}
          right={<FormField label="CMS platform (WordPress, Webflow, custom, etc.)" value={safeStr(d.cms_platform)} />}
        />
        <FormField label="Developer contact (if applicable)" value={safeStr(d.developer_contact)} />
      </SectionCard>

      <SectionCard eyebrow="3. Search Engine Accounts">
        <H2>Google Accounts</H2>
        <FormField label="Google account email (admin)" value={safeStr(d.google_admin_email)} />
        <Text style={[styles.p, { marginTop: 10, marginBottom: 4 }]}>Access to the following:</Text>
        <CheckboxGrid items={[
          { label: "Google Analytics",        checked: isOn(g, "analytics") },
          { label: "Google Search Console",   checked: isOn(g, "search_console") },
          { label: "Google Business Profile", checked: isOn(g, "business_profile") },
          { label: "Google Ads",              checked: isOn(g, "ads") },
          { label: "Tag Manager",             checked: isOn(g, "tag_manager") },
        ]} />
        <FormField label="Other" value={safeStr((g as { other?: unknown }).other)} />

        <H2>Microsoft / Bing Accounts</H2>
        <FormField label="Microsoft account email (admin)" value={safeStr(d.microsoft_admin_email)} />
        <Text style={[styles.p, { marginTop: 10, marginBottom: 4 }]}>Access to:</Text>
        <CheckboxGrid items={[
          { label: "Bing Webmaster Tools", checked: isOn(m, "bing_webmaster") },
          { label: "Microsoft Ads",        checked: isOn(m, "ads") },
        ]} />
        <FormField label="Other" value={safeStr((m as { other?: unknown }).other)} />
      </SectionCard>

      <SectionCard eyebrow="4. Social Media Account Access">
        <P>Please list the email address that holds administrative access for each platform.</P>
        {socialKeys.map(({ key, label, urlLabel }) => {
          const s = socials[key] ?? {};
          return (
            <View key={key} wrap={false} style={{ marginTop: 6 }}>
              <Text style={[styles.h3, { marginTop: 0, marginBottom: 4 }]}>{label}</Text>
              <TwoCol
                left={<FormField label={urlLabel} value={safeStr(s.username)} />}
                right={<FormField label="Admin email" value={safeStr(s.admin_email)} />}
              />
            </View>
          );
        })}
      </SectionCard>

      <SectionCard eyebrow="5. Access Authorization Preference">
        <P>Please indicate your preferred access method:</P>
        <RadioGrid
          value={safeStr(d.authorization_preference)}
          options={[
            { v: "direct_credentials", label: "Direct credential sharing" },
            { v: "temporary_password", label: "Temporary password sharing" },
            { v: "admin_invite",       label: "Administrative invite to F1 Media Team" },
            { v: "dedicated_email",    label: "Dedicated marketing email creation" },
            { v: "other",              label: "Other" },
          ]}
        />
        {d.authorization_preference === "other" ? (
          <FormField label="Please specify" value={safeStr(d.authorization_other)} />
        ) : null}
        <SecurityNote
          title="Security Note"
          lines={[
            "Granting administrative access via email invitation when possible",
            "Avoiding long-term password sharing",
            "Enabling two-factor authentication",
            "Maintaining at least one internal administrator at all times",
          ]}
        />
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
  // The header band intentionally hides location and IP — those still live
  // in client_onboarding.data._submit_meta for the admin audit if needed.
  const submittedLine = `Submitted ${formattedDate}${tzSuffix}`;
  void submittedLocation; void submittedIp; // suppress unused-prop lint

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
