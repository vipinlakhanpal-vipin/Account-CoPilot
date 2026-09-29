import { requirePageUser } from "@/lib/auth";
import { getAccess, scopeData } from "@/lib/access";
import { supabaseServer } from "@/lib/supabase/server";
import { loadAllCached } from "@/lib/dataCache";
import { REGIONS, normalizeDefinition, regionOf } from "@/lib/icpDefinition.mjs";
import Hero from "@/components/Hero";
import HomeWorkspace from "@/components/HomeWorkspace";
import Link from "next/link";

export const dynamic = "force-dynamic";

// Home: a short, plain-English orientation to Account CoPilot, plus the Setup Wizard.
// The deep reference (scoring formulas, engine steps, cost tables) stays in Setup → Learn Me.
export default async function HomePage() {
  const user = await requirePageUser();
  const access = await getAccess(user);
  const sb = await supabaseServer();
  const [{ data: defRow }, all] = await Promise.all([
    sb.from("settings").select("value").eq("key", "icp_definition").maybeSingle(),
    loadAllCached().then((d) => scopeData(d, access)),
  ]);
  const def = normalizeDefinition(defRow?.value);
  const visibleRegions = REGIONS.filter((r) => access.isSuper || access.regions.includes(r.key));
  const counts: Record<string, number> = {};
  for (const a of all.accounts) { const k = regionOf((a as { country?: string }).country); counts[k] = (counts[k] || 0) + 1; }
  const regionStats = visibleRegions.map((r) => ({ ...r, count: counts[r.key] || 0, status: def.regions[r.key]?.status || "paused" }));
  const totalCompanies = regionStats.reduce((t, r) => t + r.count, 0);
  const activeCount = regionStats.filter((r) => r.status === "active").length;
  const needsSetup = regionStats.filter((r) => r.status !== "active" || r.count === 0);

  return (
    <div className="wrap">
      <Hero title="Home" text="Get to know your Account CoPilot AI Agent, and set it up in a few minutes." />

      <section className="panel">
        <div className="roles">
          <div className="metric-tile"><div className="note">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="5" y="3" width="9" height="18" /><rect x="14" y="9" width="6" height="12" /><path d="M8 7h2M8 11h2M8 15h2" /></svg>
            Companies tracked</div><div style={{ fontSize: 24, fontWeight: 500 }}>{totalCompanies}</div></div>
          <div className="metric-tile"><div className="note">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 21s7-7.58 7-12a7 7 0 0 0-14 0c0 4.42 7 12 7 12z" /><circle cx="12" cy="9" r="2.4" /></svg>
            Active regions</div><div style={{ fontSize: 24, fontWeight: 500 }}>{activeCount} of {regionStats.length}</div></div>
        </div>
        {needsSetup.length > 0 && <div style={{ marginTop: 10 }}>
          <p className="note">
            {needsSetup.length === regionStats.length ? "None of your regions are fully set up yet — use the Setup Wizard below to get started." : "Not fully set up yet (paused, or no companies tracked) — use the Setup Wizard below to get started:"}
          </p>
          {needsSetup.length !== regionStats.length && <div className="roles" style={{ marginTop: 6 }}>
            {needsSetup.map((r) => <span key={r.key} className="tag likely">{r.name}</span>)}
          </div>}
        </div>}
      </section>

      <HomeWorkspace access={access} />

      <section className="panel">
        <p className="note">Want the full detail — scoring formulas, the engine's exact daily steps, every cost line — instead of the short version above? Open <Link href="/guide">Setup → Learn Me →</Link></p>
      </section>
    </div>
  );
}
