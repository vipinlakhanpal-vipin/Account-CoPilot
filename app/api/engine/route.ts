import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getAccess, canSeeRegion, canSeeCountry } from "@/lib/access";
import { requirePaidApproval, pinSetting, savePin } from "@/lib/paidGuard";
import { vendorList, VENDORS_KEY } from "@/lib/market";
import { regionOf, canonCountry, normalizeDefinition, summarizeRules, effectiveEngine, REGIONS } from "@/lib/icpDefinition.mjs";
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

type JobDetail = { name: string; status?: string; revenue?: string; industry?: string; hq_city?: string; why_icp?: string; source_url?: string; country?: string; decided?: "added" | "ignored"; entity_type?: "Regional HQ" | "Branch" | "Foreign Branch" | "Unknown" };
type Job = { id: string; region: string; count: number | "max"; mode: "verify" | "discover" | "both" | "company" | "contacts" | "signals" | "market" | "pitch"; vendor?: string; customer?: string; partner?: string; contacts_only?: boolean; phase?: "partners" | "customers"; lane?: "erp" | "rfp" | "ecc"; company_name?: string; slug?: string; seamless?: boolean; website?: string; company_names?: string[]; requested_by: string; requested_at: string;
  status: "queued" | "running" | "done" | "error"; done_at?: string; result?: string; details?: JobDetail[] };
type IgnoredCo = { id: string; name: string; country: string; region: string; industry?: string; hq_city?: string; why_icp?: string; source_url?: string; ignored_at: string; ignored_by: string; recheck_at: string };
type Batch = { id: string; region: string; update_count: number; new_count: number; budget: number; available: number; planned_update: number; planned_new: number;
  requested_by: string; at: string; companies: string[] };
type PendingCo = { id: string; name: string; website?: string; country: string; region: string; industry?: string; hq_city?: string; why_icp?: string; source_url?: string; watch?: boolean; requested_at: string; entity_type?: "Regional HQ" | "Branch" | "Foreign Branch" | "Unknown" };

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
// One session works through the whole queue (it claims job after job until none is left). So a new job only wakes a new session when no session has been busy for the last 20 minutes;
// otherwise nine queued scans started nine sessions at once, which used up the Claude plan's usage limit within minutes.
async function wake(job: Job, jobs: Job[]): Promise<string> {
  const busy = jobs.some((j) => j.id !== job.id && j.status === "running" && Date.now() - new Date((j as Job & { started_at?: string }).started_at || j.requested_at).getTime() < 20 * 60000);
  return busy ? "ok" : openJobIssue(job);
}
async function openJobIssue(job: Job): Promise<string> {
  const token = process.env.GITHUB_JOBS_TOKEN;
  if (!token) return "not_set";
  const title = job.mode === "pitch" ? `Job ${job.id}: pitch plan for "${job.company_name}" (${job.region})` : job.mode === "market" ? `Job ${job.id}: market intelligence ${job.phase ? `${job.phase} only, ` : ""}${job.customer ? `contacts for "${job.customer}"` : job.partner ? `more customers of "${job.partner}"` : job.contacts_only ? `customer contacts, ${job.vendor || "all vendors"}` : job.vendor || "all vendors"} (${job.region})` : job.mode === "signals" ? `Job ${job.id}: buying signals ${job.company_name ? `for "${job.company_name}"` : "scan"} (${job.region})` : job.mode === "contacts" ? `Job ${job.id}: find contacts at "${job.company_name}" (${job.region})${job.seamless ? " with Seamless" : ""}` : job.mode === "company" ? `Job ${job.id}: check "${job.company_name}" (${job.region})` : `Job ${job.id}: ${job.mode} ${job.count} in ${job.region}`;
  const body = `Queued by ${job.requested_by} at ${job.requested_at}.\n\nAuto-opened by Account CoPilot so the instant job runner fires now instead of waiting for the next daily run. The job itself is tracked in the app (Setup → Settings), not in this issue — closing or leaving this open makes no difference.`;
  try {
    const r = await fetch("https://api.github.com/repos/vipinlakhanpal-vipin/account-copilot-jobs/issues", {
      method: "POST", headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
      body: JSON.stringify({ title, body }),
    });
    return r.ok ? "ok" : `github_${r.status}`;
  } catch { return "failed"; }
}

