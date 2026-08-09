import Link from "next/link";
import Logo from "@/components/shared/Logo";
import MobileNavMenu from "@/components/shared/MobileNavMenu";
import ThemeToggle from "@/components/shared/ThemeToggle";
import StyleInspector from "@/components/admin/StyleInspector";
import AdminNotificationBell from "@/components/admin/AdminNotificationBell";
import AdminNav from "@/components/admin/AdminNav";
import { data } from "@/lib/data";
import type { Session } from "@/lib/data";

// The sidebar's own order and nesting are editable per person and live in
// localStorage (src/lib/nav-layout.ts). This flat list is the shipped default
// and what the mobile menu shows.
import { DEFAULT_NAV as NAV } from "@/lib/nav-layout";

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
      <header data-style-id="admin-topbar" className="md:hidden flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg-elev)]/80 sticky top-0 z-30">
        <Link href="/admin" className="flex items-center gap-2">
          <Logo compact width={140} height={40} />
        </Link>
        <div className="flex items-center gap-2">
          <AdminNotificationBell userId={session.user_id} />
          <StyleInspector />
          <ThemeToggle />
          <MobileNavMenu items={NAV} active={active} heading="Admin console" />
        </div>
      </header>

      {/* Desktop sidebar — hidden on mobile. */}
      <aside data-style-id="admin-sidebar" className="hidden md:flex w-60 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-bg-elev)]/80">
        <div className="px-4 py-5">
          <Link href="/admin" className="block">
            <Logo compact width={200} height={56} />
          </Link>
          <div className="mt-2 flex items-center justify-between px-1">
            <span className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-text-subtle)]">
              Admin console
            </span>
            {/* Notification bell + theme toggle beside the crosshair inspector. */}
            <div className="flex items-center gap-1.5">
              <AdminNotificationBell userId={session.user_id} />
              <ThemeToggle />
              <StyleInspector />
            </div>
          </div>
        </div>

        <AdminNav active={active} totalUnread={totalUnread} />

        <div className="mt-auto flex items-center gap-2 border-t border-[var(--color-border)] p-3">
          <span className="truncate text-[11px] text-[var(--color-text-subtle)]">{session.email}</span>
        </div>
      </aside>

      <main data-style-id="admin-main" className="flex-1 min-w-0 overflow-x-clip">{children}</main>
    </div>
  );
}
