// Connector kill switches.
//
// Its own module so the connectors can read a flag without importing the
// registry that imports them. A cycle between index.ts and semrush.ts happens
// to resolve today, because the flag is only read at request time — but it is
// the kind of thing that breaks later for reasons nobody connects back here.

/**
 * Is the Semrush connector allowed to make paid API calls?
 *
 * Off unless SEMRUSH_ENABLED is explicitly "true". Default-off rather than
 * default-on because the subscription is being cancelled, and the two failure
 * modes are not symmetrical: a connector that stays quiet costs nothing and is
 * noticed immediately, while one that keeps calling spends money silently and
 * is noticed on the invoice.
 *
 * Nothing already stored is affected. Every Semrush figure in the database
 * keeps rendering; this only stops new outbound calls.
 */
export function semrushEnabled(): boolean {
  return process.env.SEMRUSH_ENABLED === "true";
}
