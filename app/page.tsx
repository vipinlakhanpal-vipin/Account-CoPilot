import { requirePageUser } from "@/lib/auth";
import CoPilotApp from "@/components/CoPilotApp";
import CountryBar from "@/components/CountryBar";
import { loadAllCached } from "@/lib/dataCache";
import { getAccess, scopeData } from "@/lib/access";
import { regionOf } from "@/lib/icpDefinition.mjs";

export const dynamic = "force-dynamic";

const LABELS: Record<string, string> = { pipeline: "Pipeline", accounts: "Accounts", stakeholders: "Stakeholders", signals: "S2P Signals", erp: "ERP & Apps", conflicts: "Conflicts", sources: "Sources" };


export default async function Home({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requirePageUser();
  const { tab = "dashboard" } = await searchParams;
  const access = await getAccess(user);
  const data = scopeData(await loadAllCached(), access); // a Standard user only ever receives their region's data
  const counts: Record<string, number> = {};
  data.accounts.forEach((a) => { const c = regionOf(a.country); counts[c] = (counts[c] || 0) + 1; });
  const home = access.isSuper ? "UAE" : access.regions[0] || "UAE";
  if (!access.isSuper && !access.regions.length) return (<div className="wrap"><section className="view"><div className="panel"><h2>No region assigned yet</h2>
    <p>Your Super Admin needs to assign you a region in Setup → Team before you can see accounts.</p></div></section></div>);
  return (
    <>
      <CountryBar counts={counts} allowed={access.isSuper ? undefined : access.regions} showAll={access.isSuper} home={home} />
      <div className="wrap">
        {data.accounts.length === 0 ? (
          <section className="view"><div className="panel"><h2>No accounts yet</h2>
            <p>Load the researched UAE accounts with <code>npm run seed</code>, or start new research from the Research Queue.</p></div></section>
        ) : <CoPilotApp data={data} home={home} isSuper={access.isSuper} />}
      </div>
    </>
  );
}
