import { requirePageUser } from "@/lib/auth";
import TierSettings from "@/components/TierSettings";
import Hero from "@/components/Hero";
import TeamSettings from "@/components/TeamSettings";
import CostInfo from "@/components/CostInfo";
import EngineSettings from "@/components/EngineSettings";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requirePageUser();
  const sb = await supabaseServer();
  const { data } = await sb.from("settings").select("value").eq("key", "contact_tiers").maybeSingle();
  return (
    <>
      <div className="wrap"><Hero title="Settings" text="Discovery & refresh engine, API spend, contact tiers, your team, and what uses the Anthropic API key." /><EngineSettings /><TierSettings initial={(data?.value as Tier[]) || []} /><TeamSettings /><CostInfo /></div>
    </>
  );
}
type Tier = { tier: string; label: string; examples: string };
