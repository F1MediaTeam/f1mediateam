#!/usr/bin/env node
//
// Replies to the daily task email.
// commands, so a sloppy quote-strip re-runs them every single day.
import { newTextOnly } from "../src/lib/email-reply.ts";
import { bodyOf, htmlToText } from "../src/lib/resend-inbound.ts";

let fail = 0;
const t = (name, got, want) => {
  const ok = got.trim() === want.trim();
  if (!ok) fail++;
  console.log(`  ${ok?"PASS":"FAIL"}  ${name}`);
  if (!ok) console.log(`        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`);
};

// A Gmail reply: new text on top, the whole original quoted beneath —
// including the footer that lists "done T-7" as an example.
const gmail = `done T-3
add Ship the calendar recurrence

On Sat, Aug 23, 2026 at 5:00 PM F1 Media <noreply@f1mediateam.com> wrote:
> Still open (9):
>
> Overdue (1):
> • T-7 Fix the calendar — F1 Media
>
> Reply to this email to change the list. One instruction per line:
>   done T-7            — close it
>   add Fix the calendar — new task`;
t("gmail reply keeps only new text", newTextOnly(gmail), "done T-3\nadd Ship the calendar recurrence");

// Outlook style.
const outlook = `done T-4

-----Original Message-----
From: F1 Media
done T-99`;
t("outlook reply stops at the divider", newTextOnly(outlook), "done T-4");

// Plain quote with no attribution line.
t("plain > quotes are cut", newTextOnly("reopen T-2\n> done T-50"), "reopen T-2");

// Some clients drop the original in with no marker except our own footer.
const bare = `note T-1 waiting on Garrett
Still open (9):
• T-7 Fix the calendar
  done T-7            — close it`;
t("our own footer is a boundary", newTextOnly(bare), "note T-1 waiting on Garrett");

// Nothing typed at all — must not act on the quoted original.
const emptyReply = `On Sat, Aug 23, 2026 at 5:00 PM F1 Media wrote:
> done T-7`;
t("empty reply yields nothing", newTextOnly(emptyReply), "");


// --- HTML replies -------------------------------------------------------
// Resend's webhook carries no body, so the message is fetched afterwards and
// `text` may be null. A Gmail HTML reply has to survive the round trip.

const htmlReply = `<div dir="ltr">done T-3<br>add Ship the calendar recurrence</div>` +
  `<blockquote class="gmail_quote"><div>Still open (9):<br>done T-7 — close it</div></blockquote>`;
t("html reply keeps only new text",
  newTextOnly(bodyOf({ id:"1", from:"g@x.com", subject:null, text:null, html:htmlReply })),
  "done T-3\nadd Ship the calendar recurrence");

t("block tags become line breaks, not run-on text",
  htmlToText("<p>done T-1</p><p>done T-2</p>"), "done T-1\ndone T-2");

t("entities are decoded",
  htmlToText("<p>note T-1 Bob &amp; Sue&#39;s sign</p>"), "note T-1 Bob & Sue's sign");

t("plain text wins when present",
  bodyOf({ id:"1", from:"g@x.com", subject:null, text:"done T-9", html:"<p>ignored</p>" }), "done T-9");

t("base64 data-uri html is decoded",
  bodyOf({ id:"1", from:"g@x.com", subject:null, text:null,
           html:"data:text/html;base64," + Buffer.from("<p>done T-5</p>").toString("base64"),
           html_format:"data_uri" }),
  "done T-5");

t("empty everything yields empty", bodyOf({ id:"1", from:"g@x.com", subject:null, text:null, html:null }), "");

console.log(`\n${fail===0?"all passed":fail+" failed"}\n`);
process.exit(fail?1:0);
