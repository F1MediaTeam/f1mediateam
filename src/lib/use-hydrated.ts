"use client";

// True after hydration, false during SSR and the initial client render.
// Replaces the `useEffect(() => setMounted(true), [])` pattern — same
// timing, but no extra state or cascading second render.

import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

export function useHydrated(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}
