import { requirePageUser } from "@/lib/auth";
import CoPilotApp from "@/components/CoPilotApp";
import CountryBar from "@/components/CountryBar";
import { countryCode } from "@/lib/countries";
import { loadAllCached } from "@/lib/dataCache";

export const dynamic = "force-dynamic";

const LABELS: Record<string, string> = { pipeline: "Pipeline", accounts: "Accounts", stakeholders: "Stakeholders", signals: "S2P Signals", erp: "ERP & Apps", conflicts: "Conflicts", sources: "Sources" };


export default async function Home({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requirePageUser();
  const { tab = "dashboard" } = await searchParams;
  const data = await loadAllCached();
  const counts: Record<string, number> = {};
  data.accounts.forEach((a) => { const c = countryCode(a.country); counts[c] = (counts[c] || 0) + 1; });
  return (
    <>
      <CountryBar counts={counts} />
      <div className="wrap">
        {data.accounts.length === 0 ? (
          <section className="view"><div className="panel"><h2>No accounts yet</h2>
            <p>Load the researched UAE accounts with <code>npm run seed</code>, or start new research from the Research Queue.</p></div></section>
        ) : <CoPilotApp data={data} />}
      </div>
    </>
  );
}
