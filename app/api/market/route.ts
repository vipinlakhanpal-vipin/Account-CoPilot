import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getAccess, canSeeRegion } from "@/lib/access";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeDefinition } from "@/lib/icpDefinition.mjs";
import { VENDORS, type MarketDoc } from "@/lib/market";

// Market intelligence: partners of SAP, Coupa, Oracle and Microsoft per region and the customers they publish. Read-only, scoped to the user's regions.
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const access = await getAccess(user);
  const db = supabaseAdmin();
  const { data } = await db.from("settings").select("key,value").like("key", "market_intel:%");
  const docs = (data || []).map((r) => r.value as MarketDoc).filter((d) => d && canSeeRegion(access, d.region));
  const def = normalizeDefinition((await db.from("settings").select("value").eq("key", "icp_definition").maybeSingle()).data?.value);
  const regions = Object.entries(def.regions).filter(([k, r]) => canSeeRegion(access, k) && (r as { status: string }).status === "active").map(([k]) => k);
  const jobs = ((await db.from("settings").select("value").eq("key", "engine_jobs").maybeSingle()).data?.value as { jobs: { mode: string; vendor?: string; region: string; status: string; requested_at: string }[] } | null)?.jobs || [];
  const { data: co } = await db.from("companies").select("slug");
  const inApp = new Set((co || []).map((c) => c.slug as string));
  return NextResponse.json({
    vendors: VENDORS, regions,
    partners: docs.flatMap((d) => d.partners || []),
    customers: docs.flatMap((d) => (d.customers || []).map((c) => ({ ...c, in_app: !!c.slug && inApp.has(c.slug) }))),
    scans: Object.fromEntries(docs.map((d) => [`${d.vendor}|${d.region}`, d.scanned_at])),
    jobs: jobs.filter((j) => j.mode === "market" && canSeeRegion(access, j.region)).slice(0, 10),
  });
}
