// Who can see which clients.
//
// `role` stays the coarse gate — admin opens the console, client opens the
// portal. `staff_role` narrows what an admin sees inside it:
//
//   owner        everything, including money and staff administration
//   manager      every client, but not staff administration
//   specialist   only the clients they are assigned to
//   contractor   only the clients they are assigned to, read-mostly
//
// A null staff_role means owner. That is what makes this safe to ship: every
// admin that existed before this feature keeps full access, and permissions
// are narrowed deliberately rather than by default.
//
// Pure functions only — no data-layer import. This module is pulled into
// client components (the staff table), and reaching the data layer from one
// drags next/headers into the browser bundle and fails the build.
// visibleClientIds lives in permissions.server.ts for that reason.

export type StaffRole = "owner" | "manager" | "specialist" | "contractor";

export const STAFF_ROLES: Array<{ id: StaffRole; label: string; blurb: string }> = [
  { id: "owner", label: "Owner", blurb: "Everything, including staff and billing." },
  { id: "manager", label: "Manager", blurb: "Every client. No staff administration." },
  { id: "specialist", label: "Specialist", blurb: "Only the clients they're assigned to." },
  { id: "contractor", label: "Contractor", blurb: "Only their assigned clients, and can't delete." },
];

export function staffRoleOf(profile: { staff_role?: string | null } | null | undefined): StaffRole {
  const r = profile?.staff_role;
  return r === "manager" || r === "specialist" || r === "contractor" ? r : "owner";
}

/** Sees every client, without needing an assignment. */
export function seesAllClients(staffRole: StaffRole): boolean {
  return staffRole === "owner" || staffRole === "manager";
}

/** May add, edit and remove staff and their roles. */
export function canManageStaff(staffRole: StaffRole): boolean {
  return staffRole === "owner";
}

/** May delete clients and other destructive, hard-to-undo actions. */
export function canDelete(staffRole: StaffRole): boolean {
  return staffRole === "owner" || staffRole === "manager";
}

/** Convenience for pages that already loaded the full client list. */
export function filterClients<T extends { id: string }>(
  clients: T[],
  allowed: string[] | null,
): T[] {
  if (allowed === null) return clients;
  const set = new Set(allowed);
  return clients.filter((c) => set.has(c.id));
}
