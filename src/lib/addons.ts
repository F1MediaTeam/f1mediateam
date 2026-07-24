// The Add-Ons catalogue shown in the client portal.
//
// Deliberately empty for now: the page ships with the tier display and the
// request flow working, and clients are asked to describe what they need
// rather than pick from a list. Fill this array in and the page switches to
// showing cards automatically — no component changes needed.
//
// No prices here on purpose: a client requests, you quote.

export interface AddOn {
  id: string;
  name: string;
  /** one or two sentences, shown on the card */
  description: string;
  /** optional grouping heading, e.g. "Content" or "Technical" */
  category?: string;
}

export const ADD_ONS: AddOn[] = [
  // Example of the shape — uncomment and edit to publish a card:
  // {
  //   id: "extra-content",
  //   name: "Extra content pieces",
  //   description: "Additional blog or social posts beyond your monthly allotment.",
  //   category: "Content",
  // },
];

/** The months a client can request an add-on for: this month plus the next
 *  five. Requests are per-month because add-ons sit outside the ongoing
 *  agreement and are agreed one month at a time. */
export function requestableMonths(from: Date = new Date()): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(from.getFullYear(), from.getMonth() + i, 1);
    out.push({
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleString("en-US", { month: "long", year: "numeric" }),
    });
  }
  return out;
}
