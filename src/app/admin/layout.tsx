import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { touchLastSeen } from "@/lib/last-seen";
import AdminStyleOverrides from "@/components/admin/AdminStyleOverrides";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/client");
  touchLastSeen(session.user_id);
  // Style-inspector overrides live here so they apply to every /admin/* page
  // and can never reach the client portal.
  return (
    <>
      <AdminStyleOverrides />
      {children}
    </>
  );
}
