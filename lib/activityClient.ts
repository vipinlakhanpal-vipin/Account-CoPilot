import type { ActivityKind } from "@/lib/activity";

/** Fire-and-forget: record what the signed-in person just did. Never blocks or throws. */
export function logActivity(kind: ActivityKind, detail = "") {
  try {
    fetch("/api/activity", { method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true,
      body: JSON.stringify({ kind, detail: detail.slice(0, 200), path: location.pathname + location.search }) }).catch(() => {});
  } catch { /* optional */ }
}
