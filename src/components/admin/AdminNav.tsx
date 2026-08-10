"use client";

// The admin sidebar menu, rearrangeable.
//
// Out of edit mode this is just links, so the common case — clicking through
// the console — is untouched. Turning on Edit swaps the links for drag
// handles, because a list where every row is both a link and a drag target is
// a list where you keep navigating away by accident.
//
// Two drop targets per row, which is what makes nesting discoverable without
// instructions: the thin strip between rows reorders, and the row itself
// tucks the dragged item underneath. Native HTML5 drag-and-drop rather than a
// library — two distinct drop zones per row is exactly what it's good at.

import { useMemo, useState } from "react";
import Link from "next/link";
import { GripVertical, Pencil, CornerDownRight, RotateCcw, Check } from "lucide-react";
import { useHydrated } from "@/lib/use-hydrated";
import {
  DEFAULT_TREE,
  isDefaultLayout,
  loadNav,
  moveToTop,
  nestUnder,
  saveNav,
  unnest,
  type NavItem,
  type NavNode,
} from "@/lib/nav-layout";

interface DragState {
  dragHref: string | null;
  nestTarget: string | null;
  gapTarget: string | null;
}

const NO_DRAG: DragState = { dragHref: null, nestTarget: null, gapTarget: null };

function rowClass(active: string | undefined, href: string, child: boolean): string {
  return (
    "flex items-center justify-between rounded-lg px-3 py-2 text-sm transition " +
    (child ? "ml-3 text-[13px] " : "") +
    (active === href
      ? "bg-[var(--color-sidebar-active-bg)] text-[var(--color-sidebar-active-text)]"
      : "bg-[var(--color-sidebar-item-bg)] text-[var(--color-sidebar-item-text)] hover:bg-[var(--color-sidebar-active-bg)] hover:text-[var(--color-sidebar-active-text)]")
  );
}

/** The clients' own colours, shown on the Clients row so the palette is
 *  visible from anywhere in the console rather than only on the calendar. */
function ClientDots({ colors }: { colors: string[] }) {
  if (colors.length === 0) return null;
  return (
    <span className="flex shrink-0 items-center gap-1" aria-hidden>
      {colors.slice(0, 6).map((hex) => (
        <span
          key={hex}
          className="h-2.5 w-2.5 rounded-full ring-1 ring-black/20"
          style={{ background: hex }}
        />
      ))}
    </span>
  );
}

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="flex h-[20px] min-w-[20px] items-center justify-center rounded-full bg-[var(--color-bad)] px-1.5 text-[10px] font-semibold tabular-nums text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}

/** The strip between two rows. Dropping here places the item at that position. */
function Gap({
  beforeHref,
  drag,
  setDrag,
  onDrop,
}: {
  beforeHref: string | null;
  drag: DragState;
  setDrag: (d: DragState) => void;
  onDrop: (beforeHref: string | null) => void;
}) {
  if (!drag.dragHref) return null;
  const key = beforeHref ?? "__end";
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDrag({ ...drag, gapTarget: key });
      }}
      onDragLeave={() => setDrag({ ...drag, gapTarget: drag.gapTarget === key ? null : drag.gapTarget })}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(beforeHref);
      }}
      className="h-1.5 rounded-full transition"
      style={{ background: drag.gapTarget === key ? "var(--color-accent)" : "transparent" }}
    />
  );
}

function Row({
  node,
  child,
  active,
  editing,
  unread,
  clientColors,
  drag,
  setDrag,
  onNest,
  onUnnest,
}: {
  node: NavItem;
  child: boolean;
  active?: string;
  editing: boolean;
  unread: number;
  clientColors: string[];
  drag: DragState;
  setDrag: (d: DragState) => void;
  onNest: (draggedHref: string, targetHref: string) => void;
  onUnnest: (href: string) => void;
}) {
  const badgeCount = node.href === "/admin/messages" ? unread : 0;
  const dots = node.href === "/admin/clients" ? clientColors : [];

  if (!editing) {
    return (
      <Link
        href={node.href}
        data-style-id={`nav-${node.label.toLowerCase().replace(/\s+/g, "-")}`}
        className={rowClass(active, node.href, child)}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {child ? <CornerDownRight size={12} className="shrink-0 opacity-50" aria-hidden /> : null}
          <span className="truncate">{node.label}</span>
        </span>
        {dots.length > 0 ? <ClientDots colors={dots} /> : <Badge count={badgeCount} />}
      </Link>
    );
  }

  const isNestTarget = drag.nestTarget === node.href && drag.dragHref !== node.href;

  return (
    <div
      draggable
      onDragStart={() => setDrag({ ...NO_DRAG, dragHref: node.href })}
      onDragEnd={() => setDrag(NO_DRAG)}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag({ ...drag, nestTarget: node.href });
      }}
      onDragLeave={() =>
        setDrag({ ...drag, nestTarget: drag.nestTarget === node.href ? null : drag.nestTarget })
      }
      onDrop={(e) => {
        e.preventDefault();
        if (drag.dragHref && drag.dragHref !== node.href) onNest(drag.dragHref, node.href);
      }}
      className={
        rowClass(active, node.href, child) +
        " cursor-grab select-none active:cursor-grabbing " +
        (drag.dragHref === node.href ? "opacity-40 " : "")
      }
      style={isNestTarget ? { outline: "2px solid var(--color-accent)", outlineOffset: "-2px" } : undefined}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <GripVertical size={13} className="shrink-0 opacity-45" aria-hidden />
        {child ? <CornerDownRight size={12} className="shrink-0 opacity-50" aria-hidden /> : null}
        <span className="truncate">{node.label}</span>
      </span>
      {child ? (
        <button
          type="button"
          onClick={() => onUnnest(node.href)}
          title="Move back out to the top level"
          className="shrink-0 rounded px-1 text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)] hover:text-[var(--color-text)]"
        >
          out
        </button>
      ) : (
        <Badge count={badgeCount} />
      )}
    </div>
  );
}

