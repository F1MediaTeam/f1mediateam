import Link from "next/link";
import Logo from "@/components/shared/Logo";
import MobileNavMenu from "@/components/shared/MobileNavMenu";
import ThemeToggle from "@/components/shared/ThemeToggle";
import { data } from "@/lib/data";
import type { Session } from "@/lib/data";

const NAV = [
  { href: "/admin",           label: "Dashboard" },
  { href: "/admin/clients",   label: "Clients" },
  { href: "/admin/content",   label: "Content" },
  { href: "/admin/messages",  label: "Messages" },
  { href: "/admin/reports",   label: "Reports" },
  { href: "/admin/audit",     label: "Activity" },
  { href: "/admin/tools",     label: "Tools" },
  { href: "/admin/settings",  label: "Settings" },
];

export default async function AdminShell({
  session,
  children,
  active,
}: {
  session: Session;
  children: React.ReactNode;
  active?: string;
}) {
  // One aggregate query per admin page for the Messages badge. Falls back to
  // zero if the migration hasn't landed yet so the shell doesn't crash.
  let totalUnread = 0;
  try {
    const counts = await data.listUnreadCountsByClient();
    totalUnread = Array.from(counts.values()).reduce((a, n) => a + n, 0);
  } catch {
    totalUnread = 0;
  }
  return (
    <div className="min-h-screen md:flex">
      {/* Mobile top bar — only renders below the md breakpoint. */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg-elev)]/80 sticky top-0 z-30">
        <Link href="/admin" className="flex items-center gap-2">
          <Logo compact width={140} height={40} />
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <MobileNavMenu items={NAV} active={active} heading="Admin console" />
        </div>
      </header>

      {/* Desktop sidebar — hidden on mobile. */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-bg-elev)]/80">
        <div className="px-4 py-5">
          <Link href="/admin" className="block">
            <Logo compact width={200} height={56} />
          </Link>
          <div className="mt-2 px-1 text-[10px] uppercase tracking-[0.22em] text-[var(--color-text-subtle)]">
            Admin console
          </div>
        </div>

        <nav className="flex flex-col gap-0.5 px-2 mt-2">
          {NAV.map((item) => {
            const isActive = active === item.href;
            const showBadge = item.href === "/admin/messages" && totalUnread > 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  "flex items-center justify-between px-3 py-2 rounded-lg text-sm transition " +
                  (isActive
                    ? "bg-[var(--color-bg-hover)] text-[var(--color-text)]"
                    : "text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text)]")
                }
              >
                <span>{item.label}</span>
                {showBadge ? (
                  <span className="min-w-[20px] h-[20px] px-1.5 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center tabular-nums">
                    {totalUnread > 99 ? "99+" : totalUnread}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-[var(--color-border)] p-3">
          <span className="truncate text-[11px] text-[var(--color-text-subtle)]">{session.email}</span>
          <ThemeToggle />
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-x-clip">{children}</main>
    </div>
  );
}
