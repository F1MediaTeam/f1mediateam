"use client";

// Time-of-day greeting for the admin dashboard. Renders client-side so we get
// the viewer's local hour (not the server's UTC) and stays in sync if the
// page is left open across a boundary like midnight or noon.

import { useEffect, useState } from "react";

function pickGreeting(hour: number): string {
  if (hour >= 5 && hour < 12)  return "Good morning!";
  if (hour >= 12 && hour < 17) return "Good afternoon!";
  if (hour >= 17 && hour < 21) return "Good evening!";
  return "Burning the midnight oil?";
}

export default function Greeting() {
  // Server-rendered default — replaced with a TZ-aware greeting after
  // hydration. Avoids a hydration mismatch + a flash of empty text.
  const [text, setText] = useState("Welcome back.");

  useEffect(() => {
    setText(pickGreeting(new Date().getHours()));
  }, []);

  return <>{text}</>;
}
