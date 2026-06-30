import Link from "next/link";
import { Suspense } from "react";
import { signOutAction } from "@/app/login/actions";
import Logo from "@/components/shared/Logo";
import MobileNavMenu from "@/components/shared/MobileNavMenu";
import ThemeToggle from "@/components/shared/ThemeToggle";
import ImpersonationBanner from "@/components/client/ImpersonationBanner";
import NotificationBell from "@/components/client/NotificationBell";
import { createServiceClient } from "@/lib/supabase/server";
import type { Session } from "@/lib/data";
import type { Client } from "@/lib/types";

// Pull the most recent onboarding brand-asset image the client uploaded
// and mint a 1-hour signed URL so we can show it as their logo in the
// portal header. Returns null when no usable image exists.
async function getOnboardingLogoUrl(clientId: string): Promise<string | null> {
  try {
    const supabase = await createServiceClient();
    const { data: rows } = await supabase
      .from("files")
      .select("storage_path, mime_type")
      .eq("client_id", clientId)
      .eq("category", "onboarding-asset")
      .order("created_at", { ascending: false });
    const img = (rows ?? []).find((r) => (r.mime_type ?? "").startsWith("image/"));
    if (!img?.storage_path) return null;
    const { data: signed } = await supabase.storage
      .from("client-attachments")
      .createSignedUrl(img.storage_path, 60 * 60);
    return signed?.signedUrl ?? null;
  } catch {
    return null;
  }
}

const NAV = [
  { href: "/client",         label: "Overview" },
  { href: "/client/content", label: "Content" },
  { href: "/client/settings",label: "Settings" },
];

export default async function ClientShell({
  session,
  client,
  active,
  children,
}: {
  session: Session;
  client: Client;
  active?: string;
  children: React.ReactNode;
}) {
  const onboardingLogoUrl = await getOnboardingLogoUrl(client.id);
  return (
    <div className="min-h-screen">
      {session.is_impersonating ? <ImpersonationBanner clientName={client.company_name} /> : null}
      <header className="border-b border-[var(--color-border)] bg-[var(--color-bg-elev)]/70 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3 sm:gap-6">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Link href="/client" aria-label="F1 Media Team — home" className="shrink-0">
              <Logo compact width={110} height={32} />
            </Link>
            <span className="text-[var(--color-border-strong)] hidden sm:inline">/</span>
            {(() => {
              // Onboarding upload wins (the client picked their own logo);
              // fall back to the hard-coded brand logos we shipped before
              // onboarding existed; final fallback is the company name text.
              if (onboardingLogoUrl) {
                return (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={onboardingLogoUrl}
                    alt={client.company_name}
                    className="hidden sm:block shrink-0 object-contain object-left"
                    style={{ width: 110, height: 32 }}
                  />
                );
              }
              const name = client.company_name.toLowerCase();
              const logoVar = name.includes("buckets")
                ? "var(--buckets-logo-img)"
                : name.includes("precision graphics")
                ? "url(/precision-graphics-logo.svg)"
                : null;
              return logoVar ? (
                <div
                  role="img"
                  aria-label={client.company_name}
                  className="hidden sm:block shrink-0 bg-no-repeat bg-left bg-contain"
                  style={{ width: 110, height: 32, backgroundImage: logoVar }}
                />
              ) : (
                <span className="text-sm font-medium truncate hidden sm:inline">{client.company_name}</span>
              );
            })()}
          </div>
          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={
                  "px-3 py-1.5 rounded-lg text-sm transition " +
                  (active === item.href
                    ? "bg-[var(--color-bg-hover)] text-[var(--color-text)]"
                    : "text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text)]")
                }
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-1 sm:gap-2 text-xs">
            <Suspense fallback={<div className="w-9 h-9" />}>
              <NotificationBell clientId={client.id} />
            </Suspense>
            <ThemeToggle />
            <form action={signOutAction}>
              <button className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] px-2 py-1">Sign out</button>
            </form>
            {/* Mobile hamburger — shows the same nav items as desktop. */}
            <MobileNavMenu items={NAV} active={active} heading={client.company_name} />
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10 overflow-x-clip">{children}</main>
    </div>
  );
}
