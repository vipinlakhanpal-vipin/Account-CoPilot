import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { statusPatch, applyRevenueResult } from "@/lib/icpStatus.mjs";

// Limited API for scheduled Claude sessions (no Supabase key needed in the cloud environment).
// Auth: "Authorization: Bearer <ENGINE_TOKEN>"; only the SHA-256 hash is stored (settings.engine_token). Revoke/regenerate in Settings.
// Allowed: claim/finish queued jobs, read the verification queue, submit revenue results, add discovered companies, post a notification.
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
  employees_source_url: z.string().optional().default(""), icp_verdict: z.enum(["Verified ICP", "Likely ICP", "Below $250M", "Revenue not found"]), reasoning: z.string() });
const NewCo = z.object({ name: z.string().min(2), website: z.string().optional().default(""), country: z.string().default("UAE"), industry: z.string().optional().default(""),
  hq_city: z.string().optional().default(""), why_icp: z.string().optional().default(""), source_url: z.string().optional().default("") });
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("claim") }),
  z.object({ action: z.literal("finish"), id: z.string(), status: z.enum(["done", "error"]), result: z.string().max(2000) }),
  z.object({ action: z.literal("queue"), region: z.string().default("UAE"), limit: z.number().int().min(1).max(200).default(50) }),
  z.object({ action: z.literal("submit"), results: z.array(Result).max(50) }),
  z.object({ action: z.literal("add_companies"), companies: z.array(NewCo).max(50) }),
  z.object({ action: z.literal("log"), summary: z.string().max(1000), verified: z.number().int().min(0).default(0), new_companies: z.array(z.string()).max(100).default([]) }),
]);
type Job = { id: string; status: string; started_at?: string; done_at?: string; result?: string };

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
    job.status = b.status; job.done_at = now; job.result = b.result; await put(db, "engine_jobs", st);
    return NextResponse.json({ ok: true });
  }
  if (b.action === "queue") {
    const { data } = await db.from("companies").select("slug,company_name,company_website,domain,industry,country,icp_status,profile")
      .eq("country", b.region).in("icp_status", ["ICP — Needs check", "Unknown", "ICP — Likely"]);
    const rank: Record<string, number> = { "ICP — Needs check": 0, Unknown: 1, "ICP — Likely": 2 };
    const size = (c: { profile?: Record<string, { "Size (USD m)"?: number; revenue_range?: string; employee_count?: string }> }) =>
      Number(c.profile?.["Vipin-Profiling"]?.["Size (USD m)"]) || (c.profile?.["Seamless discovery"]?.revenue_range === "$1B+" ? 1000 : c.profile?.["Seamless discovery"] ? 500 : 0);
    const q = (data || []).filter((c) => !c.profile?.["Revenue check"]).sort((x, y) => rank[x.icp_status] - rank[y.icp_status] || size(y) - size(x)).slice(0, b.limit)
      .map((c) => ({ slug: c.slug, company_name: c.company_name, website: c.company_website || c.domain || "", industry: c.industry || "", current_status: c.icp_status }));
    return NextResponse.json({ queue: q });
  }
  if (b.action === "submit") {
    const out: string[] = [];
    for (const r of b.results) {
      const { data: c } = await db.from("companies").select("*").eq("slug", r.slug).maybeSingle();
      if (!c) { out.push(`${r.slug}: not found`); continue; }
      const applied = await applyRevenueResult(db, c, r);
      const { status, patch } = statusPatch(applied);
      await db.from("companies").update(patch).eq("id", c.id);
      out.push(`${r.company_name}: ${status}`);
    }
    return NextResponse.json({ applied: out });
  }
  if (b.action === "add_companies") {
    const norm = (n: string) => n.toLowerCase().replace(/&/g, " and ").replace(/\b(pjsc|psc|plc|llc|group|holding|company|co|the)\b/g, "").replace(/[^a-z0-9]/g, "");
    const dom = (w: string) => w.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
    const { data: have } = await db.from("companies").select("company_name,domain");
    const known = new Set([...(have || []).map((c) => norm(c.company_name)), ...(have || []).map((c) => c.domain).filter(Boolean)]);
    const day = now.slice(0, 10);
    const rows = b.companies.filter((c) => !known.has(norm(c.name)) && !(dom(c.website) && known.has(dom(c.website)))).map((c) => ({
      slug: "cd-" + c.name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60), company_name: c.name, country: c.country,
      company_website: c.website || null, domain: dom(c.website) || null, hq_city: c.hq_city || null, industry: c.industry || null, research_channel: "Claude discovery",
      lists: ["Claude discovery"], icp_status: "Unknown", account_notes: `Found by a scheduled Claude session on ${day}: ${c.why_icp} Source: ${c.source_url}`,
      profile: { "Claude discovery": { why: c.why_icp, source_url: c.source_url, via: "scheduled session (no API cost)" } } }));
    if (rows.length) await db.from("companies").upsert(rows, { onConflict: "slug", ignoreDuplicates: true });
    return NextResponse.json({ added: rows.map((r) => ({ slug: r.slug, company_name: r.company_name })), skipped: b.companies.length - rows.length });
  }
  // log → bell notification
  const l = await get<{ entries: unknown[] }>(db, "engine_log", { entries: [] });
  l.entries.unshift({ at: now, summary: b.summary, verified: b.verified, new_companies: b.new_companies });
  await put(db, "engine_log", { entries: l.entries.slice(0, 60) });
  return NextResponse.json({ ok: true });
}
