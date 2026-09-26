import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Engine control (Settings → Discovery & refresh engine).
//  • queue   — a no-API-cost job for the scheduled Claude sessions (verify / discover N companies in a region).
//  • refresh — a paid run within a budget: update existing companies and find + profile new ones; unused budget carries over.
//  • balance — record the Anthropic credit balance shown in the Console (the API key cannot read it).
// State lives in the settings table: engine_jobs, engine_refresh, engine_balance. Spend = sum of research_runs.stats.cost_usd.
export const maxDuration = 60;
const EST = { update: 0.55, discovery: 0.75, profile: 0.55 }; // USD per Quick research / discovery search / new-company profile

type Job = { id: string; region: string; count: number | "max"; mode: "verify" | "discover" | "both"; requested_by: string; requested_at: string;
  status: "queued" | "running" | "done" | "error"; done_at?: string; result?: string };
type Batch = { id: string; region: string; update_count: number; new_count: number; budget: number; available: number; planned_update: number; planned_new: number;
  requested_by: string; at: string; companies: string[] };

async function getSetting<T>(db: ReturnType<typeof supabaseAdmin>, key: string, fallback: T): Promise<T> {
  const { data } = await db.from("settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as T) ?? fallback;
}
const setSetting = (db: ReturnType<typeof supabaseAdmin>, key: string, value: unknown) =>
  db.from("settings").upsert({ key, value, updated_at: new Date().toISOString() });

async function summary(db: ReturnType<typeof supabaseAdmin>) {
  const [jobs, refresh, balance] = await Promise.all([getSetting<{ jobs: Job[] }>(db, "engine_jobs", { jobs: [] }),
    getSetting<{ batches: Batch[] }>(db, "engine_refresh", { batches: [] }), getSetting<{ amount?: number; as_of?: string; by?: string }>(db, "engine_balance", {})]);
  const { data: runs } = await db.from("research_runs").select("started_at,stats,status,company_name").order("started_at", { ascending: false }).limit(1000);
  const cost = (r: { stats?: { cost_usd?: number } | null }) => Number(r.stats?.cost_usd) || 0;
  const month = new Date().toISOString().slice(0, 7);
  const spentAll = (runs || []).reduce((t, r) => t + cost(r), 0);
  const spentMonth = (runs || []).filter((r) => String(r.started_at).startsWith(month)).reduce((t, r) => t + cost(r), 0);
  const batches = refresh.batches.map((b) => { const rs = (runs || []).filter((r) => (r.stats as { batch_id?: string } | null)?.batch_id === b.id);
    return { ...b, spent: +rs.reduce((t, r) => t + cost(r), 0).toFixed(2), runs: rs.length, running: rs.filter((r) => r.status !== "done" && r.status !== "error").length }; });
  const carry = Math.max(0, +batches.reduce((t, b) => t + b.budget - b.spent, 0).toFixed(2));
  const spentSinceBalance = balance.as_of ? (runs || []).filter((r) => String(r.started_at) >= String(balance.as_of)).reduce((t, r) => t + cost(r), 0) : 0;
  return { jobs: jobs.jobs, batches, carry, spentAll: +spentAll.toFixed(2), spentMonth: +spentMonth.toFixed(2), balance,
    balanceLeft: balance.amount !== undefined ? +(balance.amount - spentSinceBalance).toFixed(2) : null, est: EST };
}

export async function GET(req: Request) {
  if (!(await requireUser())) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const db = supabaseAdmin();
  // ?only=log → just the scheduled-run notifications (for the bell in the top bar).
  if (new URL(req.url).searchParams.get("only") === "log") return NextResponse.json(await getSetting(db, "engine_log", { entries: [] }));
  return NextResponse.json({ ...(await summary(db)), log: (await getSetting<{ entries: unknown[] }>(db, "engine_log", { entries: [] })).entries });
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("queue"), region: z.string().min(2).max(40), count: z.union([z.number().int().min(1).max(500), z.literal("max")]), mode: z.enum(["verify", "discover", "both"]) }),
  z.object({ action: z.literal("refresh"), region: z.string().min(2).max(40), update_count: z.number().int().min(0).max(50), new_count: z.number().int().min(0).max(10), budget: z.number().min(0).max(500) }),
  z.object({ action: z.literal("balance"), amount: z.number().min(0).max(100000) }),
  z.object({ action: z.literal("cancel"), id: z.string() }),
]);

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const b = parsed.data, db = supabaseAdmin(), now = new Date().toISOString(), id = crypto.randomUUID().slice(0, 8);

  if (b.action === "queue" || b.action === "cancel") {
    const st = await getSetting<{ jobs: Job[] }>(db, "engine_jobs", { jobs: [] });
    if (b.action === "queue") st.jobs.unshift({ id, region: b.region, count: b.count, mode: b.mode, requested_by: user.email || "", requested_at: now, status: "queued" });
    else st.jobs = st.jobs.filter((j) => !(j.id === b.id && j.status === "queued"));
    await setSetting(db, "engine_jobs", { jobs: st.jobs.slice(0, 50) });
  } else if (b.action === "balance") {
    await setSetting(db, "engine_balance", { amount: b.amount, as_of: now, by: user.email });
  } else {
    // Paid refresh within budget + carry-over: updates first, then discovery + profiles of new companies.
    const s = await summary(db);
    const available = +(b.budget + s.carry).toFixed(2);
    let left = available;
    const planned_update = Math.min(b.update_count, Math.floor(left / EST.update)); left -= planned_update * EST.update;
    const planned_new = left >= EST.discovery + EST.profile ? Math.min(b.new_count, Math.floor((left - EST.discovery) / EST.profile)) : 0;
    if (!planned_update && !planned_new) return NextResponse.json({ error: `Budget too small: $${available} available (including $${s.carry} carried over).` }, { status: 400 });
    const { data: targets } = await db.from("companies").select("id,company_name,country").eq("country", b.region).in("icp_status", ["ICP — Verified", "ICP — Likely", "ICP — Needs check"])
      .order("last_researched", { ascending: true, nullsFirst: true }).limit(planned_update);
    const batch: Batch = { id, region: b.region, update_count: b.update_count, new_count: b.new_count, budget: b.budget, available, planned_update: targets?.length || 0, planned_new,
      requested_by: user.email || "", at: now, companies: (targets || []).map((t) => t.company_name) };
    const st = await getSetting<{ batches: Batch[] }>(db, "engine_refresh", { batches: [] });
    await setSetting(db, "engine_refresh", { batches: [batch, ...st.batches].slice(0, 100) });
    const cookie = req.headers.get("cookie") || "", origin = new URL(req.url).origin, h = { "Content-Type": "application/json", cookie };
    // Each research / discovery runs in its own function invocation (they return immediately and work in the background).
    await Promise.all([
      ...(targets || []).map((t) => fetch(`${origin}/api/research`, { method: "POST", headers: h, body: JSON.stringify({ company: t.company_name, country: t.country, depth: "quick", companyId: t.id, batchId: id }) }).catch(() => null)),
      planned_new ? fetch(`${origin}/api/discover`, { method: "POST", headers: h, body: JSON.stringify({ country: b.region, limit: planned_new, profile: true, batchId: id,
        criteria: "Revenue ≥ USD 250M, ≥ 100 employees; group HQs only; exclude government bodies, single sites and foreign branches." }) }).catch(() => null) : null,
    ]);
  }
  return NextResponse.json(await summary(db));
}
