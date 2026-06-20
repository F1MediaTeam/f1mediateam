import Link from "next/link";
import { signOutAction } from "@/app/login/actions";
import Logo from "@/components/shared/Logo";
import ImpersonationBanner from "@/components/client/ImpersonationBanner";
import type { Session } from "@/lib/data";
import type { Client } from "@/lib/types";

const NAV = [
  { href: "/client",         label: "Overview" },
  { href: "/client/content", label: "Content" },
  { href: "/client/files",   label: "Files" },
  { href: "/client/settings",label: "Settings" },
];

export default function ClientShell({
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
  return (
    <div className="min-h-screen">
      {session.is_impersonating ? <ImpersonationBanner clientName={client.company_name} /> : null}
      <header className="border-b border-[var(--color-border)] bg-[var(--color-bg-elev)]/70 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <Link href="/client" aria-label="F1 Media Team — home">
              <Logo compact width={170} height={48} />
            </Link>
            <span className="text-[var(--color-border-strong)]">/</span>
            <span className="text-sm font-medium">{client.company_name}</span>
          </div>
          <nav className="hidden md:flex items-center gap-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={
                  "px-3 py-1.5 rounded-lg text-sm transition " +
                  (active === item.href
                    ? "bg-[var(--color-bg-hover)] text-white"
                    : "text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-white")
                }
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-[var(--color-text-muted)] hidden sm:block">{session.email}</span>
            <form action={signOutAction}>
              <button className="text-[var(--color-text-muted)] hover:text-white">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-10">{children}</main>
    </div>
  );
}
