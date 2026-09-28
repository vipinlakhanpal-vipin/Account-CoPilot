import { requireUser } from "@/lib/auth";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { loadAll } from "@/lib/data";
import { buildWorkbook } from "@/lib/export/workbook";
import { getAccess, scopeData } from "@/lib/access";

export const maxDuration = 60;

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const sb = await supabaseServer();
  const data = scopeData(await loadAll(sb), await getAccess(user)); // Standard users export only their region
  const { data: defRow } = await sb.from("settings").select("value").eq("key", "icp_definition").maybeSingle();
  const buf = await buildWorkbook(data, defRow?.value);
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Account_CoPilot_Master_Book_${date}.xlsx"`,
    },
  });
}
