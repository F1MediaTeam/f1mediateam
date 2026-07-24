"use client";

// Drag-and-drop widget board. Wraps a set of children, each tagged with a
// stable widgetId, and lets the user reorder them via drag + hide individual
// ones via an × button in each tile's top-right. A hidden-widget list lives
// in the footer with click-to-restore. Layout (order + hidden set) is
// persisted to localStorage under a caller-provided storageKey.
//
// Lightweight: uses @dnd-kit/sortable with a horizontal-and-vertical grid
// strategy, so it works inside a CSS grid that has multiple columns and
// rows.

import { useMemo, useState, useSyncExternalStore } from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export interface WidgetSlot {
  id: string;
  label: string;            // shown in the +Add widget menu
  fullWidth?: boolean;      // span all columns
  node: React.ReactNode;    // pre-rendered panel content
}

interface Props {
  storageKey: string;
  widgets: WidgetSlot[];
  /** Tailwind grid classes for the inner container — caller controls cols/gap. */
  gridClassName?: string;
  /** When false, the × is hidden and every widget always shows. Reordering
   *  still works. Used for the client portal, where panels aren't theirs to
   *  remove. */
  canRemove?: boolean;
}

interface PersistedLayout {
  order: string[];
  hidden: string[];
}

function parseLayout(raw: string | null): PersistedLayout {
  if (!raw) return { order: [], hidden: [] };
  try {
    const parsed = JSON.parse(raw) as PersistedLayout;
    return {
      order: Array.isArray(parsed.order) ? parsed.order : [],
      hidden: Array.isArray(parsed.hidden) ? parsed.hidden : [],
    };
  } catch {
    return { order: [], hidden: [] };
  }
}

function saveLayout(key: string, layout: PersistedLayout) {
  try {
    window.localStorage.setItem(key, JSON.stringify(layout));
  } catch {
    /* localStorage full / disabled — ignore */
  }
}

function subscribeToStorage(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

export default function WidgetBoard({ storageKey, widgets, gridClassName, canRemove = true }: Props) {
  // localStorage is the source of truth for the persisted layout. The server
  // (and the hydration pass) see null → natural widget order, so SSR markup
  // matches; right after hydration React re-reads the real snapshot and the
  // persisted layout applies.
  const savedRaw = useSyncExternalStore(
    subscribeToStorage,
    () => window.localStorage.getItem(storageKey),
    () => null,
  );

  // Edits made during this mount take precedence over the persisted snapshot.
  const [edited, setEdited] = useState<PersistedLayout | null>(null);

  const { order, hidden } = useMemo(() => {
    const base = edited ?? parseLayout(savedRaw);
    const known = new Set(widgets.map((w) => w.id));
    const ordered = base.order.filter((id) => known.has(id));
    const missing = widgets.map((w) => w.id).filter((id) => !ordered.includes(id));
    return {
      order: [...ordered, ...missing],
      // With removal disabled, ignore any previously-saved hidden set so a
      // panel hidden before this change comes back rather than being stuck
      // off-screen with no restore control to bring it back.
      hidden: canRemove
        ? new Set(base.hidden.filter((id) => known.has(id)))
        : new Set<string>(),
    };
  }, [edited, savedRaw, widgets, canRemove]);

  function applyLayout(next: PersistedLayout) {
    setEdited(next);
    saveLayout(storageKey, next);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIdx = order.indexOf(active.id as string);
    const toIdx = order.indexOf(over.id as string);
    if (fromIdx < 0 || toIdx < 0) return;
    const next = order.slice();
    next.splice(fromIdx, 1);
    next.splice(toIdx, 0, active.id as string);
    applyLayout({ order: next, hidden: Array.from(hidden) });
  }

  const byId = useMemo(() => new Map(widgets.map((w) => [w.id, w] as const)), [widgets]);
  const visibleIds = order.filter((id) => !hidden.has(id));
  const hiddenList = widgets.filter((w) => hidden.has(w.id));

  return (
    <div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={visibleIds} strategy={rectSortingStrategy}>
          <div className={gridClassName ?? "grid grid-cols-1 lg:grid-cols-2 gap-4"}>
            {visibleIds.map((id) => {
              const w = byId.get(id);
              if (!w) return null;
              return (
                <SortableWidget
                  key={id}
                  id={id}
                  fullWidth={w.fullWidth}
                  canRemove={canRemove}
                  onHide={() => applyLayout({ order, hidden: [...Array.from(hidden), id] })}
                >
                  {w.node}
                </SortableWidget>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      {canRemove && hiddenList.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] mr-1">
            + Add widget
          </span>
          {hiddenList.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() =>
                applyLayout({
                  order: order.includes(w.id) ? order : [...order, w.id],
                  hidden: Array.from(hidden).filter((id) => id !== w.id),
                })
              }
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--color-border-strong)] bg-[var(--color-bg-elev)] hover:bg-[var(--color-bg-hover)] px-2.5 py-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            >
              <span className="leading-none">＋</span> {w.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SortableWidget({
  id,
  fullWidth,
  onHide,
  canRemove = true,
  children,
}: {
  id: string;
  fullWidth?: boolean;
  onHide: () => void;
  canRemove?: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 30 : undefined,
    opacity: isDragging ? 0.85 : 1,
  };

  // Hover-visible controls float just OUTSIDE the panel (negative offset)
  // and are smaller + translucent so they don't visually erase the card's
  // title when they appear. opacity-0 → 100 on hover means no layout shift.
  const btnCls =
    "absolute z-20 flex h-5 w-5 items-center justify-center rounded-md " +
    "border border-[var(--color-border-strong)]/70 bg-[var(--color-bg-card)]/95 " +
    "backdrop-blur text-[var(--color-text-muted)] shadow " +
    "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 " +
    "transition-opacity";

  return (
    <div ref={setNodeRef} style={style} className={`relative group ${fullWidth ? "lg:col-span-2" : ""}`}>
      {/* Drag handle floats above the top-left corner of the panel — does not
          overlap the title because of the negative top offset. */}
      <button
        type="button"
        aria-label="Drag to reorder"
        title="Drag to reorder"
        {...attributes}
        {...listeners}
        className={btnCls + " -top-2 -left-2 hover:text-[var(--color-text)] cursor-grab active:cursor-grabbing touch-none"}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="8" cy="6" r="1.6" /><circle cx="16" cy="6" r="1.6" />
          <circle cx="8" cy="12" r="1.6" /><circle cx="16" cy="12" r="1.6" />
          <circle cx="8" cy="18" r="1.6" /><circle cx="16" cy="18" r="1.6" />
        </svg>
      </button>

      {/* Hide (×) button — also floats outside the corner. Omitted entirely
          rather than disabled, so there's nothing for a client to click. */}
      {canRemove ? (
        <button
          type="button"
          onClick={onHide}
          aria-label="Hide widget"
          title="Hide widget"
          className={btnCls + " -top-2 -right-2 hover:text-red-300 hover:border-red-500/40 text-sm leading-none"}
        >
          ×
        </button>
      ) : null}

      {children}
    </div>
  );
}
