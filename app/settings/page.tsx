import { requirePageUser } from "@/lib/auth";
import TierSettings from "@/components/TierSettings";
import Hero from "@/components/Hero";
import CostInfo from "@/components/CostInfo";
import EngineSettings from "@/components/EngineSettings";
import ScrollToHash from "@/components/ScrollToHash";
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
      <ScrollToHash />
      <div className="wrap"><Hero title="Settings" text="Discovery & refresh engine, API credit and PIN, contact tiers, and what uses the Anthropic API key. Team, roles and regions are in Setup → Team." />
        {access.isSuper ? <><EngineSettings /><TierSettings initial={(data?.value as Tier[]) || []} /></>
          : <section className="panel" style={{ marginTop: 16 }}><h2>Your access</h2>
              <p><b>{ROLE_LABEL[access.role]}</b> for <b>{access.regions.join(", ") || "no region yet"}</b>. The whole app — dashboard, accounts, pipeline, research, the daily engine and the Master Book — works only on your region, by your region&apos;s ICP (Setup → Define ICP).</p>
              <p className="note">The engine and contact tiers are managed by your Super Admin; see your team access in Setup → Team.</p></section>}
        <CostInfo /></div>
    </>
  );
}
type Tier = { tier: string; label: string; examples: string };
