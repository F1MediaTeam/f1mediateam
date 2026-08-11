"use client";

// The install card — what someone actually uses to get a tag onto a site.
//
// The snippet, per-platform instructions for the three hosts these clients are
// on, a check that proves the install, and the privacy line the client needs in
// their policy. Kept together because they are one job: paste this, confirm it
// worked, tell your customer what it does.

import { useState, useTransition } from "react";
import { Check, Copy, RefreshCw } from "lucide-react";
import { checkInstallAction } from "@/app/admin/pulse/actions";

type Platform = "deconetwork" | "shopify" | "wordpress";

const PLATFORMS: Array<{ id: Platform; label: string; steps: string[] }> = [
  {
    id: "deconetwork",
    label: "DecoNetwork",
    steps: [
      "Admin → Website → Website Settings",
      "Open the Global Footer Scripts box",
      "Paste the snippet and save",
      "It applies to every page, including the store and checkout",
    ],
  },
  {
    id: "shopify",
    label: "Shopify",
    steps: [
      "Online Store → Themes → ⋯ → Edit code",
      "Open Layout / theme.liquid",
      "Paste the snippet immediately before </body>",
      "Save — it applies to every themed page",
    ],
  },
  {
    id: "wordpress",
    label: "WordPress",
    steps: [
      "Appearance → Theme File Editor, or a code-injection plugin",
      "Find the Footer / before-</body> field",
      "Paste the snippet and update",
      "With a caching plugin, purge the cache afterwards",
    ],
  },
];

const PRIVACY_LINE =
  "This site uses privacy-friendly, first-party, cookieless analytics provided by F1 Media Team. No personal information is collected and no tracking cookies are used.";

export default function PulseInstallCard({
  siteId,
  domain,
  snippet,
  status,
}: {
  siteId: string;
  domain: string;
  snippet: string;
  status: string;
}) {
  const [platform, setPlatform] = useState<Platform>("deconetwork");
  const [copied, setCopied] = useState<string | null>(null);
  const [check, setCheck] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function copy(text: string, what: string) {
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(what);
        setTimeout(() => setCopied(null), 2000);
      },
      () => setCopied("Couldn't copy — select it manually."),
    );
  }

  function verify() {
    setCheck(null);
    startTransition(async () => {
      const res = await checkInstallAction(siteId);
      setCheck(res.error ?? res.reason ?? null);
    });
  }

  const active = PLATFORMS.find((p) => p.id === platform)!;

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
            Paste into the footer of {domain}
          </span>
          <button
            type="button"
            onClick={() => copy(snippet, "Snippet copied.")}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-2 py-1 text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            <Copy size={11} /> Copy
          </button>
        </div>
        <pre className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-3 font-mono text-[11px] leading-relaxed">
          {snippet}
        </pre>
      </div>

      <div>
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {PLATFORMS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPlatform(p.id)}
              className={
                "rounded-full border px-2.5 py-1 text-[11px] font-medium transition " +
                (p.id === platform
                  ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                  : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]")
              }
            >
              {p.label}
            </button>
          ))}
        </div>
        <ol className="space-y-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-3">
          {active.steps.map((s, i) => (
            <li key={s} className="flex gap-2 text-[11px] leading-relaxed text-[var(--color-text-muted)]">
              <span className="font-mono text-[var(--color-text-subtle)]">{i + 1}.</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={verify}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-2 text-xs font-semibold text-[var(--color-on-accent)] disabled:opacity-50"
        >
          <RefreshCw size={13} className={pending ? "animate-spin" : ""} />
          {pending ? "Checking…" : "Check installation"}
        </button>
        <span className="text-[11px] text-[var(--color-text-muted)]">
          {check ??
            (status === "live"
              ? "Live — beacons are arriving."
              : "Checks the page source and whether any visit has been recorded.")}
        </span>
      </div>

      {/* The client needs this in their privacy policy. Given to them here so
          it isn't a separate conversation later. */}
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-3">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
            For the client&apos;s privacy policy
          </span>
          <button
            type="button"
            onClick={() => copy(PRIVACY_LINE, "Privacy line copied.")}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-2 py-1 text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            <Copy size={11} /> Copy
          </button>
        </div>
        <p className="text-[11px] leading-relaxed text-[var(--color-text-muted)]">{PRIVACY_LINE}</p>
      </div>

      {copied ? (
        <p className="flex items-center gap-1.5 text-[11px] text-[var(--color-accent)]">
          <Check size={12} /> {copied}
        </p>
      ) : null}
    </div>
  );
}
