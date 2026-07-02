"use client";

// Time-of-day greeting for the admin dashboard. Renders client-side so we get
// the viewer's local hour (not the server's UTC) and stays in sync if the
// page is left open across a boundary like midnight or noon.

import { useHydrated } from "@/lib/use-hydrated";

function pickGreeting(hour: number): string {
  if (hour >= 5 && hour < 12)  return "Good morning!";
  if (hour >= 12 && hour < 17) return "Good afternoon!";
  if (hour >= 17 && hour < 21) return "Good evening!";
  return "Burning the midnight oil?";
}

export default function Greeting() {
  // Server-rendered default — swapped for a TZ-aware greeting once hydrated.
  // Avoids a hydration mismatch + a flash of empty text.
  const hydrated = useHydrated();
  return <>{hydrated ? pickGreeting(new Date().getHours()) : "Welcome back."}</>;
}
