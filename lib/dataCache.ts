import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadAll, type AllData, type Row } from "@/lib/data";

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
export function invalidateAllData() { cached = null; findCached = null; }

// The Find company page only needs the companies and who has contacts, not every signal, source and history row,
// so it reads two tables instead of eight. Same 60-second life as the full cache.
let findCached: { at: number; data: Promise<AllData> } | null = null;
async function pageAll(table: string, cols: string, order: string): Promise<Row[]> {
  const db = supabaseAdmin(), out: Row[] = [];
  for (let from = 0; ; from += 3000) {
    const pages = await Promise.all([0, 1000, 2000].map(async (off) => {
      const { data, error } = await db.from(table).select(cols).order(order, { ascending: true }).range(from + off, from + off + 999);
      if (error) throw new Error(`${table}: ${error.message}`);
      return ((data as unknown as Row[]) || []);
    }));
    for (const pg of pages) out.push(...pg);
    if (pages[2].length < 1000) break;
  }
  return out;
}
export function loadFindCached(): Promise<AllData> {
  if (!findCached || Date.now() - findCached.at > TTL_MS) {
    // Only the columns the search reads, plus the two profile entries it needs; the rest of `profile` and the long notes stay in the database.
    const COLS = "id,slug,company_name,country,hq_city,industry,erp,existing_s2p_product,domain,company_website,listing_status,s2p_signal_level,icp_status,employee_range,"
      + 'verified_revenue_usd_m,revenue_usd_m,verified_revenue_status,parent_company,dr:profile->"Display revenue",mc:profile->"Merged companies"';
    const data = Promise.all([pageAll("companies", COLS, "created_at"), pageAll("contacts", "id,company_id,full_name", "created_at")])
      .then(([companies, contacts]) => ({ accounts: companies.map(({ dr, mc, ...c }) => ({ ...c, company_id: c.id, profile: { "Display revenue": dr, "Merged companies": mc } })), contacts, signals: [], sources: [], conflicts: [], apps: [], history: [], runs: [], uploads: [] } as AllData));
    findCached = { at: Date.now(), data };
    data.catch(() => { findCached = null; });
  }
  return findCached.data;
}
