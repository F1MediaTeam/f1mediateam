// Stamp profiles.last_seen_at on portal page loads. The notification digest
// uses it to skip emailing people about activity they've already seen in the
// portal. Fire-and-forget: never blocks or fails the page.

import { createServiceClient } from "@/lib/supabase/server";

export function touchLastSeen(userId: string): void {
  void (async () => {
    try {
      const supabase = await createServiceClient();
      await supabase
        .from("profiles")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", userId);
    } catch {
      // column may not exist until the migration runs — harmless
    }
  })();
}
