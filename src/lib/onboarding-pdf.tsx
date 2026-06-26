// Renders a client's completed onboarding into a multi-page PDF —
// one section per doc, mirroring the wizard order. Submitted by the
// server action after the client clicks Submit on the final page;
// the buffer is uploaded to client-attachments and shown in their
// Settings as a downloadable file.

import React from "react";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { OnboardingData } from "@/lib/types";

const styles = StyleSheet.create({
  page: { paddingTop: 50, paddingBottom: 50, paddingHorizontal: 50, backgroundColor: "#FFFFFF", color: "#111827", fontFamily: "Helvetica", fontSize: 11, lineHeight: 1.45 },
  cover: { alignItems: "center", justifyContent: "center", paddingTop: 180 },
  brand: { fontSize: 10, letterSpacing: 4, color: "#6B7280", textTransform: "uppercase", marginBottom: 14 },
  coverTitle: { fontSize: 28, fontFamily: "Helvetica-Bold", color: "#0F172A", textAlign: "center", marginBottom: 14 },
  coverSub: { fontSize: 12, color: "#475569", textAlign: "center" },
  sectionTitle: { fontSize: 18, fontFamily: "Helvetica-Bold", color: "#0F172A", marginBottom: 4 },
  sectionKicker: { fontSize: 8, letterSpacing: 2, color: "#3F8E84", textTransform: "uppercase", marginBottom: 12 },
  h3: { fontSize: 12, fontFamily: "Helvetica-Bold", color: "#0F172A", marginTop: 14, marginBottom: 6 },
  qLabel: { fontSize: 9, color: "#6B7280", textTransform: "uppercase", letterSpacing: 1, marginTop: 8 },
  qValue: { fontSize: 11, color: "#0F172A", marginTop: 2 },
  table: { marginTop: 6, borderTopWidth: 1, borderColor: "#E5E7EB" },
  tableRow: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#E5E7EB", paddingVertical: 4 },
  tableCellH: { fontSize: 8, color: "#6B7280", textTransform: "uppercase", letterSpacing: 1 },
  tableCell: { fontSize: 10, color: "#0F172A" },
  chip: { backgroundColor: "#F0F9FF", color: "#0369A1", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, fontSize: 9, marginRight: 4 },
  footer: { position: "absolute", left: 50, right: 50, bottom: 24, color: "#9CA3AF", fontSize: 8, flexDirection: "row", justifyContent: "space-between" },
});

function val(v: unknown): string {
  if (v == null) return "—";
  const s = typeof v === "string" ? v : String(v);
  return s.trim() ? s : "—";
}
function yn(v: unknown): string {
  if (v === "yes") return "Yes";
  if (v === "no") return "No";
  return "—";
}
function joinChecked(obj: Record<string, unknown> | undefined, labels: Record<string, string>): string {
  if (!obj) return "—";
  const on = Object.entries(obj).filter(([, v]) => v).map(([k]) => labels[k] ?? k);
  return on.length ? on.join(", ") : "—";
}

interface Props {
  clientName: string;
  submittedAt: string;
  data: OnboardingData;
  termsVersion: string;
}

