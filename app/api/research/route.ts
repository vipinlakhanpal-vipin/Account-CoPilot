import { NextResponse, after } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { researchNotes, extract, type Depth } from "@/lib/research/engine";
import { reconcile } from "@/lib/research/reconcile";

// Vercel Hobby allows up to 300s per function; Pro allows more. Deep research may need Pro.
export const maxDuration = 300;

const Body = z.object({
  company: z.string().min(2).max(200),
  country: z.string().default("UAE"),
  depth: z.enum(["quick", "standard", "deep"]).default("standard"),
  roles: z.array(z.string()).default([]),
  companyId: z.string().uuid().optional(),
});

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Enter a company name." }, { status: 400 });
  const b = parsed.data;
  const db = supabaseAdmin();

  let existing: string | undefined;
  if (b.companyId) {
    const { data: co } = await db.from("companies").select("*").eq("id", b.companyId).maybeSingle();
    const { data: ppl } = await db.from("contacts").select("full_name,title_verbatim,email,linkedin_url").eq("company_id", b.companyId);
    if (co) existing = JSON.stringify({ company: { name: co.company_name, erp: co.erp, s2p: co.existing_s2p_product, status: co.s2p_platform_status,
      signal: co.s2p_signal_level, last_researched: co.last_researched }, contacts: ppl }).slice(0, 12000);
  }

  const { data: run, error } = await db.from("research_runs").insert({
    query: `${b.company} (${b.country})`, company_name: b.company, country: b.country, depth: b.depth, roles: b.roles,
    company_id: b.companyId ?? null, status: "researching", requested_by: user.email,
  }).select("id").single();
  if (error || !run) return NextResponse.json({ error: "Could not start the research run." }, { status: 500 });

  after(async () => {
    try {
      const notes = await researchNotes({ company: b.company, country: b.country, roles: b.roles, depth: b.depth as Depth, existing });
      await db.from("research_runs").update({ status: "extracting" }).eq("id", run.id);
      const result = await extract(notes, b.company);
      await db.from("research_runs").update({ status: "reconciling" }).eq("id", run.id);
      const { companyId, stats } = await reconcile(db, run.id, result, b.companyId);
      await db.from("research_runs").update({ status: "done", company_id: companyId, stats, finished_at: new Date().toISOString() }).eq("id", run.id);
    } catch (e) {
      await db.from("research_runs").update({ status: "error", error: e instanceof Error ? e.message : String(e), finished_at: new Date().toISOString() }).eq("id", run.id);
    }
  });

  return NextResponse.json({ runId: run.id });
}
