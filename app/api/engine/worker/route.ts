import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { invalidateAllData } from "@/lib/dataCache";
import { statusPatch, applyRevenueResult } from "@/lib/icpStatus.mjs";
import { normalizeDefinition, rulesFor, regionOf, summarizeRules } from "@/lib/icpDefinition.mjs";

// Limited API for scheduled Claude sessions (no Supabase key needed in the cloud environment).
// Auth: "Authorization: Bearer <ENGINE_TOKEN>"; only the SHA-256 hash is stored (settings.engine_token). Revoke/regenerate in Settings.
// Allowed: read the ICP definition, claim/finish queued jobs, read the verification queue, submit revenue results, add discovered companies, post a notification.
// Not allowed: reading contacts, deleting anything, or any other table access.
export const maxDuration = 60;
type Db = ReturnType<typeof supabaseAdmin>;
const sha = (t: string) => createHash("sha256").update(t).digest("hex");

async function authorised(db: Db, req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (token.length < 32) return false;
  const { data } = await db.from("settings").select("value").eq("key", "engine_token").maybeSingle();
  const hash = (data?.value as { hash?: string } | null)?.hash;
  if (!hash) return false;
  const a = Buffer.from(sha(token)), b = Buffer.from(hash);
  return a.length === b.length && timingSafeEqual(a, b);
}
const get = async <T,>(db: Db, key: string, fb: T): Promise<T> => ((await db.from("settings").select("value").eq("key", key).maybeSingle()).data?.value as T) ?? fb;
const put = (db: Db, key: string, value: unknown) => db.from("settings").upsert({ key, value, updated_at: new Date().toISOString() });

const Result = z.object({ slug: z.string(), company_name: z.string(), checked_at: z.string(), listing_status: z.string(), exchange: z.string().optional().default(""),
  ticker: z.string().optional().default(""), parent_company: z.string().optional().default(""), net_revenue_usd_m: z.number().nullable(), fiscal_year: z.string().optional().default(""),
  revenue_type: z.string(), revenue_local: z.string().optional().default(""), source_name: z.string().optional().default(""), source_url: z.string().optional().default(""),
  source_kind: z.string(), revenue_status: z.enum(["FACT", "LIKELY", "UNVERIFIED", "UNKNOWN"]), employees: z.string().optional().default(""),
  employees_source_url: z.string().optional().default(""), icp_verdict: z.enum(["Verified ICP", "Likely ICP", "Below minimum", "Below $250M", "Revenue not found"]), reasoning: z.string() });
const EntityType = z.enum(["Regional HQ", "Branch", "Foreign Branch", "Unknown"]).optional().default("Unknown");
const NewCo = z.object({ name: z.string().min(2), website: z.string().optional().default(""), country: z.string().default("UAE"), industry: z.string().optional().default(""), watch: z.boolean().optional().default(false),
  hq_city: z.string().optional().default(""), why_icp: z.string().optional().default(""), source_url: z.string().optional().default(""), entity_type: EntityType });
const NewCoUpload = z.object({ name: z.string().min(2), website: z.string().optional().default(""), country: z.string().default("UAE"), industry: z.string().optional().default(""),
  hq_city: z.string().optional().default(""), notes: z.string().optional().default("") });
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("claim") }),
  z.object({ action: z.literal("finish"), id: z.string(), status: z.enum(["done", "error"]), result: z.string().max(2000), slug: z.string().max(120).optional(),
    details: z.array(z.object({ name: z.string(), status: z.string().optional().default(""), revenue: z.string().optional().default(""), industry: z.string().optional().default(""),
      hq_city: z.string().optional().default(""), why_icp: z.string().optional().default(""), source_url: z.string().optional().default(""), country: z.string().optional().default(""),
      entity_type: EntityType })).max(60).optional() }),
  z.object({ action: z.literal("queue"), region: z.string().default("UAE"), limit: z.number().int().min(1).max(200).default(50) }),
  z.object({ action: z.literal("submit"), results: z.array(Result).max(50) }),
  z.object({ action: z.literal("add_companies"), companies: z.array(NewCo).max(50) }),
  z.object({ action: z.literal("hold_companies"), companies: z.array(NewCo).max(50) }),
  z.object({ action: z.literal("names") }),
  z.object({ action: z.literal("icp") }),
  z.object({ action: z.literal("uploads") }),
  z.object({ action: z.literal("finish_upload"), id: z.string(), status: z.enum(["done", "error"]), summary: z.string().max(1000) }),
  z.object({ action: z.literal("add_uploaded_companies"), filename: z.string(), companies: z.array(NewCoUpload).max(2000) }),
  z.object({ action: z.literal("watch"), slug: z.string().optional() }),
  z.object({ action: z.literal("log"), summary: z.string().max(1000), verified: z.number().int().min(0).default(0), new_companies: z.array(z.string()).max(100).default([]),
    details: z.array(z.object({ name: z.string(), status: z.string(), revenue: z.string().optional().default(""), region: z.string().optional(), entity_type: EntityType })).max(60).optional().default([]),
    source: z.enum(["daily", "instant"]).optional(), region: z.string().max(200).optional().default("") }),
]);
type Job = { id: string; status: string; started_at?: string; done_at?: string; result?: string; company_names?: string[];
  details?: { name: string; status?: string; revenue?: string; industry?: string; hq_city?: string; why_icp?: string; source_url?: string; country?: string; decided?: "added" | "ignored" }[] };
