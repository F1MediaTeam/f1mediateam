import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { touchLastSeen } from "@/lib/last-seen";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/client");
  touchLastSeen(session.user_id);
  return <>{children}</>;
}
