import { requirePageUser } from "@/lib/auth";
import Header from "@/components/Header";
import TierSettings from "@/components/TierSettings";
import Hero from "@/components/Hero";
import TeamSettings from "@/components/TeamSettings";
import CostInfo from "@/components/CostInfo";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requirePageUser();
  const sb = await supabaseServer();
  const { data } = await sb.from("settings").select("value").eq("key", "contact_tiers").maybeSingle();
  return (
    <>
      <Header active="Settings" subtitle="Configurable contact tiering" />
      <div className="wrap"><Hero title="Settings" text="Contact tiers, your team, and what uses the Anthropic API key." /><TierSettings initial={(data?.value as Tier[]) || []} /><TeamSettings /><CostInfo /></div>
    </>
  );
}
type Tier = { tier: string; label: string; examples: string };
