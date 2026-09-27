import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadAll, type AllData } from "@/lib/data";

// Short-lived in-memory cache of the full data load (per server instance). Pages call it only after the user is authenticated.
// Any route that writes company/contact data calls invalidateAllData() so the next page view is fresh.
const TTL_MS = 60_000;
let cached: { at: number; data: Promise<AllData> } | null = null;

export function loadAllCached(): Promise<AllData> {
  if (!cached || Date.now() - cached.at > TTL_MS) {
    const data = loadAll(supabaseAdmin());
    cached = { at: Date.now(), data };
    data.catch(() => { cached = null; });
  }
  return cached.data;
}
export function invalidateAllData() { cached = null; }
