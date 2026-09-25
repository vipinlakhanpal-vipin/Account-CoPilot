import { requirePageUser } from "@/lib/auth";
import Header from "@/components/Header";
import TierSettings from "@/components/TierSettings";
import Hero from "@/components/Hero";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requirePageUser();
  const sb = await supabaseServer();
  const { data } = await sb.from("settings").select("value").eq("key", "contact_tiers").maybeSingle();
  return (
    <>
      <Header active="Settings" subtitle="Configurable contact tiering" />
      <div className="wrap"><Hero title="Settings" text="Configure contact tiers used to classify decision makers." /><TierSettings initial={(data?.value as Tier[]) || []} /></div>
    </>
  );
}
type Tier = { tier: string; label: string; examples: string };
