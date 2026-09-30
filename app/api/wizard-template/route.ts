import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireUser } from "@/lib/auth";

// Setup Wizard's "Add Data" step: a blank starter workbook for someone building their list from scratch.
// Generated on request (not a committed file) so nothing binary sits in this public repo.
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const wb = new ExcelJS.Workbook();
  wb.creator = "Account CoPilot";
  const ws = wb.addWorksheet("Companies");
  ws.columns = [
    { header: "Company Name", key: "name", width: 34 },
    { header: "Website", key: "website", width: 26 },
    { header: "Country", key: "country", width: 16 },
    { header: "Industry", key: "industry", width: 22 },
    { header: "HQ City", key: "hq_city", width: 18 },
    { header: "Notes", key: "notes", width: 40 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCEFE8" } };
  ws.addRow({ name: "Almarai", website: "almarai.com", country: "UAE", industry: "Food & beverage", hq_city: "Dubai", notes: "Example row — delete before uploading" });
  ws.getRow(2).font = { italic: true, color: { argb: "FF8A93A8" } };

  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=\"account-copilot-companies-template.xlsx\"",
    },
  });
}
