// Public data API. Picks the active adapter from env.
//
// - With Supabase env vars set: uses `supabase-adapter` (async, RLS-backed).
// - Otherwise: uses `mock-adapter` (sync, in-memory + JSON file).
//
// The mock adapter is wrapped in a Proxy that promise-ifies every method
// call so the public surface is uniformly async. UI code always `await`s.

import * as mock from "./mock-adapter";
import * as supabaseAdapter from "./supabase-adapter";

type Async<T> = T extends (...args: infer A) => infer R
  ? (...args: A) => Promise<Awaited<R>>
  : T;
type Asyncified<T> = { [K in keyof T]: Async<T[K]> };

function asyncify<T extends Record<string, unknown>>(obj: T): Asyncified<T> {
  return new Proxy(obj, {
    get(target, prop, receiver) {
      const v = Reflect.get(target, prop, receiver);
      if (typeof v === "function") {
        return (...args: unknown[]) => Promise.resolve((v as (...a: unknown[]) => unknown)(...args));
      }
      return v;
    },
  }) as unknown as Asyncified<T>;
}

const useSupabase = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

export const data = (useSupabase ? supabaseAdapter : asyncify(mock)) as typeof supabaseAdapter;
export const usingMock = !useSupabase;
export type { Session } from "./supabase-adapter";