type PendingCo = { id: string; name: string; website?: string; country: string; region: string; industry?: string; hq_city?: string; why_icp?: string; source_url?: string; watch?: boolean; requested_at: string; entity_type?: "Regional HQ" | "Branch" | "Foreign Branch" | "Unknown" };

export async function POST(req: Request) {
  const db = supabaseAdmin();
  if (!(await authorised(db, req))) return NextResponse.json({ error: "Invalid or revoked engine token." }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request.", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });
  const b = parsed.data, now = new Date().toISOString();

  if (b.action === "claim" || b.action === "finish") {
    const st = await get<{ jobs: Job[] }>(db, "engine_jobs", { jobs: [] });
    if (b.action === "claim") {
      const job = [...st.jobs].reverse().find((j) => j.status === "queued");
      if (!job) return NextResponse.json({ job: null });
      job.status = "running"; job.started_at = now; await put(db, "engine_jobs", st);
      return NextResponse.json({ job });
    }
    const job = st.jobs.find((j) => j.id === b.id);
    if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
    job.status = b.status; job.done_at = now; job.result = b.result; if (b.slug) (job as Job & { slug?: string }).slug = b.slug;
    if (b.details) (job as Job & { details?: unknown }).details = b.details;
    await put(db, "engine_jobs", st);
    return NextResponse.json({ ok: true });
  }
  const icpDef = normalizeDefinition((await db.from("settings").select("value").eq("key", "icp_definition").maybeSingle()).data?.value);
  if (b.action === "icp") {
    // The ICP definition the session must follow (Setup → Define ICP): every region's rules, which regions are active and their daily run.
    const active = Object.entries(icpDef.regions).filter(([, r]) => r.status === "active").map(([k, r]) => ({ region: k, discover_per_day: r.engine.discover_per_day, verify_per_day: r.engine.verify_per_day }));
    return NextResponse.json({ updated_at: icpDef.updated_at, updated_by: icpDef.updated_by, active, summary: Object.entries(icpDef.regions).map(([k, r]) => summarizeRules(k, r)), regions: icpDef.regions });
  }
  if (b.action === "queue") {
    const { data } = await db.from("companies").select("slug,company_name,company_website,domain,industry,country,icp_status,profile")
      .in("country", [b.region, ...(regionOf(b.region) === b.region ? [] : [regionOf(b.region)])]).in("icp_status", ["ICP — Needs check", "Unknown", "ICP — Likely", "Not ICP"]);
    // Re-check: any company that isn't Verified is checked again N days after its last revenue check (N from Define ICP; default 180).
    const days = rulesFor(icpDef, b.region).evidence.recheck_days; // re-check interval from Define ICP
    const stale = (c: { profile?: Record<string, { at?: string }> }) => { const at = c.profile?.["Revenue check"]?.at; return !!at && Date.now() - new Date(at).getTime() > days * 864e5; };
    const rank: Record<string, number> = { "ICP — Needs check": 0, Unknown: 1, "ICP — Likely": 2 };
    const size = (c: { profile?: Record<string, { "Size (USD m)"?: number; revenue_range?: string; employee_count?: string }> }) =>
      Number(c.profile?.["Vipin-Profiling"]?.["Size (USD m)"]) || (c.profile?.["Seamless discovery"]?.revenue_range === "$1B+" ? 1000 : c.profile?.["Seamless discovery"] ? 500 : 0);
    const first = (data || []).filter((c) => !c.profile?.["Revenue check"] && c.icp_status !== "Not ICP").sort((x, y) => rank[x.icp_status] - rank[y.icp_status] || size(y) - size(x));
    const again = (data || []).filter(stale).sort((x, y) => size(y) - size(x));
    const q = [...first, ...again].slice(0, b.limit)
      .map((c) => ({ slug: c.slug, company_name: c.company_name, website: c.company_website || c.domain || "", industry: c.industry || "", current_status: c.icp_status,
        recheck: !!c.profile?.["Revenue check"] }));
    return NextResponse.json({ queue: q });
  }
  if (b.action === "submit") {
    const out: string[] = [];
    for (const r of b.results) {
      const { data: c } = await db.from("companies").select("*").eq("slug", r.slug).maybeSingle();
      if (!c) { out.push(`${r.slug}: not found`); continue; }
      const applied = await applyRevenueResult(db, c, r);
      const { status, patch } = statusPatch(applied, rulesFor(icpDef, applied.country));
      await db.from("companies").update(patch).eq("id", c.id);
      out.push(`${r.company_name}: ${status}`);
    }
    invalidateAllData();
    return NextResponse.json({ applied: out });
  }
  if (b.action === "watch") {
    // Watch list: companies requested one by one (Settings → Add one specific company) are re-checked weekly, in any region,
    // until an official (FACT) revenue figure is found. With a slug: add that existing company to the watch list.
    if (b.slug) {
      const { data: c } = await db.from("companies").select("id,profile").eq("slug", b.slug).maybeSingle();
      if (!c) return NextResponse.json({ error: "Company not found." }, { status: 404 });
      await db.from("companies").update({ profile: { ...(c.profile || {}), Watch: { since: now, reason: "requested in Settings" } } }).eq("id", c.id);
      return NextResponse.json({ ok: true });
    }
    const { data } = await db.from("companies").select("slug,company_name,company_website,domain,industry,country,icp_status,verified_revenue_status,profile").not("profile->Watch", "is", null);
    const due = (data || []).filter((c) => c.verified_revenue_status !== "FACT")
      .filter((c) => { const at = c.profile?.["Revenue check"]?.at; return !at || Date.now() - new Date(at).getTime() > 7 * 864e5; })
      .map((c) => ({ slug: c.slug, company_name: c.company_name, website: c.company_website || c.domain || "", industry: c.industry || "", country: c.country, current_status: c.icp_status, recheck: true }));
    return NextResponse.json({ queue: due });
  }
  if (b.action === "names") {
    // Existing company names and domains, so a session can skip them before searching (no contacts, nothing else)
    const { data } = await db.from("companies").select("company_name,domain,country,profile");
    return NextResponse.json({ companies: (data || []).flatMap((c) => [{ name: c.company_name, domain: c.domain || "", country: c.country || "" },
      ...aliases(c).map((a) => ({ ...a, country: c.country || "", merged_into: c.company_name }))]) });
  }
  if (b.action === "uploads") {
    // Excel lists uploaded from the Setup Wizard's "Add Data" step, waiting to be read and imported.
    const st = await get<{ items: { id: string; filename: string; region: string; path: string; status: string }[] }>(db, "uploaded_lists", { items: [] });
    const waiting = st.items.filter((x) => x.status === "waiting");
    const withUrls = await Promise.all(waiting.map(async (x) => {
      const { data } = await db.storage.from("uploads").createSignedUrl(x.path, 3600);
      return { id: x.id, filename: x.filename, region: x.region, url: data?.signedUrl || null };
    }));
    return NextResponse.json({ uploads: withUrls.filter((x) => x.url) });
  }
  if (b.action === "finish_upload") {
    const st = await get<{ items: { id: string; status: string; processed_at?: string; summary?: string }[] }>(db, "uploaded_lists", { items: [] });
    const item = st.items.find((x) => x.id === b.id);
    if (!item) return NextResponse.json({ error: "Upload not found." }, { status: 404 });
    item.status = b.status; item.processed_at = now; item.summary = b.summary;
    await put(db, "uploaded_lists", st);
    invalidateAllData();
    return NextResponse.json({ ok: true });
  }
  if (b.action === "add_companies") {
    const { data: have } = await db.from("companies").select("company_name,domain,profile");
    const day = now.slice(0, 10);
    const added: { slug: string; company_name: string }[] = [], skipped: { name: string; matches: string }[] = [];
    const pool = existingPool(have || []);
    for (const c of b.companies) {
      const hit = pool.find((x) => sameCompany(c.name, c.website, x.name, x.domain));
      if (hit) { skipped.push({ name: c.name, matches: hit.as }); continue; }
      const row = {
        slug: "cd-" + c.name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60), company_name: c.name, country: c.country,
        company_website: c.website || null, domain: dom(c.website) || null, hq_city: c.hq_city || null, industry: c.industry || null, research_channel: "Claude discovery",
        lists: ["Claude discovery"], icp_status: "Unknown", entity_type: c.entity_type || "Unknown", account_notes: `Found by a scheduled Claude session on ${day}: ${c.why_icp} Source: ${c.source_url}`,
        profile: { "Claude discovery": { why: c.why_icp, source_url: c.source_url, via: "scheduled session (no API cost)" }, ...(c.watch ? { Watch: { since: now, reason: "requested in Settings" } } : {}) } };
      const { error } = await db.from("companies").upsert([row], { onConflict: "slug", ignoreDuplicates: true });
      if (!error) { added.push({ slug: row.slug, company_name: row.company_name }); pool.push({ name: row.company_name, domain: row.domain || "", as: row.company_name }); }
    }
    invalidateAllData();
    return NextResponse.json({ added, skipped: skipped.length, skipped_detail: skipped });
  }
  if (b.action === "add_uploaded_companies") {
    // The user's own spreadsheet, uploaded from the Setup Wizard's "Add Data" step — kept as-is like any reference
    // list (channel "User"), never mislabeled as something the Agent found on its own.
    const { data: have } = await db.from("companies").select("company_name,domain,profile");
    const day = now.slice(0, 10);
    const added: { slug: string; company_name: string }[] = [], skipped: { name: string; matches: string }[] = [];
    const pool = existingPool(have || []);
    for (const c of b.companies) {
      const hit = pool.find((x) => sameCompany(c.name, c.website, x.name, x.domain));
      if (hit) { skipped.push({ name: c.name, matches: hit.as }); continue; }
      const row = {
        slug: "cd-" + c.name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60), company_name: c.name, country: c.country,
        company_website: c.website || null, domain: dom(c.website) || null, hq_city: c.hq_city || null, industry: c.industry || null, research_channel: "User",
        lists: [`User upload: ${b.filename}`], icp_status: "Unknown", account_notes: `From "${b.filename}", uploaded via Setup Wizard on ${day}.${c.notes ? ` Notes: ${c.notes}` : ""}`,
        profile: { "User upload": { filename: b.filename, notes: c.notes || "", at: now } } };
      const { error } = await db.from("companies").upsert([row], { onConflict: "slug", ignoreDuplicates: true });
      if (!error) { added.push({ slug: row.slug, company_name: row.company_name }); pool.push({ name: row.company_name, domain: row.domain || "", as: row.company_name }); }
    }
    invalidateAllData();
    return NextResponse.json({ added, skipped: skipped.length, skipped_detail: skipped });
  }
  if (b.action === "hold_companies") {
    // A discovered/requested company whose real country's region isn't Active yet: keep it queued (not added as a live
    // account) in settings.engine_pending until a Super Admin activates that region — surfaced as a banner in the app.
    const { data: have } = await db.from("companies").select("company_name,domain,profile");
    const pool = existingPool(have || []);
    const st = await get<{ items: PendingCo[] }>(db, "engine_pending", { items: [] });
    for (const p of st.items) pool.push({ name: p.name, domain: dom(p.website || ""), as: p.name });
    const held: { name: string; region: string }[] = [], skipped: { name: string; matches: string }[] = [];
    for (const c of b.companies) {
      const hit = pool.find((x) => sameCompany(c.name, c.website, x.name, x.domain));
      if (hit) { skipped.push({ name: c.name, matches: hit.as }); continue; }
      const region = regionOf(c.country);
      const item: PendingCo = { id: crypto.randomUUID().slice(0, 8), name: c.name, website: c.website, country: c.country, region, industry: c.industry,
        hq_city: c.hq_city, why_icp: c.why_icp, source_url: c.source_url, watch: c.watch, requested_at: now, entity_type: c.entity_type };
      st.items.unshift(item); held.push({ name: c.name, region }); pool.push({ name: c.name, domain: dom(c.website), as: c.name });
    }
    await put(db, "engine_pending", { items: st.items.slice(0, 200) });
    return NextResponse.json({ held, skipped: skipped.length, skipped_detail: skipped });
  }
  // log → bell notification
  const l = await get<{ entries: unknown[] }>(db, "engine_log", { entries: [] });
  l.entries.unshift({ at: now, summary: b.summary, verified: b.verified, new_companies: b.new_companies, details: b.details, source: b.source, region: b.region });
  await put(db, "engine_log", { entries: l.entries.slice(0, 60) });
  return NextResponse.json({ ok: true });
}

