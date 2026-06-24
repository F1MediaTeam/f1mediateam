import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { usingMock } from "@/lib/data";
import LoginForm from "./LoginForm";
import Logo from "@/components/shared/Logo";

export default async function LoginPage() {
  const s = await getSession();
  if (s?.role === "admin") redirect("/admin");
  // Even unassigned clients land at /client — the layout shows a friendly
  // "pending assignment" message instead of an infinite redirect loop.
  if (s?.role === "client") redirect("/client");

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo size={320} className="mb-4" />
          <h1 className="text-3xl font-semibold tracking-tight">Client portal</h1>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            {usingMock
              ? "Sign in with one of the demo accounts below."
              : "Sign in or create an account to get started."}
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-8 shadow-xl shadow-black/30">
          <LoginForm allowSignup={false} />
        </div>

        <div className="mt-6 text-xs text-[var(--color-text-subtle)] text-center">
          New here? Your F1 Media Team account manager will create your login for you.
        </div>
      </div>
    </div>
  );
}
