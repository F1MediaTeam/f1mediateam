#!/usr/bin/env node
//
// The SEOquake CSV parser.
//
// SEOquake's headers change with version and with which parameters are switched
// on, so the parser matches columns by substring. These cases are the shapes an
// export actually arrives in — including the awkward ones.

import { parseSeoquakeCsv } from "../src/lib/pulse/seoquake-import.ts";

let fail = 0;
const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
};

console.log("\nSEOquake export parsing\n");

const basic = `Position,URL,Title,Google Index,Referring Domains
1,https://www.competitor.com/hats,Custom Hats,"1,240",312
2,https://www.azprecisiongraphics.com/page/custom-baseball-hats,Baseball Hats,890,47`;
const a = parseSeoquakeCsv(basic);
t("parses a plain export", a.rows.length, 2);
t("strips www from the domain", a.rows[0].domain, "competitor.com");
t("reads a thousands-separated number", a.rows[0].googleIndex, 1240);
t("reads referring domains", a.rows[0].referringDomains, 312);

// A title containing a comma is the classic thing that breaks naive splitting.
const quoted = `Position,URL,Title,Referring Domains
1,https://example.com/a,"Hats, Caps and More",55`;
t("a comma inside a quoted title does not shift the columns",
  parseSeoquakeCsv(quoted).rows[0].referringDomains, 55);

// Exports often carry a title line above the header.
const preamble = `SEOquake SERP export for "custom hats"
Position,URL,Referring Domains
1,https://example.com/a,12`;
t("skips a preamble line above the header", parseSeoquakeCsv(preamble).rows.length, 1);

// Different builds label the same figure differently.
const alt = `#,Link,Ref domains,Pages
1,https://example.com/a,88,500`;
const b = parseSeoquakeCsv(alt);
t("matches alternative column names", b.rows[0].referringDomains, 88);

// Shorthand and empty cells.
const shorthand = `Position,URL,Referring Domains,Google Index
1,https://example.com/a,1.2K,n/a
2,https://example.com/b,,340`;
const c = parseSeoquakeCsv(shorthand);
t("expands 1.2K", c.rows[0].referringDomains, 1200);
t("n/a becomes null, not zero", c.rows[0].googleIndex, null);
t("an empty cell becomes null", c.rows[1].referringDomains, null);

// Rows without a usable URL are skipped rather than poisoning the set.
const junk = `Position,URL,Referring Domains
1,not-a-url,10
2,https://example.com/a,20`;
t("skips rows with no real URL", parseSeoquakeCsv(junk).rows.length, 1);

// Wrong file entirely.
t("rejects a file with no URL column",
  parseSeoquakeCsv("Keyword,Volume\nhats,100").error !== null, true);
t("rejects an empty file", parseSeoquakeCsv("").error !== null, true);

console.log(`\n${fail === 0 ? "all passed" : fail + " failed"}\n`);
process.exit(fail ? 1 : 0);
