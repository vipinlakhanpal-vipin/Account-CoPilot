import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getAccess, canSeeRegion, scopeData } from "@/lib/access";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadAll } from "@/lib/data";
import { buildCampaignList } from "@/lib/xlsxReport";

// Free (no Anthropic API): a contact list for one region, built from data already in the app and scoped to the user's regions.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const STATUSES = ["ICP — Verified", "ICP — Likely", "ICP — Needs check"] as const;
const Body = z.object({
  region: z.string().min(2).max(40),
  statuses: z.array(z.enum(STATUSES)).min(1).optional(),
  companyIds: z.array(z.string().min(8).max(60)).min(1).max(1000).optional(),
  emailOnly: z.boolean().default(true),
  limit: z.number().int().min(1).max(1000).optional(),
  rank: z.enum(["fit", "revenue", "name"]).default("fit"),
}).refine((b) => b.statuses || b.companyIds, { message: "statuses or companyIds required" });

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a region and at least one status." }, { status: 400 });
  const { region, statuses = [...STATUSES], emailOnly, companyIds, limit, rank } = parsed.data;
  const access = await getAccess(user);
  if (!canSeeRegion(access, region)) return NextResponse.json({ error: "You don't have access to that region." }, { status: 403 });

  const db = supabaseAdmin();
  const [all, def, crit] = await Promise.all([
    loadAll(db).then((d) => scopeData(d, access)),
    db.from("settings").select("value").eq("key", "icp_definition").maybeSingle().then((r) => r.data?.value),
    db.from("settings").select("value").eq("key", "icp_criteria").maybeSingle().then((r) => r.data?.value),
  ]);
  const out = await buildCampaignList(all, { region, statuses, emailOnly, generatedBy: access.email, ids: companyIds, def, limit, rank, criteria: crit });
  if (out.contacts === 0) {
    return NextResponse.json({ error: `No contacts${emailOnly ? " with an official email" : ""} are on file for ${region} companies ${companyIds ? "in that list" : "with those statuses"} yet. Contacts come from your workbook or Seamless enrichment.` }, { status: 404 });
  }
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(out.buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Account_CoPilot_Campaign_List_${region}_${date}.xlsx"`,
      "X-Report-Count": String(out.contacts), "X-Report-Companies": String(out.companies), "X-Report-Total": String(out.totalCompanies), "Cache-Control": "no-store",
    },
  });
}
