import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { invalidateAllData } from "@/lib/dataCache";
import { statusPatch, applyRevenueResult } from "@/lib/icpStatus.mjs";
import { normalizeDefinition, rulesFor, regionOf, canonCountry, summarizeRules, effectiveEngine, PRIORITY_ORDER } from "@/lib/icpDefinition.mjs";
import { EMPTY_STORE, type Signal, type SignalStore } from "@/lib/signals";
import { nk as marketNk, partnerId } from "@/lib/marketServer";
import { pitchFacts } from "@/lib/pitchFacts";
import { presenceOk, vendorList, VENDORS_KEY, marketKey, type MarketDoc, type MContact, type Partner, type PCustomer } from "@/lib/market";

// Limited API for scheduled Claude sessions (no Supabase key needed in the cloud environment).
// Auth: "Authorization: Bearer <ENGINE_TOKEN>"; only the SHA-256 hash is stored (settings.engine_token). Revoke/regenerate in Settings.
// Allowed: read the ICP definition, claim/finish queued jobs, read the verification queue, submit revenue results, add discovered companies, post a notification.
// Also allowed: add_contacts (new people found on the public web for ONE company; written only after server-side checks, never read back).
// Also allowed: signal_targets / add_signals (buying signals: tenders, ERP and S2P intent, ECC to S/4HANA; stored in settings.buying_signals).
// Also allowed: market_targets / add_market (SAP, Coupa, Oracle and Microsoft partners and their published customers; stored in settings market_intel:<vendor>:<region>).
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

// Enrichment: the research that makes an account show up in Priority accounts and the Pipeline (ERP, existing S2P platform, S2P signal level). Only empty fields are filled; reference and user rows are never touched.
const Enrich = z.object({ slug: z.string().trim().min(2).max(120), erp: z.string().trim().max(120).optional().default(""), erp_status: z.enum(["FACT", "LIKELY", "UNVERIFIED", "UNKNOWN"]).optional().default("UNKNOWN"), erp_evidence: z.string().trim().max(500).optional().default(""),
  existing_s2p_product: z.enum(["Coupa", "SAP Ariba", "Other S2P", "No Evidence", "Unknown"]).optional().default("Unknown"), s2p_platform_status: z.string().trim().max(60).optional().default(""), existing_s2p_detail: z.string().trim().max(400).optional().default(""),
  s2p_signal_level: z.enum(["VERY STRONG SIGNAL", "STRONG SIGNAL", "MODERATE SIGNAL", "WEAK SIGNAL", "NO SIGNAL", "CONFLICTING SIGNAL"]).optional().default("NO SIGNAL"), s2p_strong_signals: z.string().trim().max(600).optional().default(""),
  known_implementation_partner: z.string().trim().max(160).optional().default(""), source_url: z.string().url().max(600).or(z.literal("")).optional().default("") });
const Result = z.object({ slug: z.string(), company_name: z.string(), checked_at: z.string(), listing_status: z.string(), exchange: z.string().optional().default(""),
  ticker: z.string().optional().default(""), parent_company: z.string().optional().default(""), net_revenue_usd_m: z.number().nullable(), fiscal_year: z.string().optional().default(""),
  revenue_type: z.string(), revenue_local: z.string().optional().default(""), source_name: z.string().optional().default(""), source_url: z.string().optional().default(""),
  source_kind: z.string(), revenue_status: z.enum(["FACT", "LIKELY", "UNVERIFIED", "UNKNOWN"]), employees: z.string().optional().default(""),
  employees_source_url: z.string().optional().default(""), icp_verdict: z.enum(["Verified ICP", "Likely ICP", "Below minimum", "Below $250M", "Revenue not found"]), reasoning: z.string() });
const EntityType = z.enum(["Regional HQ", "Branch", "Foreign Branch", "Unknown"]).optional().default("Unknown");
const NewCo = z.object({ name: z.string().min(2), website: z.string().optional().default(""), country: z.string().default("UAE").transform((v) => canonCountry(v)), industry: z.string().optional().default(""), watch: z.boolean().optional().default(false),
  hq_city: z.string().optional().default(""), why_icp: z.string().optional().default(""), source_url: z.string().optional().default(""), entity_type: EntityType,
  user_platform: z.enum(["Coupa", "SAP Ariba", "Jaggaer", "Ivalua", "GEP", "Zycus", "Oracle Procurement", "Other S2P"]).optional(), focus: z.string().trim().max(160).optional() }); // set when the user who asked for the company said it already uses that platform
const NewCoUpload = z.object({ name: z.string().min(2), website: z.string().optional().default(""), country: z.string().optional().default("").transform((v) => (v.trim() ? canonCountry(v) : "")), industry: z.string().optional().default(""),
  hq_city: z.string().optional().default(""), notes: z.string().optional().default("") });
