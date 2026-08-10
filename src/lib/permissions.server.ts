// Server-side half of the permission model.
//
// Split from permissions.ts because that module is imported by client
// components, and anything reaching the data layer pulls next/headers into the
// browser bundle — which fails the build rather than degrading.

import { data } from "@/lib/data";
import type { Session } from "@/lib/data";
import { seesAllClients, staffRoleOf } from "@/lib/permissions";

/**
 * The client ids this person may see, or null for "no restriction".
 *
 * Null rather than a list of every id on purpose: callers skip filtering
 * entirely in the common case, and a bug here fails toward the behaviour the
 * app had before rather than blanking a manager's client list.
 */
export async function visibleClientIds(session: Session): Promise<string[] | null> {
  if (session.role !== "admin") return session.client_id ? [session.client_id] : [];

  const profile = await data.getProfile(session.user_id);
  const staffRole = staffRoleOf(profile);
  if (seesAllClients(staffRole)) return null;

  return data.listAssignedClientIds(session.user_id);
}
