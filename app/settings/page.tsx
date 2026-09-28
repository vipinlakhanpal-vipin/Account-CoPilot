import { requirePageUser } from "@/lib/auth";
import TierSettings from "@/components/TierSettings";
import Hero from "@/components/Hero";
import TeamSettings from "@/components/TeamSettings";
import CostInfo from "@/components/CostInfo";
import EngineSettings from "@/components/EngineSettings";
import { supabaseServer } from "@/lib/supabase/server";
import { getAccess, ROLE_LABEL } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requirePageUser();
  const access = await getAccess(user);
  const sb = await supabaseServer();
  const { data } = await sb.from("settings").select("value").eq("key", "contact_tiers").maybeSingle();
  return (
    <>
      <div className="wrap"><Hero title="Settings" text="Discovery & refresh engine, API spend, contact tiers, your team (roles and regions), and what uses the Anthropic API key." />
        {access.isSuper ? <><EngineSettings /><TierSettings initial={(data?.value as Tier[]) || []} /><TeamSettings /></>
          : <section className="panel" style={{ marginTop: 16 }}><h2>Your access</h2>
              <p><b>{ROLE_LABEL[access.role]}</b> for <b>{access.regions.join(", ") || "no region yet"}</b>. The whole app — dashboard, accounts, pipeline, research, the daily engine and the Master Book — works only on your region, by your region&apos;s ICP (Setup → Define ICP).</p>
              <p className="note">The engine, contact tiers and team are managed by your Super Admin.</p></section>}
        <CostInfo /></div>
    </>
  );
}
type Tier = { tier: string; label: string; examples: string };
