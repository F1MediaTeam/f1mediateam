"use client";

// The business profile behind a site — used both to onboard a new client and
// to fill in one that was added before this existed.
//
// Five plain-English fields. Nothing here asks for anything technical, because
// the person who knows what a client sells is not usually the person who knows
// what a location code is. Everything technical is derived: keywords, buyer
// questions, rank-tracking locations and install instructions all come out of
// these answers.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateSiteProfileAction } from "@/app/admin/pulse/actions";
import { PLATFORM_PRESETS } from "@/lib/pulse/onboarding";

const field =
  "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-2 text-sm outline-none focus:border-[var(--color-border-strong)]";
const label = "mb-1 block text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]";
const hint = "mt-1 block text-[10px] leading-relaxed text-[var(--color-text-subtle)]";

export default function SiteProfileForm({
  siteId,
  initial,
}: {
  siteId: string;
  initial: {
    industry: string | null;
    services: string[];
    serviceAreas: string[];
    platform: string | null;
    profileNotes: string | null;
    crawlExclusions: string[];
  };
}) {
  const router = useRouter();
  const [industry, setIndustry] = useState(initial.industry ?? "");
  const [services, setServices] = useState(initial.services.join("\n"));
  const [areas, setAreas] = useState(initial.serviceAreas.join("\n"));
  const [platform, setPlatform] = useState(initial.platform ?? "");
  const [notes, setNotes] = useState(initial.profileNotes ?? "");
  const [exclusions, setExclusions] = useState(initial.crawlExclusions.join("\n"));
  const [reseed, setReseed] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(null);
    start(async () => {
      const res = await updateSiteProfileAction({
        siteId,
        industry,
        services,
        serviceAreas: areas,
        platform,
        profileNotes: notes,
        crawlExclusions: exclusions,
        reseed,
      });
      if (res.error) return setError(res.error);
      setSaved(
        res.seeded
          ? `Saved. Proposed ${res.seeded.keywords} keywords and ${res.seeded.prompts} buyer questions — review them before they go live.`
          : "Saved.",
      );
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={label}>What do they do?</span>
          <input
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            placeholder="screen printing and custom apparel"
            className={field}
          />
          <span className={hint}>A few plain words. Any industry — nothing here is specific to printing.</span>
        </label>

        <label className="block">
          <span className={label}>Website platform</span>
          <input
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            list="pulse-platforms"
            placeholder="WordPress"
            className={field}
          />
          <datalist id="pulse-platforms">
            {PLATFORM_PRESETS.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          <span className={hint}>Only decides which install guide is shown. Free text is fine.</span>
        </label>

        <label className="block">
          <span className={label}>What do they sell? One per line</span>
          <textarea
            value={services}
            onChange={(e) => setServices(e.target.value)}
            rows={5}
            placeholder={"screen printing\nembroidery\ndtf transfers"}
            className={field}
          />
          <span className={hint}>These become the keywords and the questions buyers ask.</span>
        </label>

        <label className="block">
          <span className={label}>Where do they sell it? One per line</span>
          <textarea
            value={areas}
            onChange={(e) => setAreas(e.target.value)}
            rows={5}
            placeholder={"tempe az\nphoenix az"}
            className={field}
          />
          <span className={hint}>
            Leave empty for a national business — that is a real setting, not a blank. It switches rank
            tracking to nationwide and changes how the keywords are phrased.
          </span>
        </label>
      </div>

      <label className="block">
        <span className={label}>Anything the crawler should skip? One per line</span>
        <input
          value={exclusions}
          onChange={(e) => setExclusions(e.target.value)}
          placeholder="/designer/"
          className={field}
        />
        <span className={hint}>
          Paths that generate endless URLs — product designers, filters, calendars.
        </span>
      </label>

      <label className="block">
        <span className={label}>Notes</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Anything that shapes the work and isn't captured above."
          className={field}
        />
      </label>

      <label className="flex items-start gap-2 text-xs">
        <input
          type="checkbox"
          checked={reseed}
          onChange={(e) => setReseed(e.target.checked)}
          className="mt-0.5"
        />
        <span className="text-[var(--color-text-muted)]">
          Propose keywords and buyer questions from this profile. Existing entries are never changed or
          removed — this only adds what is missing, so anything you have already edited or paused stays
          as you left it.
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-[var(--color-accent)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save profile"}
        </button>
        {saved ? (
          <span className="text-[11px]" style={{ color: "var(--color-ok)" }}>
            {saved}
          </span>
        ) : null}
        {error ? (
          <span className="text-[11px]" style={{ color: "var(--color-bad)" }} role="alert">
            {error}
          </span>
        ) : null}
      </div>
    </form>
  );
}