export default function AdminNav({
  active,
  totalUnread,
  clientColors = [],
}: {
  active?: string;
  totalUnread: number;
  clientColors?: string[];
}) {
  const hydrated = useHydrated();
  // The saved arrangement can only be read in the browser. Until then render
  // the shipped order, which is what the server rendered too — reading it in
  // an effect and calling setState would cost an extra render of the whole
  // sidebar on every page load.
  const [edited, setEdited] = useState<NavNode[] | null>(null);
  const saved = useMemo(() => (hydrated ? loadNav() : DEFAULT_TREE), [hydrated]);
  const tree = edited ?? saved;

  const [editing, setEditing] = useState(false);
  const [drag, setDrag] = useState<DragState>(NO_DRAG);

  function commit(next: NavNode[]) {
    setEdited(next);
    saveNav(next);
    setDrag(NO_DRAG);
  }

  return (
    <nav data-style-id="admin-nav" className="mt-2 flex flex-col px-2">
      {tree.map((node) => (
        <div key={node.href}>
          {editing ? (
            <Gap
              beforeHref={node.href}
              drag={drag}
              setDrag={setDrag}
              onDrop={(before) => drag.dragHref && commit(moveToTop(tree, drag.dragHref, before))}
            />
          ) : null}
          <Row
            node={node}
            child={false}
            active={active}
            editing={editing}
            unread={totalUnread}
            clientColors={clientColors}
            drag={drag}
            setDrag={setDrag}
            onNest={(d, t) => commit(nestUnder(tree, d, t))}
            onUnnest={(h) => commit(unnest(tree, h))}
          />
          {node.children.length > 0 ? (
            <div className="mt-0.5 flex flex-col gap-0.5 border-l border-[var(--color-sidebar-border)] pl-1">
              {node.children.map((c) => (
                <Row
                  key={c.href}
                  node={c}
                  child
                  active={active}
                  editing={editing}
                  unread={totalUnread}
                  clientColors={clientColors}
                  drag={drag}
                  setDrag={setDrag}
                  onNest={(d, t) => commit(nestUnder(tree, d, t))}
                  onUnnest={(h) => commit(unnest(tree, h))}
                />
              ))}
            </div>
          ) : null}
        </div>
      ))}
      {editing ? (
        <Gap
          beforeHref={null}
          drag={drag}
          setDrag={setDrag}
          onDrop={(before) => drag.dragHref && commit(moveToTop(tree, drag.dragHref, before))}
        />
      ) : null}

      <div className="mt-3 flex items-center gap-2 border-t border-[var(--color-sidebar-border)] pt-2">
        <button
          type="button"
          onClick={() => {
            setEditing((v) => !v);
            setDrag(NO_DRAG);
          }}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] uppercase tracking-wider text-[var(--color-sidebar-muted)] transition hover:bg-[var(--color-sidebar-active-bg)] hover:text-[var(--color-sidebar-active-text)]"
        >
          {editing ? <Check size={12} /> : <Pencil size={12} />}
          {editing ? "Done" : "Edit menu"}
        </button>
        {editing && !isDefaultLayout(tree) ? (
          <button
            type="button"
            onClick={() => commit(DEFAULT_TREE)}
            title="Put the menu back the way it shipped"
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] uppercase tracking-wider text-[var(--color-sidebar-muted)] transition hover:bg-[var(--color-sidebar-active-bg)] hover:text-[var(--color-sidebar-active-text)]"
          >
            <RotateCcw size={12} />
            Reset
          </button>
        ) : null}
      </div>

      {editing ? (
        <p className="px-2 pt-1.5 text-[10px] leading-relaxed text-[var(--color-sidebar-muted)]">
          Drag between items to reorder. Drop onto an item to file it underneath.
        </p>
      ) : null}
    </nav>
  );
}
