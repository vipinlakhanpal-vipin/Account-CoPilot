import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getAccess, canSeeRegion } from "@/lib/access";
import { requirePaidApproval, pinSetting, savePin } from "@/lib/paidGuard";
import { regionOf, normalizeDefinition } from "@/lib/icpDefinition.mjs";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { invalidateAllData } from "@/lib/dataCache";
import { createHash, randomBytes } from "node:crypto";

// Engine control (Settings → Discovery & refresh engine).
//  • queue   — a no-API-cost job for the scheduled Claude sessions (verify / discover N companies in a region).
//  • refresh — a paid run within a budget: update existing companies and find + profile new ones; unused budget carries over.
//  • balance — record the Anthropic credit balance shown in the Console (the API key cannot read it).
// State lives in the settings table: engine_jobs, engine_refresh, engine_balance. Spend = sum of research_runs.stats.cost_usd.
export const maxDuration = 60;
export const dynamic = "force-dynamic";
const EST = { update: 0.55, discovery: 0.75, profile: 0.55 }; // USD per Quick research / discovery search / new-company profile

type Job = { id: string; region: string; count: number | "max"; mode: "verify" | "discover" | "both" | "company"; company_name?: string; website?: string; requested_by: string; requested_at: string;
  status: "queued" | "running" | "done" | "error"; done_at?: string; result?: string };
type Batch = { id: string; region: string; update_count: number; new_count: number; budget: number; available: number; planned_update: number; planned_new: number;
  requested_by: string; at: string; companies: string[] };
type PendingCo = { id: string; name: string; website?: string; country: string; region: string; industry?: string; hq_city?: string; why_icp?: string; source_url?: string; watch?: boolean; requested_at: string };