// Shared insert for a company found by a scheduled session (held pending region activation, or held pending the user's Add/Ignore review).
function foundCompanyRow(p: { name: string; website?: string; country: string; industry?: string; hq_city?: string; why_icp?: string; source_url?: string; watch?: boolean; entity_type?: "Regional HQ" | "Branch" | "Foreign Branch" | "Unknown" }, at: string) {
  const slug = "cd-" + p.name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  return { slug, company_name: p.name, country: canonCountry(p.country), company_website: p.website || null,
    domain: (p.website || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || null,
    hq_city: p.hq_city || null, industry: p.industry || null, research_channel: "Claude discovery", lists: ["Claude discovery"], icp_status: "Unknown", entity_type: p.entity_type || "Unknown",
    account_notes: `Found by a scheduled Claude session: ${p.why_icp || ""} Source: ${p.source_url || ""}`,
    profile: { "Claude discovery": { why: p.why_icp || "", source_url: p.source_url || "", via: "scheduled session (no API cost)" }, ...(p.watch ? { Watch: { since: at, reason: "requested in Settings" } } : {}) } };
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

type LogDetail = { name: string; status?: string; revenue?: string; region?: string; entity_type?: string };
type LogEntry = { region?: string; summary: string; details?: LogDetail[] };
type ActivityLogEntry = LogEntry & { at: string; verified: number; new_companies: string[]; source?: string };
type ActivityRun = { at: string; region: string; source?: string; added: number; checked: number; summary: string;
  rows: { name: string; status: string; revenue?: string; entity_type?: string; isNew: boolean }[] };

// Older log entries (before ENGINE.md required one `log` call per region) can have several regions joined into
// one entry, with no per-row region to tell which company belongs to which. Rather than guess, resolve each
// row's real region from the company record itself — read-only, computed fresh on every request, so it never
// needs the stored log data to be migrated and it also fixes any future entry shaped the same way.
async function enrichRegions(db: ReturnType<typeof supabaseAdmin>, entries: LogEntry[]): Promise<LogEntry[]> {
  const needsIt = entries.filter((e) => (e.region || "").split(",").map((r) => r.trim()).filter(Boolean).length > 1 && (e.details || []).some((d) => !d.region));
  const names = [...new Set(needsIt.flatMap((e) => (e.details || []).map((d) => d.name)))];
  if (!names.length) return entries;
  const { data } = await db.from("companies").select("company_name,country").in("company_name", names);
  const byName = new Map((data || []).map((c) => [c.company_name, c.country]));
  const set = new Set(needsIt);
  return entries.map((e) => (set.has(e) ? { ...e, details: (e.details || []).map((d) => ({ ...d, region: d.region || byName.get(d.name) })) } : e));
}

// A Standard User must only see scheduled-run activity for their own region(s) — the raw log mixes every
// active region into one list, so this is the one place that needs its own scoping (everything else reads
// from scopeData()). When an entry's rows each carry their own region (after enrichRegions above), filter
// row by row so a mixed-region entry still shows a Standard User their own companies instead of being hidden
// entirely; otherwise falls back to the entry's own region, or the one parsed from its summary line.
function scopeLog<T extends LogEntry>(entries: T[], access: Awaited<ReturnType<typeof getAccess>>): T[] {
  if (access.isSuper) return entries;
  return entries.flatMap((e) => {
    if ((e.details || []).some((d) => d.region)) {
      const details = (e.details || []).filter((d) => d.region && (canSeeRegion(access, d.region) || canSeeRegion(access, regionOf(d.region))));
      return details.length ? [{ ...e, details }] : [];
    }
    const region = e.region || e.summary.match(/^([^—]+)—/)?.[1]?.trim();
    return region && (canSeeRegion(access, region) || canSeeRegion(access, regionOf(region))) ? [e] : [];
  });
}

export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const db = supabaseAdmin();
  const access = await getAccess(user);
  // ?only=activity → Mission Control's Engine activity tab: starts from the regions that SHOULD run (Active in Define ICP)
  // so a skipped region shows as a gap, instead of only listing the runs that happened.
  // ?only=find → the Find company page: the regions this user can search, each region's rules in plain numbers, and only
  // that user's regions' jobs. No balance, spend or token details (those stay Super Admin only).
  if (new URL(req.url).searchParams.get("only") === "find") {
    const def = normalizeDefinition(await getSetting<unknown>(db, "icp_definition", null));
    const jobs = await getSetting<{ jobs: Job[] }>(db, "engine_jobs", { jobs: [] });
    const regions = REGIONS.filter((r: { key: string }) => canSeeRegion(access, r.key)).map((r: { key: string; name: string }) => {
      const rl = def.regions[r.key];
      return { key: r.key, name: r.name, status: rl?.status || "paused", revenue_min_usd_m: rl?.revenue?.min_usd_m ?? 250, employees_min: rl?.employees?.min ?? 100,
        listing: rl?.listing || "any", entity_level: rl?.entity_level || "group_hq" };
    });
    return NextResponse.json({ regions, jobs: jobs.jobs.filter((j) => canSeeRegion(access, regionOf(j.region))), est: EST, isSuper: access.isSuper });
  }
  if (new URL(req.url).searchParams.get("only") === "activity") {
    const def = normalizeDefinition(await getSetting<unknown>(db, "icp_definition", null));
    const log = await getSetting<{ entries: ActivityLogEntry[] }>(db, "engine_log", { entries: [] });
    const entries = scopeLog(await enrichRegions(db, log.entries) as ActivityLogEntry[], access);
    const norm = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const regionKeys = new Set<string>(REGIONS.map((r: { key: string }) => r.key));
    // One run per (log entry, region): rows split by their own region when present, else the entry's region(s).
    const runs: ActivityRun[] = [];
    for (const e of entries) {
      const rows = e.details || [];
      const listed = (e.region || e.summary.match(/^([^—]+)—/)?.[1] || "").split(",").map((r) => r.trim()).filter(Boolean);
      const split = rows.some((d) => d.region);
      // Only real regions count — an instant lookup's summary ("Company lookup: …") or a free-text line is not a region.
      const regions = (split ? [...new Set(rows.map((d) => d.region).filter(Boolean) as string[])] : listed).filter((r) => regionKeys.has(r));
      const newSet = new Set((e.new_companies || []).map(norm));
      for (const r of regions) {
        // A legacy entry covering several regions with no per-row region can't be attributed, so it counts as "ran" with no counts
        // rather than copying the same rows into every region.
        const unattributable = !split && regions.length > 1;
        const mine = unattributable ? [] : split ? rows.filter((d) => d.region === r) : rows;
        const added = mine.length ? mine.filter((d) => newSet.has(norm(d.name))).length : regions.length === 1 ? (e.new_companies || []).length : 0;
        runs.push({ at: e.at, region: r, source: e.source, added, checked: mine.length || (regions.length === 1 ? e.verified : 0), summary: e.summary,
          rows: mine.map((d) => ({ name: d.name, status: d.status || "", revenue: d.revenue, entity_type: d.entity_type, isNew: newSet.has(norm(d.name)) })) });
      }
    }
    // Companies — slim columns, paged past the 1000-row API limit.
    type Co = { slug: string; company_name: string; country: string | null; icp_status: string | null; created_at: string; entity_type: string | null; verified_revenue_usd_m: number | null; verified_revenue_status: string | null };
    let companies: Co[] = [];
    for (let from = 0; ; from += 1000) {
      const { data } = await db.from("companies").select("slug,company_name,country,icp_status,created_at,entity_type,verified_revenue_usd_m,verified_revenue_status").order("created_at", { ascending: false }).range(from, from + 999);
      companies = companies.concat((data || []) as Co[]);
      if (!data || data.length < 1000) break;
    }
    companies = companies.filter((c) => canSeeCountry(access, c.country));
    const regions = REGIONS.filter((r) => canSeeRegion(access, r.key)).map((r) => {
      const rules = def.regions[r.key];
      const mine = companies.filter((c) => regionOf(c.country) === r.key);
      const by: Record<string, number> = {};
      for (const c of mine) by[c.icp_status || "Unknown"] = (by[c.icp_status || "Unknown"] || 0) + 1;
      return { region: r.key, name: r.name, status: rules.status as string, priority: effectiveEngine(rules).priority, market: !!rules.market, discover_per_day: effectiveEngine(rules).discover_per_day, verify_per_day: effectiveEngine(rules).verify_per_day, set_discover_per_day: rules.engine.discover_per_day, set_verify_per_day: rules.engine.verify_per_day,
        rules: summarizeRules(r.key, rules), accounts: mine.length, by_status: by };
    });
    return NextResponse.json({ now: new Date().toISOString(), regions, runs, companies: companies.map((c) => ({
      slug: c.slug, name: c.company_name, country: c.country, region: regionOf(c.country), status: c.icp_status, entity_type: c.entity_type, added: c.created_at,
      revenue: c.verified_revenue_usd_m ? `${c.verified_revenue_status === "FACT" ? "" : "~"}$${Math.round(Number(c.verified_revenue_usd_m)).toLocaleString()}M` : "" })) },
      { headers: { "Cache-Control": "no-store" } });
  }
  // ?only=log → just the scheduled-run notifications (for the bell in the top bar).
  if (new URL(req.url).searchParams.get("only") === "log") {
    const log = await getSetting<{ entries: LogEntry[] }>(db, "engine_log", { entries: [] });
    const entries = await enrichRegions(db, log.entries);
    // the regions this user may see, with their status, so the bell can list a region that has not had a run yet
    const def = normalizeDefinition(await getSetting<unknown>(db, "icp_definition", null));
    const regions = REGIONS.filter((r: { key: string }) => canSeeRegion(access, r.key)).map((r: { key: string; name: string }) => ({ key: r.key, name: r.name, status: (def.regions[r.key]?.status || "paused") as string, priority: effectiveEngine(def.regions[r.key]).priority, market: !!def.regions[r.key]?.market }));
    return NextResponse.json({ entries: scopeLog(entries, access), regions }, { headers: { "Cache-Control": "no-store" } });
  }
  const log = await getSetting<{ entries: LogEntry[] }>(db, "engine_log", { entries: [] });
  const entries = await enrichRegions(db, log.entries);
  return NextResponse.json({ ...(await summary(db)), log: scopeLog(entries, access) });
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("queue"), region: z.string().min(2).max(40), count: z.union([z.number().int().min(1).max(500), z.literal("max")]), mode: z.enum(["verify", "discover", "both", "company", "contacts", "signals", "market", "pitch"]), vendor: z.string().trim().max(30).optional(), customer: z.string().trim().max(160).optional(), partner: z.string().trim().max(140).optional(), contacts_only: z.boolean().optional(), phase: z.enum(["partners", "customers"]).optional(), lane: z.enum(["erp", "rfp", "ecc"]).optional(),
    slug: z.string().trim().max(120).optional(), seamless: z.boolean().optional(), company_name: z.string().trim().max(120).optional(), website: z.string().trim().max(200).optional(), company_names: z.array(z.string().trim().min(2).max(120)).max(30).optional() }),
  z.object({ action: z.literal("add_found"), job_id: z.string(), name: z.string() }),
  z.object({ action: z.literal("ignore_found"), job_id: z.string(), name: z.string() }),
  z.object({ action: z.literal("add_all_found"), job_id: z.string() }),
  z.object({ action: z.literal("refresh"), region: z.string().min(2).max(40), update_count: z.number().int().min(0).max(50), new_count: z.number().int().min(0).max(10), budget: z.number().min(0).max(500) }),
  z.object({ action: z.literal("balance"), amount: z.number().min(0).max(100000) }),
  z.object({ action: z.literal("cancel"), id: z.string() }),
  z.object({ action: z.literal("stop_scans"), mode: z.enum(["market", "signals"]) }),
  z.object({ action: z.literal("token"), op: z.enum(["generate", "revoke"]) }),
  z.object({ action: z.literal("pin"), pin: z.string().regex(/^\d{6,12}$/).nullable(), ask_super: z.boolean() }),
  z.object({ action: z.literal("release_pending"), id: z.string() }),
  z.object({ action: z.literal("dismiss_pending"), id: z.string() }),
]);