function Q({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text style={styles.qLabel}>{label}</Text>
      <Text style={styles.qValue}>{value}</Text>
    </View>
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

const SECTION_TITLES = [
  "Account Access & Administrative Permissions",
  "Company Bio & Performance Insights",
  "Primary Contact & Communication Directory",
  "Digital Authority & Growth Strategy",
  "List of Services & Service Locations",
  "Brand Assets & Media Files",
] as const;

function SectionHeader({ idx }: { idx: number }) {
  return (
    <>
      <Text style={styles.sectionKicker}>Section {idx + 1} of 6</Text>
      <Text style={styles.sectionTitle}>{SECTION_TITLES[idx]}</Text>
    </>
  );
}

function Doc1AccountAccess({ d }: { d: OnboardingData }) {
  const g = d.google_access ?? {};
  const m = d.microsoft_access ?? {};
  return (
    <>
      <Text style={styles.h3}>Primary administrative user</Text>
      <Q label="Email" value={val(d.primary_admin_email)} />
      <Q label="Username" value={val(d.primary_admin_username)} />
      <Q label="Password" value={d.primary_admin_password ? "[provided — stored encrypted]" : "—"} />
      <Q label="Tied to Google" value={yn(d.primary_tied_to_google)} />
      <Q label="Tied to hosting" value={yn(d.primary_tied_to_hosting)} />

      {(d.secondary_admin_email || d.secondary_admin_username) ? (
        <>
          <Text style={styles.h3}>Secondary administrative user</Text>
          <Q label="Email" value={val(d.secondary_admin_email)} />
          <Q label="Username" value={val(d.secondary_admin_username)} />
          <Q label="Password" value={d.secondary_admin_password ? "[provided — stored encrypted]" : "—"} />
        </>
      ) : null}

      <Text style={styles.h3}>Website &amp; hosting access</Text>
      <Q label="Website URL" value={val(d.website_url)} />
      <Q label="CMS platform" value={val(d.cms_platform)} />
      <Q label="Hosting provider" value={val(d.hosting_provider)} />
      <Q label="Domain registrar" value={val(d.domain_registrar)} />
      <Q label="Website admin email" value={val(d.website_admin_email)} />
      <Q label="Website username" value={val(d.website_username)} />
      <Q label="Developer contact" value={val(d.developer_contact)} />

      <Text style={styles.h3}>Google access</Text>
      <Q label="Admin email" value={val(d.google_admin_email)} />
      <Q label="Granted" value={joinChecked(g as Record<string, unknown>, {
        analytics: "Analytics", search_console: "Search Console", business_profile: "Business Profile",
        ads: "Google Ads", tag_manager: "Tag Manager",
      })} />

      <Text style={styles.h3}>Microsoft access</Text>
      <Q label="Admin email" value={val(d.microsoft_admin_email)} />
      <Q label="Granted" value={joinChecked(m as Record<string, unknown>, {
        bing_webmaster: "Bing Webmaster", ads: "Microsoft Ads",
      })} />

      <Text style={styles.h3}>Authorization preference</Text>
      <Q label="Approach" value={val((d.authorization_preference ?? "").replace(/_/g, " "))} />
      {d.authorization_other ? <Q label="Notes" value={val(d.authorization_other)} /> : null}
    </>
  );
}

function Doc2Bio({ d }: { d: OnboardingData }) {
  return (
    <>
      <Text style={styles.h3}>Company bio</Text>
      <Q label="Bio" value={val(d.company_bio)} />
      <Text style={styles.h3}>Two strategic brand questions</Text>
      <Q label="What makes your firm different from other firms in your market?" value={val(d.brand_diff)} />
      <Q label="If a client had to describe your firm in three words, what would they say?" value={val(d.brand_3words)} />
      <Text style={styles.h3}>Marketing performance</Text>
      <Q label="Social media — platforms used" value={val(d.perf_social_used)} />
      <Q label="Social media — explanation" value={val(d.perf_social_explanation)} />
      <Q label="Website URL(s)" value={val(d.perf_website_url)} />
      <Q label="Website — explanation" value={val(d.perf_website_explanation)} />
      <Q label="Paid ads — platforms" value={val(d.perf_paid_platforms)} />
      <Q label="Paid ads — explanation" value={val(d.perf_paid_explanation)} />
      <Q label="Podcast — name / platform" value={val(d.perf_podcast_name)} />
      <Q label="Podcast — explanation" value={val(d.perf_podcast_explanation)} />
      <Q label="YouTube" value={val(d.perf_youtube)} />
      <Q label="YouTube — explanation" value={val(d.perf_youtube_explanation)} />
      <Q label="SEO — explanation" value={val(d.perf_seo_explanation)} />
      <Q label="Referrals — explanation" value={val(d.perf_referrals_explanation)} />
      <Q label="What hasn't worked / underperforming" value={val(d.perf_underperforming)} />
    </>
  );
}

function Doc3Contacts({ d }: { d: OnboardingData }) {
  const contacts = d.contacts ?? [];
  return (
    <>
      <Text style={styles.h3}>Authorized contacts</Text>
      {contacts.length === 0 ? (
        <Text style={styles.qValue}>—</Text>
      ) : (
        <View style={styles.table}>
          <View style={styles.tableRow}>
            <Text style={[styles.tableCellH, { flex: 2 }]}>Name</Text>
            <Text style={[styles.tableCellH, { flex: 3 }]}>Email</Text>
            <Text style={[styles.tableCellH, { flex: 2 }]}>Phone</Text>
            <Text style={[styles.tableCellH, { flex: 3 }]}>Role &amp; notes</Text>
          </View>
          {contacts.map((c, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={[styles.tableCell, { flex: 2 }]}>{val(c.name)}</Text>
              <Text style={[styles.tableCell, { flex: 3 }]}>{val(c.email)}</Text>
              <Text style={[styles.tableCell, { flex: 2 }]}>{val(c.phone)}</Text>
              <Text style={[styles.tableCell, { flex: 3 }]}>{val(c.role)}</Text>
            </View>
          ))}
        </View>
      )}
    </>
  );
}

function Doc4Strategy() {
  return (
    <>
      <Text style={styles.h3}>F1 Media Digital Authority &amp; Growth Framework</Text>
      <Text style={styles.qValue}>
        Acknowledgement of the strategic framework: Authority &amp; Visibility Foundation, Search Engine Domination (SEO), Content &amp; Media Engine, Social Media Ecosystem, Performance Tracking &amp; Reporting. This section is informational — no fields to submit.
      </Text>
    </>
  );
}

function Doc5Services({ d }: { d: OnboardingData }) {
  const svcs = d.services ?? [];
  const locs = d.service_locations ?? [];
  return (
    <>
      <Text style={styles.h3}>Services</Text>
      {svcs.length === 0 ? <Text style={styles.qValue}>—</Text> : (
        <View style={styles.table}>
          <View style={styles.tableRow}>
            <Text style={[styles.tableCellH, { flex: 3 }]}>Service</Text>
            <Text style={[styles.tableCellH, { flex: 5 }]}>Description</Text>
            <Text style={[styles.tableCellH, { flex: 1.5 }]}>Priority</Text>
            <Text style={[styles.tableCellH, { flex: 3 }]}>Audience</Text>
          </View>
          {svcs.map((s, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={[styles.tableCell, { flex: 3 }]}>{val(s.name)}</Text>
              <Text style={[styles.tableCell, { flex: 5 }]}>{val(s.description)}</Text>
              <Text style={[styles.tableCell, { flex: 1.5 }]}>{val(s.priority).toUpperCase()}</Text>
              <Text style={[styles.tableCell, { flex: 3 }]}>{val(s.audience)}</Text>
            </View>
          ))}
        </View>
      )}
      <Text style={styles.h3}>Geographic service areas</Text>
      {locs.length === 0 ? <Text style={styles.qValue}>—</Text> : (
        <View style={styles.table}>
          <View style={styles.tableRow}>
            <Text style={[styles.tableCellH, { flex: 3 }]}>City</Text>
            <Text style={[styles.tableCellH, { flex: 1.5 }]}>Office</Text>
            <Text style={[styles.tableCellH, { flex: 1.5 }]}>Priority</Text>
            <Text style={[styles.tableCellH, { flex: 4 }]}>Notes</Text>
          </View>
          {locs.map((l, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={[styles.tableCell, { flex: 3 }]}>{val(l.city)}</Text>
              <Text style={[styles.tableCell, { flex: 1.5 }]}>{yn(l.has_office)}</Text>
              <Text style={[styles.tableCell, { flex: 1.5 }]}>{val(l.priority).toUpperCase()}</Text>
              <Text style={[styles.tableCell, { flex: 4 }]}>{val(l.notes)}</Text>
            </View>
          ))}
        </View>
      )}
      <Text style={styles.h3}>Market focus</Text>
      <Q label="Main city or multiple equally?" value={val(d.market_focus_main_city)} />
      <Q label="Competing against large firms or locals?" value={val(d.market_focus_competition)} />
      <Q label="Cities to dominate first" value={val(d.market_focus_priority_cities)} />
      <Q label="Markets to avoid" value={val(d.market_focus_avoid)} />
    </>
  );
}

function Doc6Assets({ d }: { d: OnboardingData }) {
  const files = d.uploaded_asset_filenames ?? [];
  return (
    <>
      <Text style={styles.h3}>Uploaded brand assets &amp; media files</Text>
      {files.length === 0 ? (
        <Text style={styles.qValue}>No files uploaded with this submission.</Text>
      ) : (
        files.map((f, i) => (
          <Text key={i} style={styles.qValue}>• {f}</Text>
        ))
      )}
      <Text style={styles.h3}>Brand guidelines</Text>
      <Q label="Brand color (HEX / RGB)" value={val(d.brand_color_hex)} />
      <Q label="Typography / fonts" value={val(d.brand_fonts)} />
      <Q label="Notes" value={val(d.brand_guidelines_notes)} />
    </>
  );
}

export async function renderOnboardingPdf(props: Props): Promise<Buffer> {
  const { clientName, submittedAt, data, termsVersion } = props;
  const date = new Date(submittedAt).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" });

  const doc = (
    <Document title={`${clientName} — F1 Media Onboarding`} author="F1 Media Team">
      {/* Cover */}
      <Page size="LETTER" style={styles.page}>
        <View style={styles.cover}>
          <Text style={styles.brand}>F1 Media Team · Onboarding</Text>
          <Text style={styles.coverTitle}>{clientName}</Text>
          <Text style={styles.coverSub}>Submitted {date}</Text>
          <Text style={[styles.coverSub, { marginTop: 6 }]}>Terms accepted · v{termsVersion}</Text>
        </View>
        <Footer page={1} total={7} client={clientName} />
      </Page>
      {/* Doc 1 */}
      <Page size="LETTER" style={styles.page}>
        <SectionHeader idx={0} />
        <Doc1AccountAccess d={data} />
        <Footer page={2} total={7} client={clientName} />
      </Page>
      {/* Doc 2 */}
      <Page size="LETTER" style={styles.page}>
        <SectionHeader idx={1} />
        <Doc2Bio d={data} />
        <Footer page={3} total={7} client={clientName} />
      </Page>
      {/* Doc 3 */}
      <Page size="LETTER" style={styles.page}>
        <SectionHeader idx={2} />
        <Doc3Contacts d={data} />
        <Footer page={4} total={7} client={clientName} />
      </Page>
      {/* Doc 4 */}
      <Page size="LETTER" style={styles.page}>
        <SectionHeader idx={3} />
        <Doc4Strategy />
        <Footer page={5} total={7} client={clientName} />
      </Page>
      {/* Doc 5 */}
      <Page size="LETTER" style={styles.page}>
        <SectionHeader idx={4} />
        <Doc5Services d={data} />
        <Footer page={6} total={7} client={clientName} />
      </Page>
      {/* Doc 6 */}
      <Page size="LETTER" style={styles.page}>
        <SectionHeader idx={5} />
        <Doc6Assets d={data} />
        <Footer page={7} total={7} client={clientName} />
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}
