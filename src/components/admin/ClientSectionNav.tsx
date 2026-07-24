"use client";

// Sticky sub-tab bar for the client detail page. Each tab jumps to a section
// on the page (which carries a matching id) and the active tab tracks the
// section currently in view — so a long client page is navigable without
// endless scrolling.

import { useEffect, useState } from "react";

export interface Section {
  id: string;
  label: string;
}

export default function ClientSectionNav({ sections }: { sections: Section[] }) {
  const [active, setActive] = useState(sections[0]?.id ?? "");

  useEffect(() => {
    const els = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null);
    if (els.length === 0) return;

    // Highlight whichever section is nearest the top of the viewport, just
    // below the sticky bar.
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-96px 0px -60% 0px", threshold: 0 },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [sections]);

  function jump(id: string) {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActive(id);
    }
  }

  return (
    <div className="sticky top-0 z-30 -mx-8 mb-6 border-b border-[var(--color-border)] bg-[var(--color-bg)]/90 px-8 py-2 backdrop-blur">
      <nav className="flex flex-wrap gap-1">
        {sections.map((s) => {
          const on = active === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => jump(s.id)}
              className={
                "rounded-lg px-3 py-1.5 text-sm font-medium transition " +
                (on
                  ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)] border border-[var(--color-accent)]/40"
                  : "border border-transparent text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text)]")
              }
            >
              {s.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
