"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { data } from "@/lib/data";
import { requireAdmin, getSession } from "@/lib/auth/session";
import { createServiceClient, createClient } from "@/lib/supabase/server";
import {
  startImpersonationRow,
  endImpersonationRow,
  setImpersonation,
  clearImpersonation,
  readImpersonation,
} from "@/lib/auth/impersonate";

// --- tasks ---

export async function createTaskAction(formData: FormData) {
  const session = await requireAdmin();
  const client_id = String(formData.get("client_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const due_date = String(formData.get("due_date") ?? "").trim() || null;
  if (!client_id || !title) return;
  await data.createTask({
    client_id,
    title,
    notes,
    due_date,
    assigned_by: session.user_id,
  });
  revalidatePath("/admin");
  revalidatePath("/admin/calendar");
}

export async function toggleTaskAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "open") === "done" ? "open" : "done";
  await data.updateTask(id, { status });
  revalidatePath("/admin");
}

export async function deleteTaskAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  await data.deleteTask(id);
  revalidatePath("/admin");
}

// --- calendar ---

export async function createCalendarAction(formData: FormData) {
  const session = await requireAdmin();
  const raw = String(formData.get("client_id") ?? "");
  // "internal" → an F1 Media event not tied to any client (client_id = null).
  const client_id = raw === "internal" ? null : raw;
  const title = String(formData.get("title") ?? "").trim();
  const type = (formData.get("type") === "deadline" ? "deadline" : "meeting") as
    | "meeting"
    | "deadline";
  const starts_at = String(formData.get("starts_at") ?? "");
  const url = String(formData.get("url") ?? "").trim();
  const rawNotes = String(formData.get("notes") ?? "").trim();
  // Embed the URL as a sentinel-prefixed first line so the schema doesn't
  // need a migration; the event card/popup picks the URL out for rendering.
  const notes = composeEventNotes(url, rawNotes);
  if (!raw || !title || !starts_at) return;
  await data.createCalendarEvent({
    client_id,
    title,
    type,
    starts_at: new Date(starts_at).toISOString(),
    notes,
    created_by: session.user_id,
  });
  revalidatePath("/admin");
  revalidatePath("/admin/calendar");
}

// Sentinel-encode the URL into the notes column so the calendar UI can
// extract it later without a schema change. Format: "[URL] <link>\n\n<body>".
function composeEventNotes(url: string, body: string): string | null {
  const trimmedUrl = url.trim();
  const trimmedBody = body.trim();
  if (trimmedUrl && trimmedBody) return `[URL] ${trimmedUrl}\n\n${trimmedBody}`;
  if (trimmedUrl) return `[URL] ${trimmedUrl}`;
  if (trimmedBody) return trimmedBody;
  return null;
}

export async function deleteCalendarAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  await data.deleteCalendarEvent(id);
  revalidatePath("/admin/calendar");
}

// --- clients ---

export async function createClientAction(formData: FormData) {
  await requireAdmin();
  const company_name = String(formData.get("company_name") ?? "").trim();
  const join_date = String(formData.get("join_date") ?? "").trim() || undefined;
  const websitesRaw = String(formData.get("websites") ?? "").trim();
  const websites = websitesRaw ? websitesRaw.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean) : [];
  if (!company_name) return;
  await data.createClientRow({ company_name, join_date, websites });
  revalidatePath("/admin/clients");
}

export async function createClientUserAction(formData: FormData): Promise<{ error: string | null; ok?: string }> {
  await requireAdmin();
  const client_id = String(formData.get("client_id") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim() || undefined;

  if (!client_id || !email || !password) {
    return { error: "Client, email, and initial password are all required." };
  }
  if (password.length < 8) {
    return { error: "Initial password must be at least 8 characters." };
  }

  const admin = await createServiceClient();
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: fullName ? { full_name: fullName } : undefined,
  });
  if (createErr || !created.user) {
    return { error: createErr?.message ?? "Failed to create user." };
  }

  // The on_auth_user_created trigger creates a profile row with role 'client'
  // and no client_id. Assign it now, and force role to client.
  const { error: updErr } = await admin
    .from("profiles")
    .update({ role: "client", client_id, full_name: fullName ?? null })
    .eq("id", created.user.id);
  if (updErr) {
    return { error: `User created, but assignment failed: ${updErr.message}` };
  }

  revalidatePath(`/admin/clients/${client_id}`);
  return { error: null, ok: `Account created for ${email}. Share the initial password with them — they can change it after first sign-in.` };
}

