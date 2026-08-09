// The admin sidebar's arrangement — order, and which items are tucked under
// which.
//
// Two levels only. A third would need indent guides and collapse-all handling
// to stay readable in a 240px rail, and nothing in the console is three levels
// deep. Dropping onto an item that is already a child moves the dragged item
// alongside it rather than nesting further.
//
// Stored per browser in localStorage: tidying the menu is a personal
// preference, like the theme. If it should become a company-wide default
// later, this module is the only thing that has to change.

export interface NavItem {
  href: string;
  label: string;
}

export interface NavNode extends NavItem {
  children: NavItem[];
}

export const STORAGE_KEY = "admin-nav-layout";

/** The shipped arrangement, and the fallback whenever a saved one is stale. */
export const DEFAULT_NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/command-center", label: "Command Center" },
  { href: "/admin/clients", label: "Clients" },
  { href: "/admin/content", label: "Content" },
  { href: "/admin/messages", label: "Messages" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/documents", label: "Documents" },
  { href: "/admin/audit", label: "Activity" },
  { href: "/admin/tools", label: "Tools" },
  { href: "/admin/settings", label: "Settings" },
];

export const DEFAULT_TREE: NavNode[] = DEFAULT_NAV.map((i) => ({ ...i, children: [] }));

/** Every href in a tree, parents and children alike. */
function hrefsOf(tree: NavNode[]): string[] {
  return tree.flatMap((n) => [n.href, ...n.children.map((c) => c.href)]);
}

/**
 * Rebuild a saved tree against the current menu.
 *
 * A saved layout can outlive the code: pages get added and removed. Rather
 * than throwing the arrangement away on any mismatch, keep every item that
 * still exists in the order it was put in, drop the ones that don't, and
 * append anything new at the end so a newly shipped page can never be
 * invisible.
 */
export function reconcile(saved: unknown): NavNode[] {
  const known = new Map(DEFAULT_NAV.map((i) => [i.href, i]));
  const out: NavNode[] = [];
  const used = new Set<string>();

  if (Array.isArray(saved)) {
    for (const raw of saved) {
      if (!raw || typeof raw !== "object") continue;
      const node = raw as Partial<NavNode>;
      const parent = typeof node.href === "string" ? known.get(node.href) : undefined;
      if (!parent || used.has(parent.href)) continue;
      used.add(parent.href);

      const children: NavItem[] = [];
      if (Array.isArray(node.children)) {
        for (const rawChild of node.children) {
          const href = (rawChild as Partial<NavItem>)?.href;
          const child = typeof href === "string" ? known.get(href) : undefined;
          if (!child || used.has(child.href)) continue;
          used.add(child.href);
          children.push(child);
        }
      }
      out.push({ ...parent, children });
    }
  }

  for (const item of DEFAULT_NAV) {
    if (!used.has(item.href)) out.push({ ...item, children: [] });
  }
  return out;
}

export function loadNav(): NavNode[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_TREE;
    return reconcile(JSON.parse(raw));
  } catch {
    return DEFAULT_TREE;
  }
}

export function saveNav(tree: NavNode[]): void {
  try {
    // Only the shape is stored; labels come from DEFAULT_NAV on load, so
    // renaming a page in code renames it in everyone's saved menu too.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(tree.map((n) => ({ href: n.href, children: n.children.map((c) => ({ href: c.href })) }))),
    );
  } catch {
    // storage disabled — the arrangement still holds for this session
  }
}

export function isDefaultLayout(tree: NavNode[]): boolean {
  const a = hrefsOf(tree).join("|");
  const b = DEFAULT_NAV.map((i) => i.href).join("|");
  return a === b && tree.every((n) => n.children.length === 0);
}

// ---- the four moves the editor can make ----

/** Pull an item out of the tree, returning it and the tree without it. */
function extract(tree: NavNode[], href: string): { item: NavItem | null; rest: NavNode[] } {
  let item: NavItem | null = null;
  const rest = tree
    .map((n) => {
      if (n.href === href) {
        item = { href: n.href, label: n.label };
        return null;
      }
      const kept = n.children.filter((c) => {
        if (c.href === href) {
          item = c;
          return false;
        }
        return true;
      });
      return kept.length === n.children.length ? n : { ...n, children: kept };
    })
    .filter((n): n is NavNode => n !== null);
  return { item, rest };
}

/**
 * Nest `dragged` under `target`.
 *
 * A parent that already has children keeps them — they move up to top level
 * rather than being deleted, since nothing should disappear from the menu as
 * a side effect of a drag.
 */
export function nestUnder(tree: NavNode[], draggedHref: string, targetHref: string): NavNode[] {
  if (draggedHref === targetHref) return tree;

  // Dropping a parent onto something would orphan its children; lift them out
  // first so they stay reachable.
  const dragged = tree.find((n) => n.href === draggedHref);
  let working = tree;
  if (dragged && dragged.children.length > 0) {
    const at = working.findIndex((n) => n.href === draggedHref);
    working = [
      ...working.slice(0, at),
      { ...dragged, children: [] },
      ...dragged.children.map((c) => ({ ...c, children: [] })),
      ...working.slice(at + 1),
    ];
  }

  const { item, rest } = extract(working, draggedHref);
  if (!item) return tree;

  // Nesting onto a child means "sit beside it", not a third level.
  const parentOfTarget = rest.find((n) => n.children.some((c) => c.href === targetHref));
  if (parentOfTarget) {
    return rest.map((n) =>
      n.href === parentOfTarget.href
        ? {
            ...n,
            children: [
              ...n.children.slice(0, n.children.findIndex((c) => c.href === targetHref) + 1),
              item,
              ...n.children.slice(n.children.findIndex((c) => c.href === targetHref) + 1),
            ],
          }
        : n,
    );
  }

  return rest.map((n) => (n.href === targetHref ? { ...n, children: [...n.children, item] } : n));
}

/** Move an item to top level, positioned before `beforeHref` (or at the end). */
export function moveToTop(tree: NavNode[], draggedHref: string, beforeHref: string | null): NavNode[] {
  const { item, rest } = extract(tree, draggedHref);
  if (!item) return tree;
  const node: NavNode = {
    ...item,
    children: tree.find((n) => n.href === draggedHref)?.children ?? [],
  };
  if (!beforeHref) return [...rest, node];
  const at = rest.findIndex((n) => n.href === beforeHref);
  if (at === -1) return [...rest, node];
  return [...rest.slice(0, at), node, ...rest.slice(at)];
}

/** Lift a child back out to top level, directly after its old parent. */
export function unnest(tree: NavNode[], href: string): NavNode[] {
  const parentIndex = tree.findIndex((n) => n.children.some((c) => c.href === href));
  if (parentIndex === -1) return tree;
  const parent = tree[parentIndex];
  const child = parent.children.find((c) => c.href === href)!;
  const trimmed = { ...parent, children: parent.children.filter((c) => c.href !== href) };
  return [
    ...tree.slice(0, parentIndex),
    trimmed,
    { ...child, children: [] },
    ...tree.slice(parentIndex + 1),
  ];
}
