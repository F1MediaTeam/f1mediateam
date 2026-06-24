"use client";

import { useActionState, useState } from "react";
import { loginAction, signUpAction } from "./actions";
import type { LoginState } from "./types";
import { cn } from "@/lib/utils";

const initial: LoginState = { error: null, info: null };

export default function LoginForm({ allowSignup = true }: { allowSignup?: boolean }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const action = mode === "signin" ? loginAction : signUpAction;
  const [state, formAction, pending] = useActionState(action, initial);

  return (
    <div>
      {allowSignup ? (
        <div className="mb-6 inline-flex rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-1 w-full">
          <button
            type="button"
            onClick={() => setMode("signin")}
            className={cn(
              "flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition",
              mode === "signin"
                ? "bg-[var(--color-bg-hover)] text-[var(--color-text)]"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]",
            )}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={cn(
              "flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition",
              mode === "signup"
                ? "bg-[var(--color-bg-hover)] text-[var(--color-text)]"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]",
            )}
          >
            Create account
          </button>
        </div>
      ) : null}

      <form action={formAction} className="space-y-5">
        {mode === "signup" ? (
          <label className="block">
            <span className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)] mb-2">
              Full name
            </span>
            <input
              name="full_name"
              type="text"
              autoComplete="name"
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 text-sm outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/30"
            />
          </label>
        ) : null}

        <label className="block">
          <span className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)] mb-2">
            Email
          </span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 text-sm outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/30"
          />
        </label>

        <label className="block">
          <span className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)] mb-2">
            Password
          </span>
          <input
            name="password"
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            required
            minLength={mode === "signup" ? 8 : undefined}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 text-sm outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/30"
          />
          {mode === "signup" ? (
            <span className="block mt-1.5 text-[10px] text-[var(--color-text-subtle)]">
              Min 8 characters.
            </span>
          ) : null}
        </label>

        {state.error ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {state.error}
          </div>
        ) : null}
        {state.info ? (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
            {state.info}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-[var(--color-accent)] py-3 text-sm font-semibold tracking-wide text-black transition hover:brightness-110 disabled:opacity-60"
        >
          {pending ? (mode === "signin" ? "Signing in…" : "Creating account…") : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>
    </div>
  );
}
