"use client";

// Staff and what each of them can see.
//
// Role is a dropdown per person; the client checkboxes appear only for the
// roles that are actually limited by them. Showing an assignment list next to
// a manager would imply it restricts them, when it doesn't — owners and
// managers see every client whatever this table says.

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { STAFF_ROLES, seesAllClients, staffRoleOf, type StaffRole } from "@/lib/permissions";
import { clientColor } from "@/lib/client-color";
import { setAssignmentAction, setStaffRoleAction } from "@/app/admin/actions";

interface StaffRow {
  id: string;
  email: string;
  full_name: string | null;
  staff_role: string | null;
}

export default function StaffTable({
  staff,
  clients,
  assignments,
  canManage,
  currentUserId,
}: {
  staff: StaffRow[];
  clients: Array<{ id: string; company_name: string; ui_color?: string | null }>;
  assignments: Array<{ profile_id: string; client_id: string }>;
  canManage: boolean;
  currentUserId: string;
}) {
  const [rows, setRows] = useState(staff);
  const [links, setLinks] = useState(assignments);
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isAssigned = (profileId: string, clientId: string) =>
    links.some((a) => a.profile_id === profileId && a.client_id === clientId);

  function changeRole(profileId: string, staffRole: string) {
    const previous = rows;
    setRows((rs) => rs.map((r) => (r.id === profileId ? { ...r, staff_role: staffRole } : r)));
    setNote(null);
    startTransition(async () => {
      const res = await setStaffRoleAction({ profileId, staffRole });
      if (res.error) {
        setRows(previous); // the server refused — put the dropdown back
        setNote(res.error);
      } else {
        setNote("Saved.");
      }
    });
  }

  function toggleClient(profileId: string, clientId: string) {
    const assigned = !isAssigned(profileId, clientId);
    const previous = links;
    setLinks((ls) =>
      assigned
        ? [...ls, { profile_id: profileId, client_id: clientId }]
        : ls.filter((a) => !(a.profile_id === profileId && a.client_id === clientId)),
    );
    setNote(null);
    startTransition(async () => {
      const res = await setAssignmentAction({ profileId, clientId, assigned });
      if (res.error) {
        setLinks(previous);
        setNote(res.error);
      }
    });
  }

  return (
    <div className="space-y-3">
      {!canManage ? (
        <p className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-[11px] text-[var(--color-text-muted)]">
          Only an owner can change roles or assignments. This is a read-only view.
        </p>
      ) : null}

      <div className="space-y-2">
        {rows.map((person) => {
          const role = staffRoleOf(person);
          const unlimited = seesAllClients(role);
          return (
            <div
              key={person.id}
              data-panel=""
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-3"
            >
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">
                    {person.full_name ?? person.email}
                    {person.id === currentUserId ? (
                      <span className="ml-2 text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)]">
                        you
                      </span>
                    ) : null}
                  </div>
                  <div className="truncate text-[11px] text-[var(--color-text-muted)]">
                    {person.email}
                  </div>
                </div>

                <select
                  value={role}
                  disabled={!canManage || pending}
                  onChange={(e) => changeRole(person.id, e.target.value)}
                  aria-label={`Role for ${person.email}`}
                  className="h-9 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-2 text-xs disabled:opacity-50"
                >
                  {STAFF_ROLES.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              <p className="mt-1.5 text-[11px] text-[var(--color-text-muted)]">
                {STAFF_ROLES.find((r) => r.id === role)?.blurb}
              </p>

              {/* Only the limited roles get an assignment list — showing one
                  for a manager would imply it restricts them, and it doesn't. */}
              {!unlimited ? (
                <div className="mt-2.5 border-t border-[var(--color-border)] pt-2.5">
                  <div className="mb-1.5 text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
                    Can see these clients
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {clients.map((c) => {
                      const on = isAssigned(person.id, c.id);
                      const colour = clientColor(c);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          disabled={!canManage || pending}
                          onClick={() => toggleClient(person.id, c.id)}
                          className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition disabled:opacity-50"
                          style={
                            on
                              ? { background: colour.solid, color: colour.onSolid, borderColor: colour.hex }
                              : { borderColor: "var(--color-border)", color: "var(--color-text-muted)" }
                          }
                        >
                          {on ? <Check size={11} /> : null}
                          {c.company_name}
                        </button>
                      );
                    })}
                    {clients.length === 0 ? (
                      <span className="text-[11px] text-[var(--color-text-muted)]">No clients yet.</span>
                    ) : null}
                  </div>
                  {isAssignedNone(links, person.id) ? (
                    <p className="mt-1.5 text-[11px] text-[var(--color-bad)]">
                      No clients assigned — this person sees an empty console.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {note ? (
        <p className="text-[11px] text-[var(--color-text-muted)]">{pending ? "Saving…" : note}</p>
      ) : null}
    </div>
  );
}

function isAssignedNone(
  links: Array<{ profile_id: string; client_id: string }>,
  profileId: string,
): boolean {
  return !links.some((a) => a.profile_id === profileId);
}
