import Link from "next/link";
import { Suspense } from "react";
import Logo from "@/components/shared/Logo";
import MobileNavMenu from "@/components/shared/MobileNavMenu";
import ThemeToggle from "@/components/shared/ThemeToggle";
import ImpersonationBanner from "@/components/client/ImpersonationBanner";
import NotificationBell from "@/components/client/NotificationBell";
import MessagesButton from "@/components/client/MessagesButton";
import { getClientBrandLogoUrls } from "@/lib/client-logo";
import { clientColor } from "@/lib/client-color";
import type { Session } from "@/lib/data";
import type { Client } from "@/lib/types";

const NAV = [
  { href: "/client",         label: "Overview" },
  { href: "/client/content", label: "Content" },
  { href: "/client/add-ons", label: "Add-Ons" },
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
  const onboardingLogos = await getClientBrandLogoUrls(client.id, client.company_name);
  const hasOnboardingLogo = Boolean(onboardingLogos.dark || onboardingLogos.light);
  return (
    <div
      className="min-h-screen"
      style={{ "--panel-outline": clientColor(client).hex } as React.CSSProperties}
    >
      {session.is_impersonating ? <ImpersonationBanner clientName={client.company_name} /> : null}
      {/* The portal's chrome, drawn from the same tokens as the admin rail so
          the two halves of the product read as one. The client's own colour
          runs beneath it, so a customer's portal is identifiably theirs. */}
      <header
        data-style-id="client-header"
        className="sticky top-0 z-10 border-b border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-bg)] text-[var(--color-sidebar-text)] backdrop-blur"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between md:grid md:grid-cols-[1fr_auto_1fr] gap-3 sm:gap-6">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 md:justify-self-start">
            <Link href="/client" aria-label="F1 Media Team — home" className="shrink-0">
              <Logo compact width={110} height={32} />
            </Link>
            <span className="hidden text-[var(--color-sidebar-muted)] sm:inline">/</span>
            {hasOnboardingLogo ? (
              <span className="hidden sm:flex shrink-0 items-center" style={{ width: 110, height: 32 }}>
                {onboardingLogos.dark ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={onboardingLogos.dark}
                    alt={client.company_name}
                    className="logo-dark object-contain object-left"
                    style={{ width: 110, height: 32 }}
                    loading="eager"
                    fetchPriority="high"
                    decoding="sync"
                  />
                ) : null}
                {onboardingLogos.light ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={onboardingLogos.light}
                    alt={client.company_name}
                    className="logo-light object-contain object-left"
                    style={{ width: 110, height: 32 }}
                    loading="eager"
                    fetchPriority="high"
                    decoding="sync"
                  />
                ) : null}
              </span>
            ) : (
              <span className="hidden truncate text-sm font-medium sm:inline">{client.company_name}</span>
            )}
          </div>
          {/* Desktop nav — centered in the header */}
          <nav className="hidden md:flex items-center gap-1 justify-self-center">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={
                  "px-3 py-1.5 rounded-lg text-sm transition " +
                  (active === item.href
                    ? "bg-[var(--color-sidebar-active-bg)] text-[var(--color-sidebar-active-text)]"
                    : "bg-[var(--color-sidebar-item-bg)] text-[var(--color-sidebar-item-text)] hover:bg-[var(--color-sidebar-hover-bg)] hover:text-[var(--color-sidebar-active-text)]")
                }
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2 text-xs justify-self-end">
            <Suspense fallback={<div className="w-9 h-9" />}>
              <MessagesButton clientId={client.id} userId={session.user_id} />
            </Suspense>
            <Suspense fallback={<div className="w-9 h-9" />}>
              <NotificationBell clientId={client.id} userId={session.user_id} />
            </Suspense>
            <ThemeToggle />
            {/* Mobile hamburger — shows the same nav items as desktop. */}
            <MobileNavMenu items={NAV} active={active} heading={client.company_name} />
          </div>
        </div>
      </header>
      <div aria-hidden className="h-1 w-full" style={{ background: clientColor(client).hex }} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10 overflow-x-clip">{children}</main>
    </div>
  );
}