export async function deleteClientAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const confirmText = String(formData.get("confirm") ?? "");
  if (!id || confirmText !== "DELETE") return;
  await data.deleteClient(id);
  revalidatePath("/admin/clients");
  revalidatePath("/admin");
  revalidatePath("/admin/calendar");
  revalidatePath("/admin/content");
}

// --- client config ---

export async function setWidgetAction(formData: FormData) {
  await requireAdmin();
  const client_id = String(formData.get("client_id") ?? "");
  const widget = String(formData.get("widget") ?? "") as keyof {
    rankings: boolean;
    traffic: boolean;
    content: boolean;
    files: boolean;
    calendar: boolean;
  };
  const enabled = String(formData.get("enabled") ?? "") === "true";
  const client = await data.getClient(client_id);
  if (!client) return;
  await data.updateClientConfig(client_id, {
    widgets: { ...client.config.widgets, [widget]: enabled },
  });
  revalidatePath(`/admin/clients/${client_id}`);
}

// --- content board ---

export async function createContentAction(formData: FormData) {
  const session = await requireAdmin();
  const client_id = String(formData.get("client_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim() || null;
  const link = String(formData.get("link") ?? "").trim() || null;
  if (!client_id || !title) return;
  await data.createContent({ client_id, title, body, link, created_by: session.user_id });
  revalidatePath("/admin/content");
}

export async function deleteContentAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await data.deleteContent(id);
  revalidatePath("/admin/content");
  revalidatePath("/client/content");
}

export async function updateContentAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim() || null;
  const link = String(formData.get("link") ?? "").trim() || null;
  if (!title) return;
  await data.updateContent(id, { title, body, link });
  revalidatePath("/admin/content");
  revalidatePath("/client/content");
}

export async function advanceContentAction(formData: FormData) {
  const session = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const direction = formData.get("direction") === "back" ? "back" : "forward";
  await data.moveContentStage(id, direction, {
    user_id: session.user_id,
    role: session.role,
    client_id: session.client_id,
  });
  revalidatePath("/admin/content");
}

// --- impersonation (view-as customer) ---

export async function startImpersonateAction(formData: FormData) {
  const session = await requireAdmin();
  const client_id = String(formData.get("client_id") ?? "");
  if (!client_id) return;
  const id = await startImpersonationRow(session.user_id, client_id);
  await setImpersonation({
    admin_user_id: session.user_id,
    client_id,
    impersonation_id: id,
  });
  redirect("/client");
}

export async function endImpersonateAction() {
  // Can't use requireAdmin here because the impersonation cookie is currently
  // making the session look like a client. Read raw auth + verify via cookie.
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  const imp = await readImpersonation();
  if (u.user && imp && imp.admin_user_id === u.user.id) {
    await endImpersonationRow(imp.impersonation_id);
  }
  await clearImpersonation();
  const back = imp ? `/admin/clients/${imp.client_id}` : "/admin/clients";
  redirect(back);
}

// --- connector sync ---

export async function connectSemrushAction(formData: FormData) {
  await requireAdmin();
  const client_id = String(formData.get("client_id") ?? "");
  const apikey = String(formData.get("apikey") ?? "").trim();
  const domain = String(formData.get("domain") ?? "").trim();
  if (!client_id) return;
  if (!apikey || !domain) {
    redirect(`/admin/clients/${client_id}?oauth_error=${encodeURIComponent("API key and domain are required")}`);
  }
  try {
    const { testSemrushKey, normalizeDomain } = await import("@/lib/connectors/semrush");
    await testSemrushKey(apikey);
    const normalized = normalizeDomain(domain);
    await data.upsertConnectorToken({
      client_id,
      provider: "semrush",
      account_label: normalized,
      access_token: apikey,
      refresh_token: null,
      expires_at: null,
      scopes: [],
      meta: {},
    });
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) {
      throw e;
    }
    const message = e instanceof Error ? e.message : String(e);
    console.error("Semrush connect failed", e);
    redirect(`/admin/clients/${client_id}?oauth_error=${encodeURIComponent(`Semrush: ${message}`)}`);
  }
  revalidatePath(`/admin/clients/${client_id}`);
  redirect(`/admin/clients/${client_id}?oauth_connected=semrush`);
}

/**
 * Update a SEMrush connector's meta JSON with the IDs and manual values that
 * power the SEO Snapshot row's Site Health, Visibility, AI Visibility and
 * Mentions cards. Each field is optional — empty string clears the override.
 */
