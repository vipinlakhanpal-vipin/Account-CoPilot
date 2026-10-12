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

const Body = z.object({
  statuses: z.array(z.enum(REPORT_STATUSES)).min(1),
  region: z.string().min(2).max(40),
  limit: z.number().int().min(1).max(MAX_COMPANIES).default(50),
});

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pick at least one status and a region." }, { status: 400 });
  const { statuses, region, limit } = parsed.data;
  const access = await getAccess(user);
  if (region !== "All" && !canSeeRegion(access, region)) return NextResponse.json({ error: "You don't have access to that region." }, { status: 403 });

  const db = supabaseAdmin();
  const [all, def, crit] = await Promise.all([
    loadAll(db).then((d) => scopeData(d, access)),
    db.from("settings").select("value").eq("key", "icp_definition").maybeSingle().then((r) => r.data?.value),
    db.from("settings").select("value").eq("key", "icp_criteria").maybeSingle().then((r) => r.data?.value),
  ]);
  const { bytes, count, total } = await buildReport(all, def, { statuses, region, limit, generatedBy: access.email, criteria: crit });
  if (count === 0) return NextResponse.json({ error: "No companies match those statuses in that region." }, { status: 404 });
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Account_CoPilot_ICP_Report_${region}_${date}.pdf"`,
      "X-Report-Count": String(count), "X-Report-Total": String(total), "Cache-Control": "no-store",
    },
  });
}