async function getSetting<T>(db: ReturnType<typeof supabaseAdmin>, key: string, fallback: T): Promise<T> {
  const { data } = await db.from("settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as T) ?? fallback;
}
const setSetting = (db: ReturnType<typeof supabaseAdmin>, key: string, value: unknown) =>
  db.from("settings").upsert({ key, value, updated_at: new Date().toISOString() });

// Opens a GitHub issue in account-copilot-jobs so the "instant job runner" routine's GitHub-event trigger fires right
// away, instead of waiting for the next 6am run. Needs GITHUB_JOBS_TOKEN (a fine-grained PAT, Issues: write only, scoped
// to that one repo) in Vercel's environment variables. Best-effort: if it's not set or the call fails, the job still
// sits in the free queue and gets picked up at the next scheduled run — nothing here is required for queueing to work.
async function openJobIssue(job: Job) {
  const token = process.env.GITHUB_JOBS_TOKEN;
  if (!token) return;
  const title = job.mode === "company" ? `Job ${job.id}: check "${job.company_name}" (${job.region})` : `Job ${job.id}: ${job.mode} ${job.count} in ${job.region}`;
  const body = `Queued by ${job.requested_by} at ${job.requested_at}.\n\nAuto-opened by Account CoPilot so the instant job runner fires now instead of waiting for 6am. The job itself is tracked in the app (Setup → Settings), not in this issue — closing or leaving this open makes no difference.`;
  try {
    await fetch("https://api.github.com/repos/vipinlakhanpal-vipin/account-copilot-jobs/issues", {
      method: "POST", headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
      body: JSON.stringify({ title, body }),
    });
  } catch { /* best-effort */ }
}

async function summary(db: ReturnType<typeof supabaseAdmin>) {
  const [jobs, refresh, balance] = await Promise.all([getSetting<{ jobs: Job[] }>(db, "engine_jobs", { jobs: [] }),
    getSetting<{ batches: Batch[] }>(db, "engine_refresh", { batches: [] }), getSetting<{ amount?: number; as_of?: string; by?: string }>(db, "engine_balance", {})]);
  const tk = await getSetting<{ hash?: string; created_at?: string; by?: string; hint?: string; revoked_at?: string }>(db, "engine_token", {});
  const { data: runs } = await db.from("research_runs").select("started_at,stats,status,company_name").order("started_at", { ascending: false }).limit(1000);
  const cost = (r: { stats?: { cost_usd?: number } | null }) => Number(r.stats?.cost_usd) || 0;
  const month = new Date().toISOString().slice(0, 7);
  const spentAll = (runs || []).reduce((t, r) => t + cost(r), 0);
  const spentMonth = (runs || []).filter((r) => String(r.started_at).startsWith(month)).reduce((t, r) => t + cost(r), 0);
  const batches = refresh.batches.map((b) => { const rs = (runs || []).filter((r) => (r.stats as { batch_id?: string } | null)?.batch_id === b.id);
    return { ...b, spent: +rs.reduce((t, r) => t + cost(r), 0).toFixed(2), runs: rs.length, running: rs.filter((r) => r.status !== "done" && r.status !== "error").length }; });
  const carry = Math.max(0, +batches.reduce((t, b) => t + b.budget - b.spent, 0).toFixed(2));
  const spentSinceBalance = balance.as_of ? (runs || []).filter((r) => String(r.started_at) >= String(balance.as_of)).reduce((t, r) => t + cost(r), 0) : 0;
  const pending = await getSetting<{ items: PendingCo[] }>(db, "engine_pending", { items: [] });
  const icpDef = normalizeDefinition((await db.from("settings").select("value").eq("key", "icp_definition").maybeSingle()).data?.value);
  const pendingWithStatus = pending.items.map((p) => ({ ...p, region_status: icpDef.regions[p.region]?.status || "paused" }));
  return { token_info: tk.hash ? { created_at: tk.created_at, by: tk.by, hint: tk.hint } : null, jobs: jobs.jobs, batches, carry, spentAll: +spentAll.toFixed(2), spentMonth: +spentMonth.toFixed(2), balance,
    balanceLeft: balance.amount !== undefined ? +(balance.amount - spentSinceBalance).toFixed(2) : null, est: EST, pending: pendingWithStatus,
    pin: await pinSetting().then((p) => ({ set: !!p.hash, ask_super: !!p.ask_super, set_by: p.set_by || "", set_at: p.set_at || "" })) };
}

export async function GET(req: Request) {
  if (!(await requireUser())) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const db = supabaseAdmin();
  // ?only=log → just the scheduled-run notifications (for the bell in the top bar).
  if (new URL(req.url).searchParams.get("only") === "log")
    return NextResponse.json(await getSetting(db, "engine_log", { entries: [] }), { headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ ...(await summary(db)), log: (await getSetting<{ entries: unknown[] }>(db, "engine_log", { entries: [] })).entries });
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("queue"), region: z.string().min(2).max(40), count: z.union([z.number().int().min(1).max(500), z.literal("max")]), mode: z.enum(["verify", "discover", "both", "company"]),
    company_name: z.string().trim().max(120).optional(), website: z.string().trim().max(200).optional() }),
  z.object({ action: z.literal("refresh"), region: z.string().min(2).max(40), update_count: z.number().int().min(0).max(50), new_count: z.number().int().min(0).max(10), budget: z.number().min(0).max(500) }),
  z.object({ action: z.literal("balance"), amount: z.number().min(0).max(100000) }),
  z.object({ action: z.literal("cancel"), id: z.string() }),
  z.object({ action: z.literal("token"), op: z.enum(["generate", "revoke"]) }),
  z.object({ action: z.literal("pin"), pin: z.string().regex(/^\d{6,12}$/).nullable(), ask_super: z.boolean() }),
  z.object({ action: z.literal("release_pending"), id: z.string() }),
  z.object({ action: z.literal("dismiss_pending"), id: z.string() }),
]);

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const raw = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    const why = parsed.error.issues.map((i) => `${i.path.join(".") || "request"}: ${i.message}`).join("; ");
    console.error("engine POST rejected", (raw as { action?: string })?.action, why);
    return NextResponse.json({ error: (raw as { action?: string })?.action === "pin" ? `PIN not saved — ${why}. Use 6–12 digits only.` : `Invalid request (${why}).` }, { status: 400 });
  }
  const b = parsed.data, db = supabaseAdmin(), now = new Date().toISOString(), id = crypto.randomUUID().slice(0, 8);
  if (b.action === "pin") { // Super Admin only (checked below): set / change the paid-actions PIN
    if (!(await getAccess(user)).isSuper) return NextResponse.json({ error: "Only a Super Admin can set the paid-actions PIN." }, { status: 403 });
    try {
      const saved = await savePin(b.pin, b.ask_super, user.email || "");
      if (saved) return NextResponse.json({ error: `PIN not saved — database said: ${saved}` }, { status: 500 });
      return NextResponse.json({ ...(await summary(db)), message: b.pin ? "Paid-actions PIN saved." : "Setting saved." });
    } catch (e) {
      console.error("PIN save failed", e);
      return NextResponse.json({ error: `PIN not saved — ${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
    }
  }
  if (b.action === "refresh") { const blocked = await requirePaidApproval(req, user); if (blocked) return blocked; } // paid-actions PIN
  // Super Admin: everything. Standard user: only queue jobs / refresh in their own region (no token, no balance).
  const access = await getAccess(user);
  if (!access.isSuper) {
    const region = "region" in b ? regionOf(b.region) : "";
    if (!["queue", "refresh"].includes(b.action) || !canSeeRegion(access, region))
      return NextResponse.json({ error: "Only a Super Admin can change this. Standard users can queue work for their own region." }, { status: 403 });
  }

  if (b.action === "token") {
    // Engine token for scheduled sessions: shown once, only its SHA-256 hash is stored. Generating a new one revokes the old.
    if (b.op === "revoke") { await setSetting(db, "engine_token", { revoked_at: now, by: user.email }); return NextResponse.json({ ...(await summary(db)), token: null }); }
    const token = randomBytes(32).toString("hex");
    await setSetting(db, "engine_token", { hash: createHash("sha256").update(token).digest("hex"), created_at: now, by: user.email, hint: token.slice(-4) });
    return NextResponse.json({ ...(await summary(db)), token });
  }
  if (b.action === "release_pending" || b.action === "dismiss_pending") {
    // A held company (its real region wasn't Active when found): add it now, or dismiss it. Region-activation gate
    // only matters for "release" — dismiss always works so a stale/unwanted entry isn't stuck forever.
    const st = await getSetting<{ items: PendingCo[] }>(db, "engine_pending", { items: [] });
    const p = st.items.find((x) => x.id === b.id);
    if (!p) return NextResponse.json({ error: "Not found — it may already have been added or dismissed." }, { status: 404 });
    if (b.action === "release_pending") {
      const icpDef = normalizeDefinition((await db.from("settings").select("value").eq("key", "icp_definition").maybeSingle()).data?.value);
      if (icpDef.regions[p.region]?.status !== "active") return NextResponse.json({ error: `${p.region} is not Active yet — activate it in Define ICP first.` }, { status: 400 });
      const slug = "cd-" + p.name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
      const row = { slug, company_name: p.name, country: p.country, company_website: p.website || null, domain: (p.website || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || null,
        hq_city: p.hq_city || null, industry: p.industry || null, research_channel: "Claude discovery", lists: ["Claude discovery"], icp_status: "Unknown",
        account_notes: `Found by a scheduled Claude session, held until ${p.region} was activated: ${p.why_icp} Source: ${p.source_url}`,
        profile: { "Claude discovery": { why: p.why_icp, source_url: p.source_url, via: "scheduled session (no API cost)" }, ...(p.watch ? { Watch: { since: now, reason: "requested in Settings" } } : {}) } };
      const { error } = await db.from("companies").upsert([row], { onConflict: "slug", ignoreDuplicates: true });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      invalidateAllData();
    }
    await setSetting(db, "engine_pending", { items: st.items.filter((x) => x.id !== b.id) });
    return NextResponse.json(await summary(db));
  }
  if (b.action === "queue" || b.action === "cancel") {
    const st = await getSetting<{ jobs: Job[] }>(db, "engine_jobs", { jobs: [] });
    if (b.action === "queue" && b.mode === "company" && !(b.company_name && b.company_name.length >= 2)) return NextResponse.json({ error: "Enter the company name." }, { status: 400 });
    if (b.action === "queue") {
      const job: Job = { id, region: b.region, count: b.mode === "company" ? 1 : b.count, mode: b.mode, ...(b.mode === "company" ? { company_name: b.company_name, website: b.website || "" } : {}),
        requested_by: user.email || "", requested_at: now, status: "queued" };
      st.jobs.unshift(job);
      await openJobIssue(job);
    } else st.jobs = st.jobs.filter((j) => !(j.id === b.id && j.status === "queued"));
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
    const cookie = req.headers.get("cookie") || "", origin = new URL(req.url).origin, h = { "Content-Type": "application/json", cookie, "x-paid-pin": req.headers.get("x-paid-pin") || "" };
    // Each research / discovery runs in its own function invocation (they return immediately and work in the background).
    await Promise.all([
      ...(targets || []).map((t) => fetch(`${origin}/api/research`, { method: "POST", headers: h, body: JSON.stringify({ company: t.company_name, country: t.country, depth: "quick", companyId: t.id, batchId: id }) }).catch(() => null)),
      planned_new ? fetch(`${origin}/api/discover`, { method: "POST", headers: h, body: JSON.stringify({ country: b.region, limit: planned_new, profile: true, batchId: id,
        criteria: "Revenue ≥ USD 250M, ≥ 100 employees; group HQs only; exclude government bodies, single sites and foreign branches." }) }).catch(() => null) : null,
    ]);
  }
  return NextResponse.json(await summary(db));
}
