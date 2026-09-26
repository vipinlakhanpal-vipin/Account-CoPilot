import { NextResponse, after } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { discoverCompanies } from "@/lib/research/engine";

// "Research more" from the left panel: finds new ICP-matching companies in one country (paid, user-triggered),
// adds them as list "Claude discovery", and optionally starts a quick research run for each (paid per company).
export const maxDuration = 300;

const Body = z.object({ country: z.string().min(2).max(40), limit: z.number().int().min(1).max(10).default(5), criteria: z.string().max(4000), profile: z.boolean().default(false) });
const slug = (n: string) => "cd-" + n.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
const norm = (n: string) => n.toLowerCase().replace(/&/g, " and ").replace(/\b(pjsc|psc|plc|llc|group|holding|company|co|the)\b/g, "").replace(/[^a-z0-9]/g, "");

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid discovery request." }, { status: 400 });
  const b = parsed.data;
  const db = supabaseAdmin();
  const { data: have } = await db.from("companies").select("company_name,domain");
  const names = (have || []).map((c) => c.company_name as string);
  const known = new Set([...names.map(norm), ...(have || []).map((c) => String(c.domain || "").replace(/^www\./, "")).filter(Boolean)]);

  const { data: run, error } = await db.from("research_runs").insert({ query: `Discovery: ${b.country} (up to ${b.limit})`, company_name: `Discovery — ${b.country}`,
    country: b.country, depth: "quick", roles: [], status: "researching", requested_by: user.email }).select("id").single();
  if (error || !run) return NextResponse.json({ error: "Could not start discovery." }, { status: 500 });
  const cookie = req.headers.get("cookie") || "", origin = new URL(req.url).origin;

  after(async () => {
    try {
      const found = await discoverCompanies({ country: b.country, criteria: b.criteria, exclude: names, limit: b.limit });
      const today = new Date().toISOString().slice(0, 10);
      const fresh = found.companies.filter((c) => {
        const dom = c.website.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
        return c.name && !known.has(norm(c.name)) && !(dom && known.has(dom));
      });
      const rows = fresh.map((c) => ({ slug: slug(c.name), company_name: c.name, country: b.country, company_website: c.website || null,
        domain: c.website ? c.website.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] : null, hq_city: c.hq_city || null, industry: c.industry || null,
        employee_range: c.employees || null, research_channel: "Claude discovery", lists: ["Claude discovery"], icp_status: "Unknown",
        account_notes: `Found by Research more (${b.country}) on ${today}: ${c.why_icp} Source: ${c.source_url}`,
        profile: { "Claude discovery": { why: c.why_icp, ownership: c.ownership, revenue_estimate_usd_m: c.revenue_estimate_usd_m, revenue_basis: c.revenue_basis, source_url: c.source_url, requested_by: user.email } } }));
      const { data: ins } = rows.length ? await db.from("companies").upsert(rows, { onConflict: "slug", ignoreDuplicates: true }).select("id,company_name") : { data: [] };
      for (const r of fresh) if (r.source_url) {
        const co = (ins || []).find((x) => x.company_name === r.name);
        if (co) await db.from("sources").insert({ company_id: co.id, source: "Claude discovery (web search)", source_type: "Discovery", source_tier: "Tier 3", url: r.source_url,
          information_found: `Discovered as ICP candidate: ${r.revenue_estimate_usd_m ? `~$${r.revenue_estimate_usd_m}M (${r.revenue_basis})` : "revenue not stated"}`, evidence: r.why_icp, confidence: "MEDIUM" });
      }
      await db.from("research_runs").update({ status: "done", finished_at: new Date().toISOString(),
        stats: { found: found.companies.length, added: ins?.length || 0, names: (ins || []).map((x) => x.company_name) } }).eq("id", run.id);
      if (b.profile) for (const co of ins || []) {
        // Each profile is its own research run (own function invocation), so the 300s limit applies per company.
        await fetch(`${origin}/api/research`, { method: "POST", headers: { "Content-Type": "application/json", cookie },
          body: JSON.stringify({ company: co.company_name, country: b.country, depth: "quick", companyId: co.id }) }).catch(() => {});
      }
    } catch (e) {
      await db.from("research_runs").update({ status: "error", error: e instanceof Error ? e.message : String(e), finished_at: new Date().toISOString() }).eq("id", run.id);
    }
  });
  return NextResponse.json({ runId: run.id });
}