export async function POST(req: Request) {
  let trigger = ""; // result of waking the instant runner: ok | not_set | github_<status> | failed
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
  if (!access.isSuper && b.action !== "stop_scans") { // stop_scans is limited to the person's own regions below
    let region = "region" in b ? regionOf(b.region) : "";
    const jobId = b.action === "cancel" ? b.id : "job_id" in b ? b.job_id : "";
    if (jobId) { // acting on an existing job: it must belong to one of the user's regions
      const js = await getSetting<{ jobs: Job[] }>(db, "engine_jobs", { jobs: [] });
      const j = js.jobs.find((x) => x.id === jobId);
      region = j ? regionOf(j.region) : "";
    }
    if (!["queue", "refresh", "cancel", "add_found", "ignore_found", "add_all_found"].includes(b.action) || !canSeeRegion(access, region))
      return NextResponse.json({ error: "Only a Super Admin can change this. Standard users can queue work for their own region." }, { status: 403 });
  }

  if (b.action === "stop_scans") {
    // Stop scanning: waiting jobs are removed, running ones are marked stopped (a running cloud session cannot be killed from here; it simply finds its job closed).
    const st = await getSetting<{ jobs: Job[] }>(db, "engine_jobs", { jobs: [] });
    let removed = 0, stopped = 0;
    st.jobs = st.jobs.filter((j) => {
      if (j.mode !== b.mode || !canSeeRegion(access, regionOf(j.region))) return true;
      if (j.status === "queued") { removed++; return false; }
      if (j.status === "running") { j.status = "error"; j.done_at = now; j.result = `Stopped by ${user.email || "a user"}.`; stopped++; }
      return true;
    });
    await setSetting(db, "engine_jobs", { jobs: st.jobs.slice(0, 50) });
    return NextResponse.json({ ok: true, removed, stopped });
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
      const { error } = await db.from("companies").upsert([foundCompanyRow(p, now)], { onConflict: "slug", ignoreDuplicates: true });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      invalidateAllData();
    }
    await setSetting(db, "engine_pending", { items: st.items.filter((x) => x.id !== b.id) });
    return NextResponse.json(await summary(db));
  }
  if (b.action === "add_found" || b.action === "ignore_found" || b.action === "add_all_found") {
    // A "Find new companies" job searched for several named companies for free and reported back per-company results
    // (job.details) without adding any of them — the user decides here, per company or all at once.
    const st = await getSetting<{ jobs: Job[] }>(db, "engine_jobs", { jobs: [] });
    const job = st.jobs.find((j) => j.id === b.job_id);
    if (!job || !job.details) return NextResponse.json({ error: "Job not found, or has no results to act on." }, { status: 404 });
    const targets = b.action === "add_all_found" ? job.details.filter((d) => !d.decided) : job.details.filter((d) => d.name === b.name);
    if (targets.length === 0) return NextResponse.json({ error: "Not found — it may already have been added or ignored." }, { status: 404 });
    if (b.action === "ignore_found") {
      const ig = await getSetting<{ items: IgnoredCo[] }>(db, "engine_ignored", { items: [] });
      for (const t of targets) ig.items.unshift({ id: crypto.randomUUID().slice(0, 8), name: t.name, country: t.country || job.region, region: job.region,
        industry: t.industry, hq_city: t.hq_city, why_icp: t.why_icp, source_url: t.source_url, ignored_at: now, ignored_by: user.email || "",
        recheck_at: new Date(Date.now() + 180 * 864e5).toISOString() });
      await setSetting(db, "engine_ignored", { items: ig.items.slice(0, 300) });
    } else {
      const rows = targets.map((t) => foundCompanyRow({ name: t.name, country: t.country || job.region, industry: t.industry, hq_city: t.hq_city, why_icp: t.why_icp, source_url: t.source_url, entity_type: t.entity_type }, now));
      const { error } = await db.from("companies").upsert(rows, { onConflict: "slug", ignoreDuplicates: true });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      invalidateAllData();
    }
    const names = new Set(targets.map((t) => t.name));
    const decided: "added" | "ignored" = b.action === "ignore_found" ? "ignored" : "added";
    job.details = job.details.map((d) => names.has(d.name) ? { ...d, decided } : d);
    await setSetting(db, "engine_jobs", st);
    return NextResponse.json(await summary(db));
  }
  if (b.action === "queue" || b.action === "cancel") {
    const st = await getSetting<{ jobs: Job[] }>(db, "engine_jobs", { jobs: [] });
    // A job still "running" an hour after it started has lost its session (often the plan's usage limit): close it so it stops blocking a new scan.
    for (const j of st.jobs) if (j.status === "running" && Date.now() - new Date((j as Job & { started_at?: string }).started_at || j.requested_at).getTime() > 60 * 60000) { j.status = "error"; j.done_at = now; j.result = "Timed out: the session ended before it finished (often the Claude plan's usage limit). Scan again."; }
    if (b.action === "queue" && b.mode === "company" && !(b.company_name && b.company_name.length >= 2)) return NextResponse.json({ error: "Enter the company name." }, { status: 400 });
    if (b.action === "queue" && b.mode === "pitch") {
      // A free pitch plan for ONE existing company, written by a scheduled session and saved on the account
      const { data: co } = await db.from("companies").select("slug,company_name,country").eq("slug", b.slug || "").maybeSingle();
      if (!co) return NextResponse.json({ error: "Company not found." }, { status: 404 });
      if (!canSeeCountry(access, co.country)) return NextResponse.json({ error: "That company is outside your regions." }, { status: 403 });
      if (st.jobs.some((j) => j.mode === "pitch" && j.slug === co.slug && (j.status === "queued" || j.status === "running")))
        return NextResponse.json({ error: `A pitch plan for ${co.company_name} is already being written.` }, { status: 409 });
      const job: Job = { id, region: regionOf(co.country), count: 1, mode: "pitch", company_name: co.company_name, slug: co.slug, requested_by: user.email || "", requested_at: now, status: "queued" };
      st.jobs.unshift(job);
      trigger = await wake(job, st.jobs);
    } else if (b.action === "queue" && b.mode === "market") {
      // Market intelligence scan: partners of one vendor (or all four) in one region, and the customers they publish.
      const vendors = vendorList((await getSetting<{ custom?: string[] }>(db, VENDORS_KEY, {})).custom);
      const vendor = vendors.includes(b.vendor || "") ? (b.vendor as string) : "all";
      const customer = b.customer || "", partner = b.partner || "";
      if (b.phase !== "customers" && st.jobs.some((j) => j.mode === "market" && (j.status === "queued" || j.status === "running") && j.region === b.region && (j.vendor || "all") === vendor && (j.customer || "") === customer && (j.partner || "") === partner && !!j.contacts_only === !!b.contacts_only && (j.phase || "") === (b.phase || "")))
        return NextResponse.json({ error: customer ? `Contacts for ${customer} are already being searched.` : partner ? `${partner} is already being searched for more customers.` : `A ${vendor === "all" ? "market" : vendor} scan for ${b.region} is already waiting.` }, { status: 409 });
      const job: Job = { id, region: b.region, count: 1, mode: "market", vendor, ...(customer || partner ? { ...(customer ? { customer } : {}), partner } : {}), ...(b.contacts_only ? { contacts_only: true } : {}), ...(b.phase ? { phase: b.phase } : {}), requested_by: user.email || "", requested_at: now, status: "queued" };
      st.jobs.unshift(job);
      trigger = await wake(job, st.jobs);
    } else if (b.action === "queue" && b.mode === "signals") {
      // Buying signals scan: one company (slug) or a region sweep (tenders plus the next companies due a scan).
      let name = "", region = b.region, slug = "", site = "";
      if (b.slug) {
        const { data: co } = await db.from("companies").select("slug,company_name,country,domain,company_website").eq("slug", b.slug).maybeSingle();
        if (!co) return NextResponse.json({ error: "Company not found." }, { status: 404 });
        if (!canSeeCountry(access, co.country)) return NextResponse.json({ error: "That company is outside your regions." }, { status: 403 });
        name = co.company_name; slug = co.slug; region = regionOf(co.country); site = co.company_website || co.domain || "";
      }
      if (st.jobs.some((j) => j.mode === "signals" && (j.status === "queued" || j.status === "running") && (slug ? j.slug === slug : !j.slug && j.region === region && (j.lane || "") === (b.lane || ""))))
        return NextResponse.json({ error: slug ? `${name} is already being scanned.` : `A ${region} scan is already waiting.` }, { status: 409 });
      const job: Job = { id, region, count: slug ? 1 : typeof b.count === "number" ? Math.min(b.count, 30) : 10, mode: "signals", ...(b.lane ? { lane: b.lane } : {}), ...(slug ? { company_name: name, slug, website: site } : {}),
        requested_by: user.email || "", requested_at: now, status: "queued" };
      st.jobs.unshift(job);
      trigger = await wake(job, st.jobs);
    } else if (b.action === "queue" && b.mode === "contacts") {
      // Find contacts: a free job for ONE existing company. The company is looked up here, so its region and domain can't be spoofed.
      const { data: co } = await db.from("companies").select("slug,company_name,country,domain,company_website").eq("slug", b.slug || "").maybeSingle();
      if (!co) return NextResponse.json({ error: "Company not found." }, { status: 404 });
      if (!canSeeCountry(access, co.country)) return NextResponse.json({ error: "That company is outside your regions." }, { status: 403 });
      if (st.jobs.some((j) => j.mode === "contacts" && j.slug === co.slug && (j.status === "queued" || j.status === "running")))
        return NextResponse.json({ error: `Contacts for ${co.company_name} are already being searched.` }, { status: 409 });
      const job: Job = { id, region: regionOf(co.country), count: 1, mode: "contacts", company_name: co.company_name, slug: co.slug, ...(b.seamless ? { seamless: true } : {}), website: co.company_website || co.domain || "",
        requested_by: user.email || "", requested_at: now, status: "queued" };
      st.jobs.unshift(job);
      trigger = await wake(job, st.jobs);
    } else if (b.action === "queue") {
      const names = b.mode === "discover" ? (b.company_names || []).filter((n) => n.length >= 2) : [];
      const job: Job = { id, region: b.region, count: b.mode === "company" ? 1 : names.length ? names.length : b.count, mode: b.mode,
        ...(b.mode === "company" ? { company_name: b.company_name, website: b.website || "" } : {}), ...(names.length ? { company_names: names } : {}),
        requested_by: user.email || "", requested_at: now, status: "queued" };
      st.jobs.unshift(job);
      trigger = await wake(job, st.jobs);
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
  return NextResponse.json({ ...(await summary(db)), ...(trigger ? { trigger } : {}) });
}
