// How long a posted card stays on the boards.
//
// Live posts accumulate forever and eventually bury the columns that actually
// need attention (Proposed / Pending). After this many days a posted card
// drops off the board for both the client and the admin. Nothing is deleted —
// the row and its history stay in the database, it just stops being listed.

export const POSTED_VISIBLE_DAYS = 34;

const DAY_MS = 24 * 60 * 60 * 1000;

interface StagedCard {
  stage: string;
  /** stamped when the card was moved into its current stage */
  updated_at: string;
}

/** Cards in every other stage are always shown; only posted ones age out. */
export function isCardVisible(card: StagedCard, now: number = Date.now()): boolean {
  if (card.stage !== "posted") return true;
  const movedAt = new Date(card.updated_at).getTime();
  // A bad timestamp shouldn't silently hide a card.
  if (Number.isNaN(movedAt)) return true;
  return now - movedAt <= POSTED_VISIBLE_DAYS * DAY_MS;
}

/** Filter a mixed list of cards, evaluating every card against one clock so a
 *  long render can't put two cards on different sides of the cutoff. */
export function visibleCards<T extends StagedCard>(cards: T[]): T[] {
  const now = Date.now();
  return cards.filter((card) => isCardVisible(card, now));
}
