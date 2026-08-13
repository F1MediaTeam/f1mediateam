#!/usr/bin/env node
//
// F1 Pulse — privacy invariant tests.
//
// These are the rules that keep the platform legal. Until now they were
// enforced by construction and verified by a human reading the code, which is
// fine on the day it was written and worthless six months later when someone
// adds a feature in a hurry.
//
// Run with:  npm run privacy
//
// Deliberately dependency-free and framework-free. The repo has no test runner,
// and adding one to assert six things would be a bigger change than the thing
// being asserted. This runs anywhere node runs, including CI.
//
// Where a rule can be tested by BEHAVIOUR it is — the salt rotation actually
// executes the hashing code against two different days rather than grepping for
// a variable name. Where a rule is about absence (no cookies, no storage) the
// test is necessarily a static scan of the shipped file, which is the same file
// the browser gets.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

let failures = 0;
let passes = 0;

function check(name, fn) {
  try {
    const detail = fn();
    passes += 1;
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } catch (err) {
    failures += 1;
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/** Strip comments so a rule named in prose is not mistaken for code. */
function code(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1 ");
}

console.log("\nF1 Pulse — privacy invariants\n");

// ---------------------------------------------------------------------------
// Invariant 1: the tag stores nothing on the visitor's device.
// ---------------------------------------------------------------------------
const tag = code(read("public/f1.js"));

check("1a. The tag sets no cookies", () => {
  assert(!/document\s*\.\s*cookie/.test(tag), "public/f1.js references document.cookie");
  return "no document.cookie";
});

check("1b. The tag uses no local or session storage", () => {
  assert(!/localStorage/.test(tag), "public/f1.js references localStorage");
  assert(!/sessionStorage/.test(tag), "public/f1.js references sessionStorage");
  assert(!/indexedDB/i.test(tag), "public/f1.js references indexedDB");
  return "no localStorage, sessionStorage or indexedDB";
});

check("1c. The tag does not fingerprint", () => {
  // The APIs a fingerprinting script reaches for first.
  const forbidden = [
    /getContext\s*\(\s*['"]webgl/i,
    /toDataURL/,
    /AudioContext/,
    /\bnavigator\s*\.\s*plugins\b/,
    /\bnavigator\s*\.\s*hardwareConcurrency\b/,
    /\bnavigator\s*\.\s*deviceMemory\b/,
    /getBattery/,
  ];
  for (const re of forbidden) {
    assert(!re.test(tag), `public/f1.js matches a fingerprinting pattern: ${re}`);
  }
  return "no canvas, WebGL, audio or device-enumeration probes";
});

// ---------------------------------------------------------------------------
// Invariant 4: the tag never reads what a visitor typed.
// ---------------------------------------------------------------------------
check("4. The tag reads no form field values", () => {
  // A form submission may read the form's own id or name and nothing else.
  //
  // `.value` cannot simply be banned: PerformanceObserver entries carry one,
  // and the layout-shift score is literally `entries[i].value`. Banning the
  // property outright failed on correct code, and a test that cries wolf gets
  // switched off — which is worse than no test. So every read is checked
  // against what it is read FROM: a performance entry is fine, an element is
  // not.
  // Every occurrence, inspected by what precedes it. Matching on an
  // identifier alone was not enough: `querySelector("input").value` ends in a
  // parenthesis, so a receiver-shaped regex saw nothing and the check passed
  // on a genuine leak. Found by deliberately injecting one.
  const allowedReceiver = /(?:^|[^\w$])(entry|entries\s*\[[^\]]*\]|e|last)$/;
  for (let i = tag.indexOf(".value"); i !== -1; i = tag.indexOf(".value", i + 1)) {
    // Not a property access if it is part of a longer identifier.
    if (/[\w$]/.test(tag[i + 6] ?? "")) continue;
    const before = tag.slice(Math.max(0, i - 60), i).trimEnd();
    assert(
      allowedReceiver.test(before),
      `public/f1.js reads .value from "...${before.slice(-40)}" — only performance entries may expose one`,
    );
  }
  assert(!/FormData/.test(tag), "public/f1.js constructs FormData");
  assert(!/\.\s*elements\b/.test(tag), "public/f1.js walks form.elements");
  assert(
    !/addEventListener\s*\(\s*['"](?:input|keydown|keyup|keypress|change|paste)['"]/.test(tag),
    "public/f1.js listens to a keystroke or input event",
  );
  return "no .value, FormData, form.elements, or keystroke listeners";
});

// ---------------------------------------------------------------------------
// Invariant 6: the tag talks only to us.
// ---------------------------------------------------------------------------
check("6. The tag sends data only to the origin that served it", () => {
  // Every absolute URL in the file. The endpoint must be derived from the
  // script's own src, never hardcoded to a third party.
  const urls = [...tag.matchAll(/https?:\/\/[^\s"'`)]+/g)].map((m) => m[0]);
  const external = urls.filter((u) => !u.includes("f1mediateam.com"));
  assert(external.length === 0, `public/f1.js contains external URLs: ${external.join(", ")}`);
  assert(
    /new URL\s*\(\s*script\.src/.test(tag),
    "public/f1.js does not derive its endpoint from its own script src",
  );
  return "endpoint derived from script.src; no third-party URLs";
});

// ---------------------------------------------------------------------------
// Invariant 2: no raw IP is ever persisted.
// ---------------------------------------------------------------------------
const ingest = code(read("src/app/api/pulse/ingest/route.ts"));

check("2a. The ingest route never writes the IP to the database", () => {
  // Find every object literal passed to an insert/upsert and confirm none
  // carries the ip variable as a value.
  const writes = [...ingest.matchAll(/\.(insert|upsert|update)\s*\(([\s\S]{0,600}?)\)\s*[;.]/g)];
  assert(writes.length > 0, "no insert/upsert found — has the route moved?");
  for (const [, verb, body] of writes) {
    assert(
      !/[:\s]ip\b/.test(body) && !/\bip\s*[,}]/.test(body),
      `an ${verb}() in the ingest route appears to write the ip variable`,
    );
  }
  return `${writes.length} write sites checked`;
});

check("2b. The ingest route never logs the IP", () => {
  const logs = [...ingest.matchAll(/console\.\w+\s*\(([\s\S]{0,200}?)\)/g)];
  for (const [, body] of logs) {
    assert(!/\bip\b/.test(body), "a console call in the ingest route references ip");
  }
  return logs.length === 0 ? "no console calls at all" : `${logs.length} log sites checked`;
});

check("2c. No pulse table has a column that could hold an IP", () => {
  // Reads the migrations rather than the database so this runs offline and in
  // CI. Column definitions only — comments are already stripped.
  const migrations = ["0023_pulse_platform.sql", "0024_pulse_intelligence.sql"];
  for (const file of migrations) {
    const sql = code(read(`supabase/migrations/${file}`));
    const suspicious = [...sql.matchAll(/^\s*(ip|ip_address|remote_addr|client_ip)\s+\w/gim)];
    assert(
      suspicious.length === 0,
      `${file} declares a column named ${suspicious.map((m) => m[1]).join(", ")}`,
    );
  }
  return "no ip, ip_address, remote_addr or client_ip column";
});

// ---------------------------------------------------------------------------
// Invariant 3: identifiers cannot outlive a day. Tested by behaviour.
// ---------------------------------------------------------------------------
const DAY = 86_400_000;

// The real implementation, imported rather than reimplemented.
//
// The first version of these tests mirrored the hashing logic here. That gave
// false assurance: deleting the day rotation from the shipped module left 3a
// and 3b passing, because they were testing the copy. Node 24 can import
// TypeScript directly, so they now exercise the file that actually runs.
const { visitorHash } = await import(new URL("../src/lib/pulse/hash.ts", import.meta.url).href);

check("3a. The same visitor hashes differently on a different day", () => {
  const args = ["site-1", "203.0.113.9", "Mozilla/5.0"];
  const today = new Date("2026-08-13T12:00:00Z");
  const tomorrow = new Date(today.getTime() + DAY);
  const a = visitorHash(...args, today);
  const b = visitorHash(...args, tomorrow);
  assert(a !== b, "the hash did not change across a day boundary");
  return "salt rotation confirmed by execution";
});

check("3b. The same visitor is stable within one day", () => {
  const args = ["site-1", "203.0.113.9", "Mozilla/5.0"];
  const morning = new Date("2026-08-13T01:00:00Z");
  const evening = new Date("2026-08-13T23:00:00Z");
  assert(
    visitorHash(...args, morning) === visitorHash(...args, evening),
    "the hash changed within a single day",
  );
  return "stable across one day";
});

check("3c. The shipped hash module still rotates on the day index", () => {
  const hash = code(read("src/lib/pulse/hash.ts"));
  assert(/86_400_000|86400000/.test(hash), "hash.ts no longer divides by a day in milliseconds");
  assert(/dayIndex\s*\(/.test(hash), "hash.ts no longer includes a day index in the digest");
  return "day index still part of the digest";
});

// ---------------------------------------------------------------------------
// Invariant 5: no cross-site joins. Tested by behaviour.
// ---------------------------------------------------------------------------
check("5. The same person on two client sites produces unrelated hashes", () => {
  const now = new Date("2026-08-13T12:00:00Z");
  const a = visitorHash("site-A", "203.0.113.9", "Mozilla/5.0", now);
  const b = visitorHash("site-B", "203.0.113.9", "Mozilla/5.0", now);
  assert(a !== b, "the same visitor produced the same hash on two different sites");

  const src = code(read("src/lib/pulse/hash.ts"));
  assert(/siteId/.test(src), "hash.ts no longer takes the site into the digest");
  return "site id is part of the digest, so the data cannot be joined across sites";
});

// ---------------------------------------------------------------------------

console.log(`\n${passes} passed, ${failures} failed\n`);
if (failures > 0) {
  console.log("A privacy invariant is broken. This is not a style issue —");
  console.log("these are the rules that keep the platform lawful.\n");
  process.exit(1);
}
