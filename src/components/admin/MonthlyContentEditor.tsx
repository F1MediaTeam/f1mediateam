"use client";

// Editable preview of the synthesized MonthlyContent JSON, shown on
// /admin/reports between "Preview & edit" and "Generate .pptx". Renders every
// section of the deck as an editable card — strings become inputs/textareas,
// string lists become line-per-item textareas, tables recurse — plus an
// image-upload section that becomes real slides in the .pptx.
//
// Deliberately generic: the synthesis bot's schema evolves, and a generic
// walker keeps every new field editable without touching this file.

import { useRef } from "react";
import type { MonthlyContent } from "@/lib/deck/f1-monthly/deck-builder";

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

const inputCls =
  "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-sm";
const keyCls = "block text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1";

// "photoBacklink" → "Photo Backlink"
function prettify(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

function setAtPath(root: Json, path: (string | number)[], value: Json): Json {
  if (path.length === 0) return value;
  const [head, ...rest] = path;
  if (Array.isArray(root)) {
    const next = root.slice();
    next[head as number] = setAtPath(next[head as number] ?? null, rest, value);
    return next;
  }
  const obj = { ...(root as { [k: string]: Json }) };
  obj[head as string] = setAtPath(obj[head as string] ?? null, rest, value);
  return obj;
}

function isStringArray(v: Json[]): v is string[] {
  return v.every((x) => typeof x === "string");
}

function ValueEditor({
  value,
  path,
  onSet,
}: {
  value: Json;
  path: (string | number)[];
  onSet: (path: (string | number)[], value: Json) => void;
}) {
  if (value === null || value === undefined) {
    return <div className="text-xs text-[var(--color-text-subtle)] italic">not included in this deck</div>;
  }
  if (typeof value === "string") {
    const long = value.length > 80 || value.includes("\n");
    return long ? (
      <textarea
        className={inputCls}
        rows={Math.min(6, Math.max(2, Math.ceil(value.length / 90)))}
        value={value}
        onChange={(e) => onSet(path, e.target.value)}
      />
    ) : (
      <input className={inputCls} value={value} onChange={(e) => onSet(path, e.target.value)} />
    );
  }
  if (typeof value === "number") {
    return (
      <input
        type="number"
        className={inputCls}
        value={value}
        onChange={(e) => onSet(path, Number(e.target.value))}
      />
    );
  }
  if (typeof value === "boolean") {
    return (
      <input type="checkbox" checked={value} onChange={(e) => onSet(path, e.target.checked)} />
    );
  }
  if (Array.isArray(value)) {
    if (isStringArray(value)) {
      return (
        <textarea
          className={inputCls}
          rows={Math.min(8, Math.max(2, value.length + 1))}
          value={value.join("\n")}
          onChange={(e) => onSet(path, e.target.value.split("\n"))}
        />
      );
    }
    return (
      <div className="space-y-2">
        {value.map((item, i) => (
          <div key={i} className="rounded-lg border border-[var(--color-border)] p-2.5 relative">
            <button
              type="button"
              title="Remove row"
              onClick={() => onSet(path, value.filter((_, j) => j !== i) as Json)}
              className="absolute top-1.5 right-1.5 text-[var(--color-text-muted)] hover:text-red-300 text-sm leading-none"
            >
              ×
            </button>
            <ValueEditor value={item} path={[...path, i]} onSet={onSet} />
          </div>
        ))}
      </div>
    );
  }
  // object
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {Object.entries(value).map(([k, v]) => (
        <div key={k} className={typeof v === "object" && v !== null ? "sm:col-span-2" : ""}>
          <span className={keyCls}>{prettify(k)}</span>
          <ValueEditor value={v} path={[...path, k]} onSet={onSet} />
        </div>
      ))}
    </div>
  );
}

// Top-level string fields grouped into one "Meta" card instead of eight tiny ones.
const META_KEYS = ["client", "website", "industry", "services", "reportPeriod", "meetingDate", "tier", "brandKey"];

export default function MonthlyContentEditor({
  content,
  onChange,
}: {
  content: MonthlyContent;
  onChange: (next: MonthlyContent) => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const root = content as unknown as { [k: string]: Json };

  function onSet(path: (string | number)[], value: Json) {
    onChange(setAtPath(root, path, value) as unknown as MonthlyContent);
  }

  function addImage(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      window.alert("Keep slide images under 4 MB — they embed directly in the deck.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const images = [
        ...(content.images ?? []),
        { title: file.name.replace(/\.[a-z0-9]+$/i, ""), caption: "", data: String(reader.result) },
      ];
      onChange({ ...content, images });
      if (fileRef.current) fileRef.current.value = "";
    };
    reader.readAsDataURL(file);
  }

  const sections = Object.entries(root).filter(
    ([k]) => !META_KEYS.includes(k) && k !== "images",
  );
  const images = content.images ?? [];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-4">
        <div className="text-sm font-semibold mb-3">Report meta</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {META_KEYS.filter((k) => k in root).map((k) => (
            <div key={k}>
              <span className={keyCls}>{prettify(k)}</span>
              <ValueEditor value={root[k]} path={[k]} onSet={onSet} />
            </div>
          ))}
        </div>
      </div>

      {sections.map(([k, v]) => (
        <div key={k} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-4">
          <div className="text-sm font-semibold mb-3">{prettify(k)}</div>
          <ValueEditor value={v} path={[k]} onSet={onSet} />
        </div>
      ))}

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold">Image slides</div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-md border border-[var(--color-border-strong)] px-2.5 py-1.5 text-xs hover:bg-[var(--color-bg-hover)]"
          >
            + Add image
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => addImage(e.target.files)} />
        </div>
        {images.length === 0 ? (
          <div className="text-xs text-[var(--color-text-muted)]">
            No image slides yet — screenshots, before/afters, and photos each become their own slide before &quot;What&apos;s Next&quot;.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {images.map((img, i) => (
              <div key={i} className="rounded-lg border border-[var(--color-border)] p-2.5 space-y-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.data} alt={img.title ?? "slide image"} className="w-full h-32 object-contain rounded bg-white/5" />
                <input
                  className={inputCls}
                  placeholder="Slide title"
                  value={img.title ?? ""}
                  onChange={(e) => {
                    const next = images.map((m, j) => (j === i ? { ...m, title: e.target.value } : m));
                    onChange({ ...content, images: next });
                  }}
                />
                <input
                  className={inputCls}
                  placeholder="Caption (optional)"
                  value={img.caption ?? ""}
                  onChange={(e) => {
                    const next = images.map((m, j) => (j === i ? { ...m, caption: e.target.value } : m));
                    onChange({ ...content, images: next });
                  }}
                />
                <button
                  type="button"
                  onClick={() => onChange({ ...content, images: images.filter((_, j) => j !== i) })}
                  className="text-xs text-red-300 hover:underline"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