const NewContact = z.object({ full_name: z.string().trim().min(3).max(120), title_verbatim: z.string().trim().min(2).max(200),
  email: z.string().trim().max(160).optional().default(""), phone: z.string().trim().max(40).optional().default(""), phone_type: z.enum(["Direct", "Mobile", "Switchboard", ""]).optional().default(""),
  linkedin_url: z.string().trim().max(240).optional().default(""), via: z.enum(["web", "seamless"]).optional().default("web"), seamless_id: z.string().trim().max(40).optional().default(""),
  source_url: z.string().trim().max(500).optional().default(""), source_note: z.string().trim().max(400).optional().default("") })
  .refine((c) => (c.via === "seamless" ? !!c.seamless_id : /^https?:\/\//.test(c.source_url)), { message: "A public-web contact needs source_url; a Seamless contact needs seamless_id." });
const GENERIC_LOCAL = /^(info|sales|contact|contacts|admin|hello|hi|support|office|enquiries|enquiry|inquiries|inquiry|mail|service|services|help|hr|careers|jobs|recruitment|procurement|purchasing|accounts|finance|marketing|media|press|pr|customercare|customer\.care|reception|webmaster|noreply|no-reply|team)$/i;
const PERSONAL = /(^|\.)(gmail|googlemail|yahoo|hotmail|outlook|live|msn|icloud|aol|proton|protonmail|gmx|mail|yandex|zoho)\./i;
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).optional().default("");
const Url = z.string().url().max(600);
const NewSignal = z.object({ lane: z.enum(["erp", "rfp", "ecc"]), strength: z.enum(["Hot", "Warm", "Watch"]), label: z.enum(["FACT", "LIKELY", "UNVERIFIED"]),
  company_name: z.string().trim().min(2).max(160), slug: z.string().trim().max(120).optional().default(""), region: z.string().trim().min(2).max(40),
  title: z.string().trim().min(5).max(200), evidence: z.string().trim().min(10).max(700), why: z.string().trim().max(300).optional().default(""),
  source_name: z.string().trim().max(120).optional().default(""), source_url: Url, doc_url: Url.or(z.literal("")).optional().default(""), needs_login: z.boolean().optional().default(false),
  published: Day, closes: Day });
const MContactIn = z.object({ name: z.string().trim().min(3).max(120), title: z.string().trim().max(200).optional().default(""), email: z.string().trim().max(160).optional().default(""),
  phone: z.string().trim().max(40).optional().default(""), linkedin_url: z.string().trim().max(240).optional().default(""), source_url: Url });
const MPartnerIn = z.object({ name: z.string().trim().min(2).max(140), website: z.string().trim().max(200).optional().default(""), tier: z.string().trim().max(80).optional().default(""),
  services: z.string().trim().max(300).optional().default(""), hq_city: z.string().trim().max(80).optional().default(""), hq_country: z.string().trim().max(60).optional().default(""), branch: z.boolean().optional().default(false), office_address: z.string().trim().max(300).optional().default(""), office_source: z.string().trim().max(500).optional().default(""), scope_note: z.string().trim().max(300).optional().default(""), branch_source: z.string().trim().max(500).optional().default(""), source_url: Url, label: z.enum(["FACT", "LIKELY"]).optional().default("FACT"),
  contacts: z.array(MContactIn).max(3).optional().default([]) });
const MCustomerIn = z.object({ partner: z.string().trim().min(2).max(140), customer: z.string().trim().min(2).max(160), customer_website: z.string().trim().max(200).optional().default(""),
  project: z.string().trim().max(240).optional().default(""), source_url: Url, published: Day, contacts: z.array(MContactIn).max(3).optional().default([]) });
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
  z.object({ action: z.literal("add_contacts"), slug: z.string().min(2).max(120), contacts: z.array(NewContact).max(25) }),
  z.object({ action: z.literal("enrich_queue"), region: z.string().default("UAE"), limit: z.number().int().min(1).max(30).default(10) }),
  z.object({ action: z.literal("enrich"), companies: z.array(Enrich).max(40) }),
  z.object({ action: z.literal("signal_targets"), region: z.string().default("UAE"), limit: z.number().int().min(1).max(30).default(10) }),
  z.object({ action: z.literal("add_signals"), scanned: z.array(z.string().max(120)).max(40).optional().default([]), sweep_region: z.string().max(40).optional().default(""), signals: z.array(NewSignal).max(40) }),
  z.object({ action: z.literal("market_targets"), limit: z.number().int().min(1).max(12).default(4), vendor: z.string().max(30).optional().default(""), region: z.string().max(40).optional().default("") }),
  z.object({ action: z.literal("add_market"), vendor: z.string().trim().min(2).max(30), region: z.string().min(2).max(40), partners: z.array(MPartnerIn).max(40).optional().default([]), customers: z.array(MCustomerIn).max(120).optional().default([]), checked_partners: z.array(z.string().trim().max(140)).max(60).optional().default([]) }),
  z.object({ action: z.literal("pitch_facts"), slug: z.string().min(2).max(120) }),
  z.object({ action: z.literal("save_pitch"), slug: z.string().min(2).max(120), text: z.string().min(60).max(9000) }),
  z.object({ action: z.literal("names") }),
  z.object({ action: z.literal("icp") }),
  z.object({ action: z.literal("uploads") }),
  z.object({ action: z.literal("finish_upload"), id: z.string(), status: z.enum(["done", "error"]), summary: z.string().max(1000) }),
  z.object({ action: z.literal("add_uploaded_companies"), filename: z.string(), upload_id: z.string().optional(), companies: z.array(NewCoUpload).max(2000) }),
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
    // Counts are the Define ICP counts times the region's priority share (high 1, medium 1/2, low 1/4), and the regions come High first, so a short session cuts Low first.
    const active = Object.entries(icpDef.regions).filter(([, r]) => r.status === "active").map(([k, r]) => { const e = effectiveEngine(r);
      return { region: k, priority: e.priority, market: !!r.market, discover_per_day: e.discover_per_day, verify_per_day: e.verify_per_day, set_discover_per_day: r.engine.discover_per_day, set_verify_per_day: r.engine.verify_per_day }; })
      .sort((x, y) => PRIORITY_ORDER.indexOf(x.priority) - PRIORITY_ORDER.indexOf(y.priority));
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
  if (b.action === "enrich_queue") {
    // Verified or Likely accounts of a region that were never enriched, Verified first and the largest first. Reference and user rows and existing Coupa customers are left out.
    const { data } = await db.from("companies").select("slug,company_name,company_website,domain,industry,country,icp_status,verified_revenue_usd_m,existing_s2p_product,research_channel,profile").in("icp_status", ["ICP — Verified", "ICP — Likely"]);
    const due = (data || []).filter((c) => regionOf(c.country) === b.region && !["Reference", "User"].includes(String(c.research_channel || "")) && !/coupa/i.test(String(c.existing_s2p_product || "")) && !c.profile?.Enrichment);
    due.sort((x, y) => (x.icp_status === y.icp_status ? 0 : x.icp_status === "ICP — Verified" ? -1 : 1) || Number(y.verified_revenue_usd_m || 0) - Number(x.verified_revenue_usd_m || 0));
    return NextResponse.json({ remaining: due.length, companies: due.slice(0, b.limit).map((c) => ({ slug: c.slug, name: c.company_name, domain: c.domain || "", website: c.company_website || "", industry: c.industry || "", country: c.country, icp_status: c.icp_status })) });
  }
  if (b.action === "enrich") {
    const out: string[] = [], today = now.slice(0, 10), isDefault = (v: unknown, ...d: string[]) => !v || d.includes(String(v));
    for (const r of b.companies) {
      const { data: c } = await db.from("companies").select("id,company_name,research_channel,erp,existing_s2p_product,s2p_signal_level,existing_s2p_detail,known_implementation_partner,profile").eq("slug", r.slug).maybeSingle();
      if (!c) { out.push(`${r.slug}: not found`); continue; }
      if (["Reference", "User"].includes(String(c.research_channel || ""))) { out.push(`${c.company_name}: skipped (reference record)`); continue; }
      const src = r.source_url ? ` Source: ${r.source_url}` : "", noSource = !r.source_url; // strong claims need a source: without one they are capped
      const level = noSource && /STRONG/.test(r.s2p_signal_level) ? "MODERATE SIGNAL" : r.s2p_signal_level, erpStatus = noSource && r.erp_status === "FACT" ? "LIKELY" : r.erp_status;
      const patch: Record<string, unknown> = { last_researched: today }, done: string[] = [];
      if (isDefault(c.erp) && r.erp) { Object.assign(patch, { erp: r.erp, erp_status: erpStatus, erp_evidence: (r.erp_evidence + src).trim() }); done.push(`ERP ${r.erp}`); }
      if (isDefault(c.existing_s2p_product, "Unknown") && r.existing_s2p_product !== "Unknown") { Object.assign(patch, { existing_s2p_product: r.existing_s2p_product, s2p_platform_status: r.s2p_platform_status || (r.existing_s2p_product === "No Evidence" ? "No Evidence" : "Unknown") }); if (r.existing_s2p_detail && isDefault(c.existing_s2p_detail)) patch.existing_s2p_detail = (r.existing_s2p_detail + src).trim(); done.push(`S2P ${r.existing_s2p_product}`); }
      if (isDefault(c.s2p_signal_level, "NO SIGNAL") && level !== "NO SIGNAL") { Object.assign(patch, { s2p_signal_level: level, s2p_strong_signals: (r.s2p_strong_signals + src).trim() }); done.push(level.toLowerCase()); }
      if (r.known_implementation_partner && isDefault(c.known_implementation_partner)) patch.known_implementation_partner = r.known_implementation_partner;
      patch.profile = { ...(c.profile || {}), Enrichment: { at: now, source_url: r.source_url || null, found: done } };
      await db.from("companies").update(patch).eq("id", c.id);
      out.push(`${c.company_name}: ${done.length ? done.join(", ") : "searched, nothing found"}`);
    }
    invalidateAllData();
    return NextResponse.json({ applied: out });
  }
  if (b.action === "add_contacts") {
    // People found on the public web by a free session. New rows only (channel "Claude"); a Claude-owned row may get empty fields filled; reference rows are never touched.
    const { data: co } = await db.from("companies").select("id,company_name,domain").eq("slug", b.slug).maybeSingle();
    if (!co) return NextResponse.json({ error: "Company not found." }, { status: 404 });
    const cdom = String(co.domain || "").toLowerCase().replace(/^www\./, "");
    const { data: have } = await db.from("contacts").select("id,full_name,email,phone,linkedin_url,channel_state,claude_check").eq("company_id", co.id);
    const key = (n: string) => n.toLowerCase().normalize("NFKD").replace(/[^a-z]+/g, " ").trim();
    const added: string[] = [], updated: string[] = [], skipped: { name: string; why: string }[] = [], dropped: string[] = [];
    for (const c of b.contacts) {
      const notes: string[] = [];
      let email = c.email.toLowerCase(), phone = c.phone, linkedin = c.linkedin_url;
      if (email) {
        const [local, host = ""] = email.split("@"); const h = host.replace(/^www\./, "");
        if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(email) || GENERIC_LOCAL.test(local) || PERSONAL.test(h) || !cdom || !(h === cdom || h.endsWith("." + cdom))) { dropped.push(`${c.full_name}: email ${email} (not a named address on ${cdom || "the company domain"})`); email = ""; }
      }
      if (phone && !/^\+?[\d\s().-]{7,24}$/.test(phone)) { dropped.push(`${c.full_name}: phone ${phone} (format)`); phone = ""; }
      if (linkedin) {
        const m = linkedin.match(/^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/([^/?#\s]+)/i);
        if (!m) { dropped.push(`${c.full_name}: LinkedIn ${linkedin} (not a profile URL)`); linkedin = ""; } else linkedin = `https://www.linkedin.com/in/${m[2]}`;
      }
      if (!email && !phone && !linkedin) { skipped.push({ name: c.full_name, why: "no usable email, phone or LinkedIn" }); continue; }
      const same = (have || []).find((x) => key(x.full_name) === key(c.full_name) || (email && x.email?.toLowerCase() === email) || (linkedin && x.linkedin_url?.toLowerCase().replace(/\/$/, "") === linkedin.toLowerCase()));
      if (same) {
        const fill: Record<string, unknown> = {};
        if (same.channel_state === "Claude") {
          if (email && !same.email) Object.assign(fill, { email, email_status: c.via === "seamless" ? "Seamless valid (90%+)" : "Published", email_source: c.via === "seamless" ? "Seamless.ai" : c.source_url, email_confidence: c.via === "seamless" ? "LIKELY" : "FACT" });
          if (phone && !same.phone) Object.assign(fill, { phone, phone_type: c.phone_type || null, phone_source: c.via === "seamless" ? "Seamless.ai" : c.source_url });
          if (linkedin && !same.linkedin_url) fill.linkedin_url = linkedin;
        }
        if (Object.keys(fill).length) {
          await db.from("contacts").update({ ...fill, claude_check: `${same.claude_check ? same.claude_check + " | " : ""}${c.via === "seamless" ? "Seamless" : "Public web"} ${now.slice(0, 10)}: ${c.via === "seamless" ? "record" : c.source_url}`, updated_at: now }).eq("id", same.id);
          updated.push(c.full_name);
        } else skipped.push({ name: c.full_name, why: "already on file" });
        continue;
      }
      const day = now.slice(0, 10), sm = c.via === "seamless";
      const ext = sm ? `SMLS-${c.seamless_id}` : "WEB-" + createHash("sha1").update(`${co.id}|${key(c.full_name)}`).digest("hex").slice(0, 12);
      const src = sm ? "Seamless.ai" : c.source_url;
      const { error } = await db.from("contacts").upsert([{ external_id: ext, company_id: co.id, full_name: c.full_name, title_verbatim: c.title_verbatim, research_channel: "Claude", channel_state: "Claude",
        channel_source: sm ? "Claude-Seamless" : "Claude public web search", source: sm ? "Seamless.ai (Find contacts)" : c.source_url, source_type: sm ? "Seamless.ai" : "Public web (free session)", source_url: sm ? null : c.source_url,
        verification_status: email || linkedin ? "LIKELY CURRENT" : "UNVERIFIED",
        email: email || null, email_status: email ? (sm ? "Seamless valid (90%+)" : "Published") : null, email_source: email ? src : null, email_confidence: email ? (sm ? "LIKELY" : "FACT") : null,
        phone: phone || null, phone_type: phone ? c.phone_type || null : null, phone_source: phone ? src : null, linkedin_url: linkedin || null, employment_status: sm ? "Current (per Seamless)" : "Current (per source)",
        notes_contact: sm ? `Found by Find contacts with Seamless on ${day}. ${c.source_note || ""} LinkedIn URL is from the Seamless record; the profile page was not opened.`.trim()
          : `Found by a free Claude session on ${day} from public web pages. ${c.source_note || ""} LinkedIn URLs are from search results only; profiles were not opened.`.trim(),
        claude_check: `${sm ? "Seamless record" : "Public web"} ${day}: ${sm ? "title, employer and contact details from the Seamless record" : c.source_url}`,
        record_status: `Claude — added (Find contacts, ${sm ? "Seamless" : "public web"}, ${day})`, company_ref_name: co.company_name }], { onConflict: "external_id", ignoreDuplicates: true });
      if (error) skipped.push({ name: c.full_name, why: error.message }); else { added.push(c.full_name); (have || []).push({ id: "", full_name: c.full_name, email, phone, linkedin_url: linkedin, channel_state: "Claude", claude_check: "" }); }
    }
    invalidateAllData();
    return NextResponse.json({ added, updated, skipped, dropped });
  }
  if (b.action === "signal_targets") {
    // Companies due a buying-signals scan: Verified / Likely ICP in the region, never-scanned first, then oldest scan. Existing Coupa customers are skipped.
    const st = await get<SignalStore>(db, "buying_signals", EMPTY_STORE);
    const { data } = await db.from("companies").select("slug,company_name,domain,company_website,country,industry,erp,existing_s2p_product,icp_status").in("icp_status", ["ICP — Verified", "ICP — Likely"]);
    const list = (data || []).filter((c) => regionOf(c.country) === b.region && !/coupa/i.test(String(c.existing_s2p_product || "")))
      .sort((x, y) => String(st.scans?.[x.slug] || "").localeCompare(String(st.scans?.[y.slug] || "")) || (x.icp_status === y.icp_status ? 0 : x.icp_status === "ICP — Verified" ? -1 : 1)).slice(0, b.limit);
    return NextResponse.json({ companies: list.map((c) => ({ slug: c.slug, name: c.company_name, domain: c.domain || "", website: c.company_website || "", industry: c.industry || "", erp: c.erp || "", existing_s2p: c.existing_s2p_product || "", icp_status: c.icp_status, last_scan: st.scans?.[c.slug] || null })),
      last_sweep: st.sweeps?.[b.region] || null });
  }
  if (b.action === "add_signals") {
    const st = await get<SignalStore>(db, "buying_signals", EMPTY_STORE);
    st.items ||= []; st.scans ||= {}; st.sweeps ||= {};
    const { data: have } = await db.from("companies").select("slug,company_name,domain,country,industry,erp");
    const today = now.slice(0, 10), added: string[] = [], updated: string[] = [], skipped: { title: string; why: string }[] = [];
    const norm = (t: string) => t.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
    for (const x of b.signals) {
      const co = (x.slug && (have || []).find((c) => c.slug === x.slug)) || (have || []).find((c) => sameCompany(x.company_name, "", c.company_name, c.domain || ""));
      if (x.lane === "ecc" && !co) { skipped.push({ title: x.title, why: "ECC to S/4HANA needs a company that is already in the app" }); continue; }
      if (x.lane === "rfp" && x.closes && x.closes < today) { skipped.push({ title: x.title, why: "tender already closed" }); continue; }
      const strength = x.strength === "Hot" && x.label !== "FACT" ? "Warm" : x.strength; // Hot is reserved for documented facts
      const slug = co?.slug || "", region = co ? regionOf(co.country) : regionOf(x.region);
      const key = createHash("sha1").update(`${x.lane}|${slug || norm(x.company_name)}|${x.source_url.replace(/[#?].*$/, "")}`).digest("hex").slice(0, 16);
      const old = st.items.find((i) => i.id === key);
      if (old) { Object.assign(old, { strength, label: x.label, evidence: x.evidence, why: x.why || old.why, closes: x.closes || old.closes, doc_url: x.doc_url || old.doc_url }); updated.push(x.title); continue; }
      const item: Signal = { id: key, lane: x.lane, strength, label: x.label, company_name: co?.company_name || x.company_name, slug, region, title: x.title, evidence: x.evidence, why: x.why,
        source_name: x.source_name, source_url: x.source_url, doc_url: x.doc_url, needs_login: x.needs_login, published: x.published, closes: x.closes, detected_at: now, status: "new" };
      st.items.unshift(item); added.push(x.title);
    }
    for (const sl of b.scanned) st.scans[sl] = now;
    if (b.sweep_region) st.sweeps[regionOf(b.sweep_region)] = now;
    // Housekeeping: drop tenders closed over a week ago, then keep the newest 1,500.
    const cutoff = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
    st.items = st.items.filter((i) => !(i.lane === "rfp" && i.closes && i.closes < cutoff)).slice(0, 1500);
    await put(db, "buying_signals", st);
    return NextResponse.json({ added, updated, skipped });
  }
  if (b.action === "market_targets") {
    // The vendor x region pairs due a market-intelligence scan: every Active region, oldest scan first.
    // The daily default covers only Active regions with Market intelligence switched on, High priority first; a job that names a region always runs.
    const prio = (k: string) => PRIORITY_ORDER.indexOf(effectiveEngine(icpDef.regions[k]).priority);
    const active = Object.entries(icpDef.regions).filter(([k, r]) => r.status === "active" && (b.region ? true : !!r.market)).map(([k]) => k).sort((x, y) => prio(x) - prio(y));
    const vendors = vendorList((await get<{ custom?: string[] }>(db, VENDORS_KEY, {})).custom);
    const vRank = (v: string) => (/^(sap|coupa)$/i.test(v) ? 0 : 1); // the two main vendors first
    // SAP and Coupa first; once one of them was scanned in the last 7 days it waits, so the other vendors get their turn without a click.
    const pRank = (x: { vendor: string; last_scan: string | null }) => (/^(sap|coupa)$/i.test(x.vendor) ? (x.last_scan && Date.now() - new Date(x.last_scan).getTime() < 7 * 864e5 ? 2 : 0) : 1);
    const { data } = await db.from("settings").select("key,value").like("key", "market_intel:%");
    const docs = new Map((data || []).map((r) => [r.key as string, r.value as MarketDoc]));
    const pairs = active.filter((r) => !b.region || r === b.region).flatMap((region) => vendors.filter((v) => !b.vendor || v === b.vendor).map((vendor) => { const d = docs.get(marketKey(vendor, region)); return { vendor, region, last_scan: d?.scanned_at || null, partners_known: d?.partners?.length || 0, known: (d?.partners || []).map((p) => p.name), partners_due: (d?.partners || []).filter((p) => !p.customers_scanned_at || Date.now() - new Date(p.customers_scanned_at).getTime() > 45 * 864e5).slice(0, 8).map((p) => ({ name: p.name, website: p.website })), partners_due_total: (d?.partners || []).filter((p) => !p.customers_scanned_at || Date.now() - new Date(p.customers_scanned_at).getTime() > 45 * 864e5).length, known_customers: b.vendor && b.region ? (d?.customers || []).slice(0, 1500).map((c) => ({ partner: c.partner, customer: c.customer })) : undefined, needs_contacts: (d?.customers || []).filter((c) => !c.contacts?.length).slice(0, 10).map((c) => ({ partner: c.partner, customer: c.customer, customer_website: c.customer_website })) }; }))
      .sort((x, y) => prio(x.region) - prio(y.region) || pRank(x) - pRank(y) || String(x.last_scan || "").localeCompare(String(y.last_scan || ""))).slice(0, b.limit);
    // Customers are searched by default, nobody has to click: every Active vendor x region with a partner whose customers were never searched (or not in 45 days), the main vendors first.
    // A partner hidden under "Other regions" (no confirmed local office) is left out; its customers would not show anyway.
    const stale = (p: { customers_scanned_at?: string; presence_pending?: boolean }) => !p.presence_pending && (!p.customers_scanned_at || Date.now() - new Date(p.customers_scanned_at).getTime() > 45 * 864e5);
    const customers_due = active.filter((r) => !b.region || r === b.region).flatMap((region) => vendors.filter((v) => !b.vendor || v === b.vendor).map((vendor) => {
      const due = (docs.get(marketKey(vendor, region))?.partners || []).filter(stale);
      return { vendor, region, partners_due_total: due.length, partners_due: due.slice(0, 8).map((p) => ({ name: p.name, website: p.website })) }; }))
      .filter((x) => x.partners_due_total > 0).sort((x, y) => prio(x.region) - prio(y.region) || vRank(x.vendor) - vRank(y.vendor) || y.partners_due_total - x.partners_due_total).slice(0, 6);
    return NextResponse.json({ targets: pairs, vendors, customers_due });
  }
  if (b.action === "add_market") {
    // Partners found on the vendor's partner directory / the partner's own site, and the customers the partner publishes. Public pages only; contacts follow the same rules as Find contacts.
    const allowed = vendorList((await get<{ custom?: string[] }>(db, VENDORS_KEY, {})).custom);
    if (!allowed.includes(b.vendor)) return NextResponse.json({ error: `Unknown vendor "${b.vendor}". Vendors: ${allowed.join(", ")}.` }, { status: 400 });
    const key = marketKey(b.vendor, b.region);
    const doc = await get<MarketDoc>(db, key, { vendor: b.vendor, region: b.region, partners: [], customers: [], scanned_at: "" });
    doc.partners ||= []; doc.customers ||= [];
    const { data: have } = await db.from("companies").select("slug,company_name,domain");
    const nk = marketNk;
    const added = { partners: 0, customers: 0, contacts: 0 }, updated = { partners: 0, customers: 0 }, skipped: { name: string; why: string }[] = [], dropped: string[] = [];
    const vet = (list: MContact[] | undefined, site: string, who: string): MContact[] => {
      const d = dom(site), out: MContact[] = [];
      for (const c of (list || []).slice(0, 3)) {
        let email = c.email.toLowerCase(), phone = c.phone, li = c.linkedin_url;
        if (email) { const [local, host = ""] = email.split("@"); const h = host.replace(/^www\./, "");
          if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(email) || GENERIC_LOCAL.test(local) || PERSONAL.test(h) || !d || !(h === d || h.endsWith("." + d))) { dropped.push(`${who}: ${c.name} email ${email}`); email = ""; } }
        if (phone && !/^\+?[\d\s().-]{7,24}$/.test(phone)) { dropped.push(`${who}: ${c.name} phone`); phone = ""; }
        if (li) { const m = li.match(/^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/([^/?#\s]+)/i); if (!m) { dropped.push(`${who}: ${c.name} LinkedIn`); li = ""; } else li = `https://www.linkedin.com/in/${m[2]}`; }
        if (email || phone || li) out.push({ name: c.name, title: c.title, email, phone, linkedin_url: li, source_url: c.source_url });
      }
      return out;
    };
    for (const pIn of b.partners) {
      // A name the firm is also listed under (partner.aka, for example WMS Solutions for WMS Middle East LLC) goes to the one partner, never a second entry.
      const same = doc.partners.find((x) => (x.aka || []).some((a) => marketNk(a) === marketNk(pIn.name)));
      const p = same ? { ...pIn, name: same.name } : pIn;
      const pending = !presenceOk(p, b.region); // kept, but hidden in the app until its base or an office in the region is confirmed
      const id = partnerId(b.vendor, b.region, p.name);
      const row: Partner = { id, vendor: b.vendor, region: b.region, name: p.name, website: p.website, tier: p.tier, services: p.services, hq_city: p.hq_city, hq_country: p.hq_country, branch: p.branch, office_address: p.office_address, office_source: p.office_source, scope_note: p.scope_note, branch_source: p.branch_source, presence_pending: pending || undefined, source_url: p.source_url, label: p.label, contacts: vet(p.contacts, p.website, p.name), found_at: now };
      const old = doc.partners.find((x) => x.id === id);
      if (old) { Object.assign(old, { website: row.website || old.website, tier: row.tier || old.tier, services: row.services || old.services, hq_city: row.hq_city || old.hq_city, hq_country: row.hq_country || old.hq_country, branch: row.branch || old.branch, office_address: row.office_address || old.office_address, office_source: row.office_source || old.office_source, scope_note: row.scope_note || old.scope_note, branch_source: row.branch_source || old.branch_source, presence_pending: pending ? old.presence_pending : undefined, contacts: row.contacts.length ? row.contacts : old.contacts }); updated.partners++; }
      else { doc.partners.unshift(row); added.partners++; added.contacts += row.contacts.length; }
    }
    for (const c of b.customers) {
      const partner = doc.partners.find((x) => nk(x.name) === nk(c.partner) || (x.aka || []).some((a) => nk(a) === nk(c.partner)));
      if (!partner) { skipped.push({ name: c.customer, why: `partner "${c.partner}" is not on the list yet; add it in the same file` }); continue; }
      const co = (have || []).find((x) => sameCompany(c.customer, c.customer_website, x.company_name, x.domain || ""));
      const id = createHash("sha1").update(`${partner.id}|${nk(c.customer)}`).digest("hex").slice(0, 14);
      const contacts = vet(c.contacts, c.customer_website || co?.domain || "", c.customer);
      const old = doc.customers.find((x) => x.id === id);
      if (old) { Object.assign(old, { project: c.project || old.project, contacts: contacts.length ? contacts : old.contacts, slug: co?.slug || old.slug }); updated.customers++; continue; }
      doc.customers.unshift({ id, partner_id: partner.id, partner: partner.name, vendor: b.vendor, region: b.region, customer: co?.company_name || c.customer, customer_website: c.customer_website, slug: co?.slug || "",
        project: c.project, source_url: c.source_url, published: c.published, contacts, found_at: now });
      added.customers++; added.contacts += contacts.length;
    }
    for (const nm of b.checked_partners) { const pr = doc.partners.find((x) => nk(x.name) === nk(nm)); if (pr) pr.customers_scanned_at = now; } // partners whose customers were searched this run
    doc.partners = doc.partners.slice(0, 300); doc.customers = doc.customers.slice(0, 2500); doc.scanned_at = now;
    await put(db, key, doc);
    return NextResponse.json({ added, updated, skipped, dropped, totals: { partners: doc.partners.length, customers: doc.customers.length } });
  }
  if (b.action === "pitch_facts") {
    const f = await pitchFacts(db, b.slug);
    return f ? NextResponse.json({ facts: f }) : NextResponse.json({ error: "Company not found." }, { status: 404 });
  }
  if (b.action === "save_pitch") {
    // The pitch plan a free scheduled session wrote; shown on the account page next to the paid button
    const { data: co } = await db.from("companies").select("id,profile").eq("slug", b.slug).maybeSingle();
    if (!co) return NextResponse.json({ error: "Company not found." }, { status: 404 });
    const profile = { ...((co.profile as Record<string, unknown>) || {}), "Pitch plan": { text: b.text, at: now, via: "Free scheduled Claude session (no API cost)" } };
    const { error } = await db.from("companies").update({ profile }).eq("id", co.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    invalidateAllData();
    return NextResponse.json({ ok: true });
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
    const st = await get<{ items: { id: string; filename: string; region: string; status: string; processed_at?: string; summary?: string }[] }>(db, "uploaded_lists", { items: [] });
    const item = st.items.find((x) => x.id === b.id);
    if (!item) return NextResponse.json({ error: "Upload not found." }, { status: 404 });
    item.status = b.status; item.processed_at = now; item.summary = b.summary;
    await put(db, "uploaded_lists", st);
    // The bell tells everyone the list has been read.
    const lg = await get<{ entries: unknown[] }>(db, "engine_log", { entries: [] });
    lg.entries.unshift({ at: now, summary: `Excel list read: ${item.filename} (${item.region}): ${b.status === "done" ? b.summary : `could not be read: ${b.summary}`}`, source: "upload", region: item.region, verified: 0, new_companies: [] });
    await put(db, "engine_log", { entries: lg.entries.slice(0, 60) });
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
        lists: ["Claude discovery"], icp_status: "Unknown", entity_type: c.entity_type || "Unknown", account_notes: `Found by a scheduled Claude session on ${day}: ${c.why_icp} Source: ${c.source_url}${c.focus ? ` Requested focus: ${c.focus}.` : ""}`,
        // a platform the user stated when asking for the company is recorded as confirmed, so it lands in that customer segment
        ...(c.user_platform ? { existing_s2p_product: c.user_platform, s2p_platform_status: "Confirmed Current", existing_s2p_detail: `Stated by the user who asked for this company (${day}).` } : {}),
        profile: { "Claude discovery": { why: c.why_icp, source_url: c.source_url, via: "scheduled session (no API cost)" }, ...(c.user_platform ? { "User-confirmed platform": { platform: c.user_platform, at: now } } : {}), ...(c.focus ? { "User focus": { text: c.focus, at: now } } : {}), ...(c.watch ? { Watch: { since: now, reason: "requested in Settings" } } : {}) } };
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
    // A list uploaded for one country stays in that country: blank rows take its country, and a row that names another country is left out (never filed under the wrong region).
    const up = b.upload_id ? (await get<{ items: { id: string; region: string }[] }>(db, "uploaded_lists", { items: [] })).items.find((x) => x.id === b.upload_id) : undefined;
    const upCountry = up ? canonCountry(up.region) : "";
    for (const c of b.companies) {
      if (up && c.country && regionOf(c.country) !== up.region) { skipped.push({ name: c.name, matches: `a different country (${c.country}); this list was uploaded for ${upCountry}` }); continue; }
      const hit = pool.find((x) => sameCompany(c.name, c.website, x.name, x.domain));
      if (hit) { skipped.push({ name: c.name, matches: hit.as }); continue; }
      const row = {
        slug: "cd-" + c.name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60), company_name: c.name, country: c.country || upCountry || "UAE",
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
// A legal form in brackets, such as "(Pty)", is not an acronym: it made every "(Pty) Ltd" company match the first one.
const LEGAL_FORM = /^(pty|ltd|plc|inc|llc|pjsc|psc|pte|ltda|sa|nv|bv|ag|gmbh|pvt|cc)$/;
const acronym = (n: string) => { const a = (n.match(/\(([A-Za-z]{2,8})\)/)?.[1] || "").toLowerCase(); return LEGAL_FORM.test(a) ? "" : a; };
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
