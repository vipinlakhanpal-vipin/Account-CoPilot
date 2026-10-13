import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getAccess, canSeeRegion, scopeData } from "@/lib/access";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadAll } from "@/lib/data";
import { buildReport, REPORT_STATUSES } from "@/lib/pdfReport";

// Free (no Anthropic API): builds the ICP account report from data already in the app, scoped to what the signed-in user may see.
export const maxDuration = 60;
export const dynamic = "force-dynamic";
const MAX_COMPANIES = 150;

// Either a region report (statuses + region + limit) or a single company (companyId, any status, any region the user can see).
const Body = z.object({
  statuses: z.array(z.enum(REPORT_STATUSES)).min(1).optional(),
  region: z.string().min(2).max(40).default("All"),
  limit: z.number().int().min(1).max(MAX_COMPANIES).default(50),
  companyId: z.string().min(8).max(60).optional(),
  companyIds: z.array(z.string().min(8).max(60)).min(1).max(1000).optional(),
  title: z.string().max(120).optional(),
  rank: z.enum(["fit", "revenue", "name"]).default("fit"),
}).refine((b) => b.companyId || b.companyIds || b.statuses, { message: "statuses, companyIds or companyId required" });

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pick at least one status and a region." }, { status: 400 });
  const { statuses = [...REPORT_STATUSES], region, limit, companyId, companyIds, title, rank } = parsed.data;
  const ids = companyId ? [companyId] : companyIds;
  const access = await getAccess(user);
  if (region !== "All" && !canSeeRegion(access, region)) return NextResponse.json({ error: "You don't have access to that region." }, { status: 403 });

  const db = supabaseAdmin();
  const [all, def, crit] = await Promise.all([
    loadAll(db).then((d) => scopeData(d, access)),
    db.from("settings").select("value").eq("key", "icp_definition").maybeSingle().then((r) => r.data?.value),
    db.from("settings").select("value").eq("key", "icp_criteria").maybeSingle().then((r) => r.data?.value),
  ]);
  const { bytes, count, total } = await buildReport(all, def, { statuses, region, limit, generatedBy: access.email, criteria: crit, ids, title, rank });
  if (count === 0) return NextResponse.json({ error: companyId ? "That company wasn't found, or you don't have access to it." : ids ? "None of the companies in that list are in the region you chose." : "No companies match those statuses in that region." }, { status: 404 });
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Account_CoPilot_${companyId ? "Company" : "ICP"}_Report_${companyId ? companyId.slice(0, 8) : region}_${date}.pdf"`,
      "X-Report-Count": String(count), "X-Report-Total": String(total), "Cache-Control": "no-store",
    },
  });
}
