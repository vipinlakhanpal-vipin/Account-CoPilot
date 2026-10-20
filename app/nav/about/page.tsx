import { requirePageUser } from "@/lib/auth";
import { getAccess, canSeeCountry } from "@/lib/access";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { REGIONS, normalizeDefinition, regionOf } from "@/lib/icpDefinition.mjs";
import HomeWorkspace from "@/components/HomeWorkspace";
export const dynamic = "force-dynamic";

// About Account CoPilot, with the two numbers that used to head Home.
export default async function NavAbout() {
  const user = await requirePageUser();
  const access = await getAccess(user);
  const sb = await supabaseServer();
  const countries = async () => { const out: string[] = []; for (let from = 0; ; from += 1000) { const { data } = await supabaseAdmin().from("companies").select("country").range(from, from + 999); out.push(...(data || []).map((r) => String(r.country || ""))); if (!data || data.length < 1000) break; } return out; };
  const [{ data: defRow }, all] = await Promise.all([sb.from("settings").select("value").eq("key", "icp_definition").maybeSingle(), countries()]);
  const def = normalizeDefinition(defRow?.value);
  const mine = REGIONS.filter((r: { key: string }) => access.isSuper || access.regions.includes(r.key));
  const total = all.filter((c) => canSeeCountry(access, c)).length;
  const active = mine.filter((r: { key: string }) => def.regions[r.key]?.status === "active").length;
  return (
    <>
      <h1 className="nav-h">About Account CoPilot</h1>
      <section className="panel" style={{ marginBottom: 12 }}>
        <div className="roles">
          <div className="metric-tile"><div className="note">Companies tracked</div><div style={{ fontSize: 24, fontWeight: 500 }}>{total.toLocaleString()}</div></div>
          <div className="metric-tile"><div className="note">Active regions</div><div style={{ fontSize: 24, fontWeight: 500 }}>{active} of {mine.length}</div></div>
        </div>
      </section>
      <HomeWorkspace access={access} layout="about" />
    </>
  );
}
