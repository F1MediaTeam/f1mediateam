import Link from "next/link";
import { Suspense } from "react";
import Logo from "@/components/shared/Logo";
import MobileNavMenu from "@/components/shared/MobileNavMenu";
import ThemeToggle from "@/components/shared/ThemeToggle";
import ImpersonationBanner from "@/components/client/ImpersonationBanner";
import NotificationBell from "@/components/client/NotificationBell";
import MessagesButton from "@/components/client/MessagesButton";
import { getClientBrandLogoUrls } from "@/lib/client-logo";
import type { Session } from "@/lib/data";
import type { Client } from "@/lib/types";

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
  const onboardingLogos = await getClientBrandLogoUrls(client.id, client.company_name);
  const hasOnboardingLogo = Boolean(onboardingLogos.dark || onboardingLogos.light);
  return (
    <div className="min-h-screen">
      {session.is_impersonating ? <ImpersonationBanner clientName={client.company_name} /> : null}
      <header className="border-b border-[var(--color-border)] bg-[var(--color-bg-elev)]/70 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 justify-self-start">
            <Link href="/client" aria-label="F1 Media Team — home" className="shrink-0">
              <Logo compact width={110} height={32} />
            </Link>
            <span className="text-[var(--color-border-strong)] hidden sm:inline">/</span>
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
              <span className="text-sm font-medium truncate hidden sm:inline">{client.company_name}</span>
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
                    ? "bg-[var(--color-bg-hover)] text-[var(--color-text)]"
                    : "text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text)]")
                }
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-1 sm:gap-2 text-xs justify-self-end">
            <Suspense fallback={<div className="w-9 h-9" />}>
              <MessagesButton clientId={client.id} userId={session.user_id} />
            </Suspense>
            <Suspense fallback={<div className="w-9 h-9" />}>
              <NotificationBell clientId={client.id} />
            </Suspense>
            <ThemeToggle />
            {/* Mobile hamburger — shows the same nav items as desktop. */}
            <MobileNavMenu items={NAV} active={active} heading={client.company_name} />
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10 overflow-x-clip">{children}</main>
    </div>
  );
}
