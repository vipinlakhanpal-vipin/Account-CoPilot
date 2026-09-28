import { requirePageUser } from "@/lib/auth";
import Hero from "@/components/Hero";
import IcpEditor from "@/components/IcpEditor";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeDefinition, regionOf } from "@/lib/icpDefinition.mjs";

export const dynamic = "force-dynamic";

// Setup → Define ICP: the rules the agent follows, one profile per region. Saved rules drive ICP status, the Pipeline,
// the left panel defaults, in-app research and the daily 6am run (which reads them through the engine worker API).
export default async function DefineIcpPage() {
  await requirePageUser();
  const db = supabaseAdmin();
  const [{ data: row }, { data: cos }] = await Promise.all([
    db.from("settings").select("value").eq("key", "icp_definition").maybeSingle(),
    db.from("companies").select("country"),
  ]);
  const counts: Record<string, number> = {};
  for (const c of cos || []) { const k = regionOf(c.country); counts[k] = (counts[k] || 0) + 1; }
  return (
    <div className="wrap">
      <Hero title="Define ICP" text="Your Ideal Customer Profile, region by region. The agent follows exactly what you set here when it searches, verifies, scores and profiles companies." />
      <section className="panel icp-how">
        <h3>How the agent uses your ICP</h3>
        <ol>
          <li><b>Search:</b> each morning the 6am run reads these rules first. It looks only in <b>active</b> regions, for companies of the size, type and industries you chose, and never adds anything on your &quot;never add&quot; list.</li>
          <li><b>Verify:</b> it checks revenue using the measure you chose (net revenue, or operating income for banks) and only the sources you allow for <b>Verified</b>.</li>
          <li><b>Decide status:</b> every account is Verified, Likely, Needs check, Not ICP or Unknown by these rules. When you save, every company is recalculated at once.</li>
          <li><b>Prioritise:</b> the Pipeline uses your weights and minimum ICP Match, and contact research follows your buyer personas.</li>
        </ol>
        <p className="note">Each setting is tagged with what it drives (Status, Discovery, Verification, Pipeline, Contacts, Daily run). Use <b>Preview impact</b> to see how many accounts would change before you save. Every save is recorded in the change history.</p>
      </section>
      <IcpEditor initial={normalizeDefinition(row?.value)} counts={counts} />
    </div>
  );
}
