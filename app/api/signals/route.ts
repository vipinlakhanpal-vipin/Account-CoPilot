import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getAccess, canSeeRegion } from "@/lib/access";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { regionOf, normalizeDefinition } from "@/lib/icpDefinition.mjs";
import { EMPTY_STORE, type SignalStore, type SignalStatus } from "@/lib/signals";

// Buying signals for the Signals tab and the alert badge. Scoped to the user's regions; standard users can mark signals seen, done or dismissed in their own regions.
export const dynamic = "force-dynamic";

const load = async () => ((await supabaseAdmin().from("settings").select("value").eq("key", "buying_signals").maybeSingle()).data?.value as SignalStore | null) ?? EMPTY_STORE;

export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const access = await getAccess(user);
  const st = await load();
  const today = new Date().toISOString().slice(0, 10);
  const mine = (st.items || []).filter((s) => canSeeRegion(access, regionOf(s.region)) && !(s.lane === "rfp" && s.closes && s.closes < today));
  if (new URL(req.url).searchParams.get("count") === "1") {
    const fresh = mine.filter((s) => s.status === "new" && s.strength !== "Watch");
    return NextResponse.json({ new: fresh.length, hot: fresh.filter((s) => s.strength === "Hot").length });
  }
  const db = supabaseAdmin();
  const def = normalizeDefinition((await db.from("settings").select("value").eq("key", "icp_definition").maybeSingle()).data?.value);
  const regions = Object.entries(def.regions).filter(([k, r]) => canSeeRegion(access, k) && (r as { status: string }).status === "active").map(([k]) => k);
  const jobs = ((await db.from("settings").select("value").eq("key", "engine_jobs").maybeSingle()).data?.value as { jobs: { mode: string; slug?: string; region: string; status: string; company_name?: string; result?: string; requested_at: string }[] } | null)?.jobs || [];
  return NextResponse.json({ items: mine, regions, sweeps: st.sweeps || {}, jobs: jobs.filter((j) => j.mode === "signals" && (j.status === "queued" || (j.status === "running" && Date.now() - new Date((j as { started_at?: string }).started_at || j.requested_at).getTime() < 60 * 60000) || j.status === "done" || j.status === "error") && canSeeRegion(access, regionOf(j.region))).slice(0, 10) });
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { action?: string; id?: string; ids?: string[]; status?: SignalStatus };
  const status = b.status;
  if (b.action !== "status" || !status || !["new", "seen", "done", "dismissed"].includes(status)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const ids = new Set(b.ids?.length ? b.ids : b.id ? [b.id] : []);
  const access = await getAccess(user);
  const st = await load();
  let n = 0;
  for (const s of st.items || []) if (ids.has(s.id) && canSeeRegion(access, regionOf(s.region))) { s.status = status; n++; }
  if (!n) return NextResponse.json({ error: "Signal not found." }, { status: 404 });
  await supabaseAdmin().from("settings").upsert({ key: "buying_signals", value: st, updated_at: new Date().toISOString() });
  return NextResponse.json({ ok: true, updated: n });
}
