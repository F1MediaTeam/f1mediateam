"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendAdminMessageAction } from "@/app/admin/actions";

export default function AdminReplyForm({ clientId }: { clientId: string }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || pending) return;
    setError(null);
    const fd = new FormData();
    fd.set("client_id", clientId);
    fd.set("body", trimmed);
    startTransition(async () => {
      const res = await sendAdminMessageAction(fd);
      if (res.error) {
        setError(res.error);
        return;
      }
      setBody("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            (e.currentTarget.form as HTMLFormElement).requestSubmit();
          }
        }}
        rows={3}
        placeholder="Reply to the client…"
        className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40 resize-none"
        disabled={pending}
      />
      {error ? <div className="text-[11px] text-red-400">{error}</div> : null}
      <div className="flex items-center justify-end gap-2">
        <button
          type="submit"
          disabled={pending || body.trim().length === 0}
          className="rounded-lg bg-[var(--color-accent)] text-[var(--color-on-accent)] px-4 py-1.5 text-xs font-semibold hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {pending ? "Sending…" : "Send"}
        </button>
      </div>
    </form>
  );
}
