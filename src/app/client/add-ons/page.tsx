// Client-facing Add-Ons tab.
//
// Shows the client which tier they're on, then lets them request work that
// sits outside that agreement for a specific month. The catalogue in
// lib/addons.ts is empty for now, so the page asks them to describe what they
// need; fill that array in and the cards appear without touching this file.

import { requireClient } from "@/lib/auth/session";
import { data } from "@/lib/data";
import ClientShell from "@/components/client/Shell";
import { Card, CardBody } from "@/components/ui";
import AddOnRequestForm from "@/components/client/AddOnRequestForm";
import { ADD_ONS } from "@/lib/addons";
import { TIER_LABELS } from "@/lib/types";

export default async function ClientAddOns() {
  const session = await requireClient();
  const client = await data.getClient(session.client_id!);
  if (!client) return null;

  const tierLabel = client.tier ? TIER_LABELS[client.tier] : null;
  const byCategory = ADD_ONS.reduce<Record<string, typeof ADD_ONS>>((acc, a) => {
    const key = a.category ?? "Available add-ons";
    (acc[key] ??= []).push(a);
    return acc;
  }, {});

  return (
    <ClientShell session={session} client={client} active="/client/add-ons">
      <div className="mb-8">
        <div className="text-xs uppercase tracking-widest text-[var(--color-text-muted)]">
          Add-Ons
        </div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          Extra work, month by month
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--color-text-muted)]">
          Anything outside your current agreement can be added for a single month. Tell us what you
          need and we&apos;ll come back with pricing and timing before any work starts.
        </p>
      </div>

      {/* Current plan */}
      <Card className="mb-6">
        <CardBody className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
              Your current plan
            </div>
            <div className="mt-1 text-lg font-semibold">
              {tierLabel ?? "Not set yet"}
            </div>
          </div>
          {!tierLabel ? (
            <p className="text-xs text-[var(--color-text-muted)]">
              Ask your account manager which plan you&apos;re on.
            </p>
          ) : null}
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 items-start">
        {/* Catalogue — or the empty state until it's filled in */}
        <div className="space-y-4">
          {ADD_ONS.length === 0 ? (
            <Card>
              <CardBody className="py-6">
                <div className="text-sm font-medium">What&apos;s available</div>
                <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                  We&apos;re putting the current list of add-ons together. In the meantime, describe
                  what you&apos;re after in the form and we&apos;ll tell you what&apos;s possible —
                  extra content, one-off campaigns, additional pages, deeper reporting, and more.
                </p>
              </CardBody>
            </Card>
          ) : (
            Object.entries(byCategory).map(([category, items]) => (
              <div key={category}>
                <div className="mb-2 text-[10px] uppercase tracking-widest text-[var(--color-text-subtle)]">
                  {category}
                </div>
                <div className="space-y-2">
                  {items.map((a) => (
                    <Card key={a.id}>
                      <CardBody className="py-4">
                        <div className="text-sm font-medium">{a.name}</div>
                        <p className="mt-1 text-xs text-[var(--color-text-muted)]">{a.description}</p>
                      </CardBody>
                    </Card>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Request form */}
        <Card>
          <CardBody className="py-5">
            <div className="mb-3">
              <div className="text-sm font-medium">Request an add-on</div>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                Goes straight to the F1 Media team — you&apos;ll see their reply in Messages.
              </p>
            </div>
            <AddOnRequestForm addOns={ADD_ONS} />
          </CardBody>
        </Card>
      </div>
    </ClientShell>
  );
}