export async function updateSemrushMetaAction(formData: FormData) {
  await requireAdmin();
  const client_id = String(formData.get("client_id") ?? "");
  const token_id = String(formData.get("token_id") ?? "");
  if (!client_id || !token_id) {
    revalidatePath(`/admin/clients/${client_id}`);
    return;
  }
  const parseNum = (raw: FormDataEntryValue | null): number | null | undefined => {
    if (raw == null) return undefined;
    const s = String(raw).trim();
    if (s === "") return null; // clear
    const n = Number(s);
    return Number.isFinite(n) ? n : undefined;
  };
  const patch: Record<string, unknown> = {};
  const sa = parseNum(formData.get("site_audit_project_id"));
  if (sa !== undefined) patch.site_audit_project_id = sa;
  const pt = parseNum(formData.get("position_tracking_campaign_id"));
  if (pt !== undefined) patch.position_tracking_campaign_id = pt;
  const av = parseNum(formData.get("ai_visibility_value"));
  if (av !== undefined) patch.ai_visibility_value = av;
  const mn = parseNum(formData.get("mentions_value"));
  if (mn !== undefined) patch.mentions_value = mn;
  await data.updateConnectorMeta(token_id, patch);
  revalidatePath(`/admin/clients/${client_id}`);
  revalidatePath(`/admin/clients/${client_id}/connect/semrush`);
}

export async function connectBingAction(formData: FormData) {
  await requireAdmin();
  const client_id = String(formData.get("client_id") ?? "");
  const apikey = String(formData.get("apikey") ?? "").trim();
  if (!client_id) return;
  if (!apikey) {
    redirect(`/admin/clients/${client_id}?oauth_error=${encodeURIComponent("API key is required")}`);
  }
  try {
    const { listBingSites } = await import("@/lib/connectors/bing");
    const sites = await listBingSites(apikey);
    if (!sites.length) {
      redirect(`/admin/clients/${client_id}?oauth_error=${encodeURIComponent("No verified sites on this Bing Webmaster account")}`);
    }
    await data.upsertConnectorToken({
      client_id,
      provider: "bing",
      account_label: sites[0],
      access_token: apikey,
      refresh_token: null,
      expires_at: null,
      scopes: [],
      meta: {},
    });
  } catch (e) {
    // redirect() throws a NEXT_REDIRECT sentinel — let it propagate.
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) {
      throw e;
    }
    const message = e instanceof Error ? e.message : String(e);
    console.error("Bing connect failed", e);
    redirect(`/admin/clients/${client_id}?oauth_error=${encodeURIComponent(`Bing: ${message}`)}`);
  }
  revalidatePath(`/admin/clients/${client_id}`);
  redirect(`/admin/clients/${client_id}?oauth_connected=bing`);
}

export async function disconnectConnectorAction(formData: FormData) {
  await requireAdmin();
  const client_id = String(formData.get("client_id") ?? "");
  const provider = String(formData.get("provider") ?? "");
  const connectors = (await data.listConnectors(client_id)).filter((c) => c.provider === provider);
  for (const c of connectors) await data.deleteConnector(c.id);
  revalidatePath(`/admin/clients/${client_id}`);
}

export async function refreshConnectorAction(formData: FormData) {
  await requireAdmin();
  const client_id = String(formData.get("client_id") ?? "");
  const provider = String(formData.get("provider") ?? "");
  const { getConnector } = await import("@/lib/connectors");
  const connectors = (await data.listConnectors(client_id)).filter((c) => c.provider === provider);
  for (const token of connectors) {
    const connector = getConnector(token.provider);
    if (!connector) continue;
    try {
      const { snapshots, effectiveAsOf, replaceSource } = await connector.sync({ clientId: client_id, token });
      if (replaceSource && snapshots.length) await data.deleteSnapshotsBySource(client_id, replaceSource);
      await data.writeSnapshots(snapshots.map((s) => ({ ...s, client_id })));
      await data.touchConnectorSync(token.id, `ok @ ${effectiveAsOf} (${snapshots.length} rows)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      await data.touchConnectorSync(token.id, `error: ${msg}`);
    }
  }
  revalidatePath(`/admin/clients/${client_id}`);
}

// --- semrush deep pull ---

export async function semrushDeepPullAction(formData: FormData) {
  await requireAdmin();
  const client_id = String(formData.get("client_id") ?? "");
  if (!client_id) return;
  const { semrushDeepPullForClient } = await import("@/lib/connectors/semrush");

  const result = await semrushDeepPullForClient(client_id);
  if (result) {
    for (const r of result.reports) {
      await data.upsertSemrushReport({
        client_id,
        report_type: r.report_type,
        rows: r.rows,
        meta: {
          label: r.label,
          domain: result.domain,
          row_count: r.row_count,
          units_estimate: r.units_estimate,
          error: r.error,
        },
      });
    }
  }
  revalidatePath(`/admin/clients/${client_id}`);
}