// ---- duplicate detection for discovered companies ----
/** Names and domains of companies merged into this one (profile["Merged companies"]). */
function aliases(c: Record<string, unknown>): { name: string; domain: string }[] {
  const m = (c.profile as Record<string, unknown> | null)?.["Merged companies"];
  return Array.isArray(m) ? m.map((x: { name?: string; domain?: string; website?: string }) => ({ name: String(x.name || ""), domain: String(x.domain || x.website || "") })).filter((x) => x.name) : [];
}
const dom = (w: string) => String(w || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
/** Existing companies (and their merged aliases) as a flat {name,domain,as} pool for dedupe checks. */
function existingPool(have: { company_name: string; domain?: string | null; profile?: Record<string, unknown> | null }[]) {
  return have.flatMap((c) => [{ name: c.company_name, domain: c.domain || "" },
    ...aliases(c as Record<string, unknown>).map((a) => ({ name: c.company_name, domain: a.domain, alias: a.name }))])
    .flatMap((x) => ("alias" in x ? [{ name: x.alias as string, domain: x.domain, as: x.name }] : [{ ...x, as: x.name }]));
}
/** Domain label without TLD and generic suffixes: asgcgroup.com → asgc, alfaraagroup.com → alfaraa */
const domRoot = (d: string) => dom(d).split(".")[0].replace(/(group|holding|holdings|intl|international|uae|me|global|co)$/g, "");
const GENERIC = /\b(pjsc|psc|plc|llc|l l c|fze|fzco|fzc|group|groups|holding|holdings|company|companies|co|the|of|and|international|enterprises|general|contracting|construction|industrial|engineering|civil|trading|investment|investments|services|uae|emirates)\b/g;
const core = (n: string) => n.toLowerCase().replace(/&/g, " and ").replace(/\(.*?\)/g, " ").replace(/[\'’]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(GENERIC, " ").replace(/\s+/g, "");
const acronym = (n: string) => (n.match(/\(([A-Za-z]{2,8})\)/)?.[1] || "").toLowerCase();
// Words too common to identify a company on their own (a core equal to one of these never matches by prefix)
const WEAK = new Set(["dubai", "abudhabi", "sharjah", "ajman", "emirates", "emirati", "gulf", "arabian", "arabia", "national", "united", "first", "royal", "al", "middleeast", "global", "golden", "star", "new", "modern", "commercial", "commercialbank", "islamicbank", "nationalbank"]);
function sameCompany(aName: string, aWeb: string, bName: string, bDom: string) {
  const ad = dom(aWeb), bd = dom(bDom);
  if (ad && bd && ad === bd) return true;
  const ar = domRoot(ad), br = domRoot(bd);
  if (ar.length >= 4 && !WEAK.has(ar) && ar === br) return true;
  const ac = core(aName), bc = core(bName);
  if (ac.length >= 3 && ac === bc && !WEAK.has(ac)) return true;
  // one name is the other plus extra words (group vs its main company), e.g. "khansaheb" / "khansahebcivil…"
  const [short, long] = ac.length <= bc.length ? [ac, bc] : [bc, ac];
  if (short.length >= 5 && !WEAK.has(short) && long.startsWith(short)) return true;
  const aa = acronym(aName), ba = acronym(bName);
  if (aa && bc && (aa === bc || aa === br || aa === ba)) return true;
  if (ba && ac && (ba === ac || ba === ar)) return true;
  if (ar.length >= 4 && !WEAK.has(ar) && ar === bc) return true;
  if (br.length >= 4 && !WEAK.has(br) && br === ac) return true;
  return false;
}
