import { requirePageUser } from "@/lib/auth";
import { getAccess, canSeeCountry } from "@/lib/access";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { REGIONS, normalizeDefinition, regionOf, effectiveEngine } from "@/lib/icpDefinition.mjs";
import Hero from "@/components/Hero";
import NewHome, { type BoardRegion } from "@/components/NewHome";

export const dynamic = "force-dynamic";

// New Home (an experiment next to Home, which stays as it is): option A, a regions board where a region is switched on or off in one click.
export default async function NewHomePage() {
  const user = await requirePageUser();
  const access = await getAccess(user);
  const sb = await supabaseServer();
  const countries = async () => { const out: string[] = []; for (let from = 0; ; from += 1000) { const { data } = await supabaseAdmin().from("companies").select("country").range(from, from + 999); out.push(...(data || []).map((r) => String(r.country || ""))); if (!data || data.length < 1000) break; } return out; };
  const [{ data: defRow }, allCountries] = await Promise.all([sb.from("settings").select("value").eq("key", "icp_definition").maybeSingle(), countries()]);
  const def = normalizeDefinition(defRow?.value);
  const counts: Record<string, number> = {};
  for (const c of allCountries) if (canSeeCountry(access, c)) { const k = regionOf(c); counts[k] = (counts[k] || 0) + 1; }
  const regions: BoardRegion[] = REGIONS.filter((r: { key: string }) => access.isSuper || access.regions.includes(r.key)).map((r: { key: string; name: string }) => {
    const rules = def.regions[r.key], e = effectiveEngine(rules);
    return { key: r.key, name: r.name, status: rules.status as string, priority: e.priority, market: !!rules.market, accounts: counts[r.key] || 0,
      setNew: rules.engine.discover_per_day, setVerify: rules.engine.verify_per_day, newPerDay: e.discover_per_day, verifyPerDay: e.verify_per_day };
  });
  return (
    <div className="wrap">
      <Hero title="New Home" text="An experiment: the same Home, with your regions and their switches on the first screen. The original Home is unchanged." />
      <NewHome access={{ isSuper: access.isSuper, role: access.role, regions: access.regions, email: access.email, ready: access.ready }} regions={regions} total={regions.reduce((t, r) => t + r.accounts, 0)} />
    </div>
  );
}
