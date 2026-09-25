import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { loadAll } from "@/lib/data";
import { buildWorkbook } from "@/lib/export/workbook";

export const maxDuration = 60;

export async function GET() {
  const sb = await supabaseServer();
  const data = await loadAll(sb);
  const buf = await buildWorkbook(data);
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Account_CoPilot_Master_Book_${date}.xlsx"`,
    },
  });
}
