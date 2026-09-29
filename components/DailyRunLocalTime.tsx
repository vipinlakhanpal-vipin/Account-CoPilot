"use client";
import { useEffect, useState } from "react";

/** When the daily 02:00 UTC run falls in the visitor's own local time and zone (e.g. "4:00 AM South Africa Standard Time"
 * for someone in Johannesburg, "6:00 AM Gulf Standard Time" for someone in Dubai) — not a fixed "UAE time" label.
 * Renders the UAE-time fallback until mounted, then swaps to the browser's own zone (avoids an SSR/client mismatch). */
export default function DailyRunLocalTime() {
  const [s, setS] = useState<string | null>(null);
  useEffect(() => {
    const d = new Date();
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 2, 0, 0));
    setS(t.toLocaleString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true, timeZoneName: "long" }));
  }, []);
  return <>{s || "6:00 AM Gulf Standard Time"}</>;
}
