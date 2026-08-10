// Which colours the style inspector offers.
//
// The palette is generated from the live document, so it lists every colour
// the site currently uses — including ones nobody reaches for. Hiding those
// keeps the picker to the handful actually in play while a look is being
// settled.
//
// Hiding is presentational only: it removes a swatch from the picker and
// changes nothing about the site. A hidden colour still renders wherever it
// is already used, and unhiding brings it straight back.
//
// Per browser, like the theme and the menu order — this is a working
// preference, and it should not need a round trip to remove a swatch.

const KEY = "inspector-palette-hidden";

export function loadHiddenSwatches(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string").map((v) => v.toLowerCase());
  } catch {
    return [];
  }
}

export function saveHiddenSwatches(hexes: string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...new Set(hexes.map((h) => h.toLowerCase()))]));
  } catch {
    // storage disabled — the list still holds for this session
  }
}
