#!/usr/bin/env node
//
// Is a rejected beacon the client's own preview, or somebody else's site?
//
// The real hostnames here are the ones that were actually rejected in
// production; the adversarial ones are the reason the rule is narrow. Imports
// the shipped module rather than restating the rule, so deleting the guard
// fails the test instead of quietly passing a copy of itself.

import { looksLikeOwnPreview } from "../src/lib/pulse/origin.ts";

let failures = 0;

function expect(host, domain, want, why) {
  const got = looksLikeOwnPreview(host, domain);
  const ok = got === want;
  if (!ok) failures += 1;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${want ? "own preview" : "not ours "}  ${host}`);
  if (!ok) console.log(`        expected ${want}, got ${got} — ${why}`);
}

console.log("\nF1 Pulse — rejected-origin classification\n");

// Seen in production. These are the 28 warnings that started this.
expect("dnpreview_bucketsofink.secure-decoration.com", "bucketsofink.com", true,
  "DecoNetwork preview for this exact store");
expect("dnpreview_azprecisiongraphics.secure-decoration.com", "azprecisiongraphics.com", true,
  "DecoNetwork preview for this exact store");

// Other platforms, same shape.
expect("bucketsofink.myshopify.com", "bucketsofink.com", true, "Shopify store host");
expect("bucketsofink-staging.wpengine.com", "bucketsofink.com", true, "WP Engine staging");
expect("staging-bucketsofink.netlify.app", "bucketsofink.com", true, "leading marker");

// The registered site itself is not a preview — it is allowed earlier and
// should never reach this function, but must not be mislabelled if it does.
expect("bucketsofink.com", "bucketsofink.com", false, "apex is the real site, not a preview");

// Somebody else's domain with the client's name buried in it. The whole
// reason the match is anchored to the leftmost label.
expect("www.evil-bucketsofink-phish.com", "bucketsofink.com", false,
  "name is not in the leftmost label");
expect("bucketsofink-phish.com", "bucketsofink.com", false,
  "'phish' is not a staging marker");
expect("cdn.attacker.net", "bucketsofink.com", false, "unrelated host");
expect("bucketsofinkfan.com", "bucketsofink.com", false,
  "substring, not a whole token");

// Short labels are too collision-prone to be evidence of anything.
expect("dev-abc.example.com", "abc.com", false, "three-letter label is not evidence");

console.log(`\n${failures === 0 ? "all passed" : `${failures} failed`}\n`);
process.exit(failures === 0 ? 0 : 1);
