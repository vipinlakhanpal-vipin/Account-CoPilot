import "server-only";
import ExcelJS from "exceljs";
import type { AllData, Row } from "@/lib/data";

const FONT = "Arial";
const CARBON = { fg: "FF1B263B", bg: "FF0B1320" };
const HEADER = "FF15325A";
const INPUT_HEADER = "FFB8860B";
const INPUT_FILL = "FFFFF3D1";
const INPUT_BORDER = "FF2E75B6";
const BAND = "FFEEF3FA";
const SIGNALS: Record<string, [string, string]> = {
  "VERY STRONG SIGNAL": ["FF0F7A5A", "FFFFFFFF"], "STRONG SIGNAL": ["FF2C8A68", "FFFFFFFF"], "MODERATE SIGNAL": ["FFF2C14E", "FF1B263B"],
  "WEAK SIGNAL": ["FFF4EFE6", "FF1B263B"], "NO SIGNAL": ["FFEEF1F5", "FF1B263B"], "CONFLICTING SIGNAL": ["FFE06C75", "FFFFFFFF"],
};
const TABS = ["FF0B1320", "FF0F1D33", "FF14284A", "FF15325A", "FF1A3D6B", "FF1F4E79", "FF245C8F", "FF2A6AA5", "FF2E75B6", "FF3A86C8", "FF4A96D8", "FF5AA6E6"];
const SIG_ORDER = Object.keys(SIGNALS);
const rank = (s: string) => { const i = SIG_ORDER.indexOf(s); return i < 0 ? 9 : i; };

type Col = [header: string, key: string, width: number, kind?: "url" | "wrap" | "num"];
const FIRST = 4, MAX = 3000;

function banner(ws: ExcelJS.Worksheet, title: string, subtitle: string, n: number) {
  const last = Math.max(n, 6);
  ws.mergeCells(1, 1, 1, last); ws.mergeCells(2, 1, 2, last);
  ws.getCell(1, 1).value = title; ws.getCell(2, 1).value = subtitle;
  for (let c = 1; c <= last; c++) {
    ws.getCell(1, c).fill = { type: "pattern", pattern: "darkTrellis", fgColor: { argb: CARBON.fg }, bgColor: { argb: CARBON.bg } };
    ws.getCell(2, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: CARBON.bg } };
  }
  ws.getCell(1, 1).font = { name: FONT, size: 16, bold: true, color: { argb: "FFFFFFFF" } };
  ws.getCell(2, 1).font = { name: FONT, size: 9, italic: true, color: { argb: "FFA9C7EC" } };
  ws.getRow(1).height = 30; ws.getRow(2).height = 18;
}

function table(wb: ExcelJS.Workbook, name: string, title: string, subtitle: string, colsIn: Col[], rowsIn: Row[], tab: number, inputs: string[] = []) {
  const cols: Col[] = [["#", "__n", 6, "num"], ...colsIn];
  const rows: Row[] = rowsIn.map((r, i) => ({ ...r, __n: i + 1 }));
  const ws = wb.addWorksheet(name, { properties: { tabColor: { argb: TABS[tab % TABS.length] } }, views: [{ state: "frozen", xSplit: 3, ySplit: 3, zoomScale: 90 }] });
  banner(ws, title, subtitle, cols.length);
  cols.forEach(([h, key, w], i) => {
    const cell = ws.getCell(3, i + 1);
    cell.value = h;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: inputs.includes(key) ? INPUT_HEADER : HEADER } };
    cell.font = { name: FONT, bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    cell.alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
    ws.getColumn(i + 1).width = w;
  });
  ws.getRow(3).height = 34;
  rows.forEach((r, ri) => {
    const rowN = FIRST + ri;
    cols.forEach(([, key, , kind], ci) => {
      let v = r[key];
      if (v === null || v === undefined) v = "";
      if (Array.isArray(v)) v = v.join("; ");
      const cell = ws.getCell(rowN, ci + 1);
      const isInput = inputs.includes(key);
      if (kind === "url" && typeof v === "string" && v.startsWith("http")) {
        cell.value = { text: v, hyperlink: v };
        cell.font = { name: FONT, size: 9, color: { argb: "FF1F5FBF" }, underline: true };
      } else {
        cell.value = kind === "num" && v !== "" ? Number(v) : String(v);
        cell.font = { name: FONT, size: 9 };
      }
      if (kind === "num") cell.numFmt = "#,##0";
      cell.alignment = { vertical: "top", wrapText: kind === "wrap" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: isInput ? INPUT_FILL : ri % 2 ? BAND : "FFFFFFFF" } };
      const side = isInput ? { style: "medium" as const, color: { argb: INPUT_BORDER } } : { style: "thin" as const, color: { argb: "FFC9D3E0" } };
      cell.border = { top: side, left: side, bottom: side, right: side };
      const sig = SIGNALS[String(v)];
      if (sig) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: sig[0] } };
        cell.font = { name: FONT, size: 9, bold: true, color: { argb: sig[1] } };
      }
    });
  });
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: cols.length } };
  return ws;
}

export async function buildWorkbook(d: AllData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Account CoPilot";
  wb.calcProperties.fullCalcOnLoad = true;
  const today = new Date().toISOString().slice(0, 10);
  const dash = wb.addWorksheet("Executive Dashboard", { properties: { tabColor: { argb: TABS[0] } }, views: [{ showGridLines: false }] });

  const accCols: Col[] = [
    ["Company", "company_name", 30], ["Website", "company_website", 24, "url"], ["Country", "country", 9], ["Exchange", "exchange", 10], ["Ticker", "ticker", 10],
    ["Industry", "industry", 20], ["ICP Status", "icp_status", 22], ["Lists", "lists_text", 26], ["ICP Fit", "icp_fit", 10], ["ICP Fit Reason", "icp_fit_reason", 34, "wrap"], ["Revenue (USD m)", "revenue_usd_m", 13, "num"],
    ["Revenue (Local)", "revenue_local", 16], ["Revenue FY", "revenue_fy", 10], ["Revenue Source", "revenue_source_url", 24, "url"], ["Employee Range", "employee_range", 14],
    ["Ownership", "ownership", 30, "wrap"], ["Parent Company", "parent_company", 22], ["Subsidiaries", "subsidiaries", 34, "wrap"], ["Board Phone", "board_phone", 16],
    ["Procurement Model", "procurement_model", 30, "wrap"], ["ERP", "erp", 22], ["ERP Status", "erp_status", 11], ["ERP Evidence", "erp_evidence", 40, "wrap"],
    ["Existing S2P Product", "existing_s2p_product", 18], ["S2P Detail", "existing_s2p_detail", 26, "wrap"], ["S2P Platform Status", "s2p_platform_status", 20],
    ["S2P Signal Level", "s2p_signal_level", 20], ["S2P Strong Signals", "s2p_strong_signals", 60, "wrap"],
    ["Digital Transformation Signals", "digital_transformation_signals", 44, "wrap"], ["Procurement Transformation Signals", "procurement_transformation_signals", 44, "wrap"],
    ["Relevant Technologies", "relevant_technologies", 30, "wrap"], ["Implementation Partner", "known_implementation_partner", 22, "wrap"],
    ["Consulting Partner", "known_consulting_partner", 22, "wrap"], ["Coupa Opportunity Type", "coupa_opportunity_type", 26], ["Ariba Opportunity Type", "ariba_opportunity_type", 26],
    ["Potential Opportunity", "potential_opportunity", 50, "wrap"], ["Account Notes", "account_notes", 50, "wrap"], ["Research Channel", "research_channel", 11],
    ["First Found", "first_found", 11], ["Last Researched", "last_researched", 20], ["Confidence", "research_confidence", 11],
    ["Account Owner", "account_owner", 16], ["Account Priority", "account_priority", 12], ["Pitch Angle / Next Step", "pitch_next_step", 36, "wrap"],
  ];
  const icpRank = (x: string) => (x === "Verified ICP" ? 0 : String(x || "").startsWith("Claude") ? 1 : 2);
  const accounts: Row[] = d.accounts.map((a): Row => ({ ...a, lists_text: (a.lists || []).join(", ") }))
    .sort((a, b) => icpRank(a.icp_status) - icpRank(b.icp_status) || rank(a.s2p_signal_level) - rank(b.s2p_signal_level) || String(a.company_name).localeCompare(b.company_name));
  table(wb, "Accounts", "ACCOUNTS — UAE ICP & Target Lists", `Exported ${today} · gold columns are for your input`, accCols, accounts, 1, ["account_owner", "account_priority", "pitch_next_step"]);

  const conCols: Col[] = [
    ["Company", "company", 26], ["Full Name", "full_name", 22], ["Nationality", "nationality", 14], ["Title (Verbatim)", "title_verbatim", 32, "wrap"],
    ["Standardized Title", "standardized_title", 22], ["Role Family", "role_family", 14], ["Contact Tier", "contact_tier", 9], ["Research Channel", "research_channel", 12],
    ["Channel State", "channel_state", 14], ["Channel Source", "channel_source", 18], ["Source", "source", 22, "wrap"], ["Source Type", "source_type", 18],
    ["Source URL", "source_url", 26, "url"], ["Verification Status", "verification_status", 13], ["Email", "email", 28], ["Email Status", "email_status", 14],
    ["Email Source", "email_source", 12], ["Email Confidence", "email_confidence", 14], ["Unverified Email Candidate", "email_candidate", 30, "wrap"],
    ["Phone", "phone", 17], ["Phone Type", "phone_type", 11], ["Location", "location", 18], ["LinkedIn URL", "linkedin_url", 30, "url"],
    ["Existing S2P Product", "existing_s2p_product", 16], ["Account S2P Signal", "account_s2p_signal", 18], ["Contact S2P Signal", "s2p_contact_signal", 34, "wrap"],
    ["Notes / Intel About Contact", "notes_contact", 50, "wrap"], ["Record Status", "record_status", 18], ["Claude Check", "claude_check", 34, "wrap"],
    ["Employment Status", "employment_status", 13], ["Previous Company", "previous_company", 18], ["Previous Title", "previous_title", 20],
    ["Owner", "owner", 12], ["Warm Intro?", "warm_intro", 10], ["Campaign", "campaign", 16], ["Review Status", "review_status", 13], ["Reviewer Notes", "reviewer_notes", 30, "wrap"],
  ];
  table(wb, "Contacts", "CONTACTS — Decision Makers & Influencers", "Reference rows unchanged · Claude rows marked Channel State = Claude · emails never pattern-guessed",
    conCols, d.contacts, 2, ["owner", "warm_intro", "campaign", "review_status", "reviewer_notes"]);

  const stkCols: Col[] = [
    ["Company", "company", 26], ["Full Name", "full_name", 22], ["Nationality", "nationality", 14], ["Title (Verbatim)", "title_verbatim", 32, "wrap"],
    ["Role Family", "role_family", 14], ["Contact Tier", "contact_tier", 9], ["Channel State", "channel_state", 14], ["Channel Source", "channel_source", 18],
    ["Email", "email", 28], ["Email Status", "email_status", 14], ["Unverified Email Candidate", "email_candidate", 30, "wrap"], ["Phone", "phone", 17],
    ["Phone Type", "phone_type", 11], ["Location", "location", 18], ["LinkedIn URL", "linkedin_url", 30, "url"], ["Existing S2P Product", "existing_s2p_product", 16],
    ["S2P Signal", "account_s2p_signal", 18], ["Employment Status", "employment_status", 13], ["Verification Status", "verification_status", 13],
    ["Notes / Intel about the Contact", "notes_contact", 48, "wrap"], ["Notes / Intel about the Company", "notes_company", 60, "wrap"],
    ["Record Status", "record_status", 18], ["Claude Check", "claude_check", 34, "wrap"], ["Owner", "owner", 12], ["Warm Intro?", "warm_intro", 10],
    ["Campaign", "campaign", 16], ["Outreach Status", "outreach_status", 14],
  ];
  const stk = [...d.contacts].sort((a, b) => rank(a.account_s2p_signal) - rank(b.account_s2p_signal) || String(a.company).localeCompare(b.company)
    || String(a.contact_tier).localeCompare(String(b.contact_tier)) || String(a.full_name).localeCompare(b.full_name));
  table(wb, "Stakeholders", "STAKEHOLDERS — Campaign Planning View", "Company & contact details only · sorted by S2P signal, then tier",
    stkCols, stk, 3, ["owner", "warm_intro", "campaign", "outreach_status"]);

  table(wb, "S2P Signals", "S2P SIGNALS — Evidence-based, scoring-free", "Every signal carries its evidence and source",
    [["Company", "company", 26], ["Category", "category", 20], ["Signal", "signal", 50, "wrap"], ["Level", "level", 20], ["Platform", "platform", 12],
     ["Evidence", "evidence", 60, "wrap"], ["Source URL", "source_url", 30, "url"], ["Date", "date", 11], ["Research Channel", "research_channel", 10]],
    [...d.signals].sort((a, b) => rank(a.level) - rank(b.level)), 4);
  table(wb, "ERP & Apps Landscape", "ERP LANDSCAPE & THIRD-PARTY APPLICATIONS", "FACT = directly sourced · LIKELY = several indirect signals · UNVERIFIED = one weak source",
    [["Company", "company", 26], ["Application / Platform", "name", 26], ["Category", "category", 18], ["Status", "status", 12], ["Evidence", "evidence", 60, "wrap"], ["Source URL", "source_url", 30, "url"]],
    [...d.apps].sort((a, b) => String(a.company).localeCompare(b.company)), 5);
  table(wb, "Source Evidence", "SOURCE EVIDENCE — Audit Trail", "Every observation retained",
    [["Company", "company", 24], ["Related Contact", "related_contact", 20], ["Source", "source", 24, "wrap"], ["Source Type", "source_type", 18], ["Tier", "source_tier", 9],
     ["URL", "url", 30, "url"], ["Research Channel", "research_channel", 10], ["Information Found", "information_found", 40, "wrap"], ["Evidence", "evidence", 50, "wrap"],
     ["Date Published", "date_published", 11], ["Date Accessed", "date_accessed", 11], ["Confidence", "confidence", 10],
     ["Supports Employment?", "supports_current_employment", 11], ["Supports Title?", "supports_current_title", 11], ["Supports S2P?", "supports_s2p_status", 11]],
    d.sources, 6);
  table(wb, "Employment History", "EMPLOYMENT HISTORY", "Current vs previous vs recently changed",
    [["Full Name", "full_name", 22], ["Company", "company", 26], ["Title", "title", 30, "wrap"], ["Source", "source", 22], ["Source URL", "source_url", 30, "url"],
     ["Date Found", "date_found", 11], ["Determination", "determination", 26], ["Evidence", "evidence", 50, "wrap"]], d.history, 7);
  table(wb, "Conflicts", "CONFLICTS — Both values retained", "Resolve in the gold column",
    [["Company", "company", 24], ["Entity", "entity", 22], ["Field", "field", 12], ["Value A", "value_a", 28, "wrap"], ["Source A", "source_a", 22, "wrap"],
     ["Value B", "value_b", 28, "wrap"], ["Source B", "source_b", 22, "wrap"], ["Determination", "determination", 30, "wrap"], ["Evidence", "evidence", 40, "wrap"],
     ["Resolution (your input)", "resolution", 26, "wrap"]], d.conflicts, 8, ["resolution"]);

  // ---- Target List (Reference): your profiling sheet, verbatim
  const refRows = d.accounts.filter((a) => a.profile && a.profile["Vipin-Profiling"]).map((a) => ({ ...a.profile["UAE Targets v3"], ...a.profile["Vipin-Profiling"], "ICP Status (app)": a.icp_status }));
  if (refRows.length) {
    const keys = [...new Set(refRows.flatMap((r: Row) => Object.keys(r)))].filter((k) => k !== "Sl#");
    const order = ["Company", "ICP Status (app)", ...keys.filter((k) => k !== "Company" && k !== "ICP Status (app)")];
    table(wb, "Target List (Reference)", "TARGET LIST — Your profiling workbook (unchanged)", "Vipin-Profiling + UAE Targets v3 columns as written in FINAL-UAE-Target-LIST-V3.1",
      order.map((k) => [k, k, k === "Company" ? 32 : Math.min(40, Math.max(12, k.length + 2)), /url|website|linkedin/i.test(k) ? "url" : "wrap"] as Col),
      refRows.sort((a: Row, b: Row) => String(a.Company).localeCompare(String(b.Company))), 9);
  }

  // ---- Pivot Analysis (live COUNTIF formulas)
  const pv = wb.addWorksheet("Pivot Analysis", { properties: { tabColor: { argb: TABS[10] } } });
  banner(pv, "PIVOT ANALYSIS — Live summary tables", "Counts are formulas over the Accounts / Contacts tabs", 10);
  const letter = (n: number) => { let s = ""; for (n += 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
  const colOf = (cols: Col[], key: string) => letter(cols.findIndex((c) => c[1] === key) + 1); // +1 for the leading # column
  const rng = (sheet: string, cols: Col[], key: string) => `'${sheet}'!$${colOf(cols, key)}$${FIRST}:$${colOf(cols, key)}$${MAX}`;
  const uniq = (rows: Row[], key: string) => [...new Set(rows.map((r) => r[key] || "Unknown"))].sort();
  let r0 = 4;
  const pivot = (col: number, title: string, labels: string[], range: string) => {
    pv.getCell(r0, col).value = title; pv.getCell(r0, col).font = { name: FONT, bold: true, size: 11, color: { argb: HEADER } };
    ["Value", "Count"].forEach((h, i) => { const c = pv.getCell(r0 + 1, col + i); c.value = h; c.font = { name: FONT, bold: true, color: { argb: "FFFFFFFF" }, size: 9 };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E79" } }; });
    labels.forEach((l, i) => { pv.getCell(r0 + 2 + i, col).value = l; pv.getCell(r0 + 2 + i, col + 1).value = { formula: `COUNTIF(${range},"${String(l).replace(/"/g, "")}")` }; });
    r0 += labels.length + 4;
  };
  pivot(1, "ICP Status × Accounts", uniq(d.accounts, "icp_status"), rng("Accounts", accCols, "icp_status"));
  pivot(1, "S2P Signal × Accounts", SIG_ORDER, rng("Accounts", accCols, "s2p_signal_level"));
  pivot(1, "S2P Platform × Accounts", uniq(d.accounts, "existing_s2p_product"), rng("Accounts", accCols, "existing_s2p_product"));
  pivot(1, "S2P Status × Accounts", uniq(d.accounts, "s2p_platform_status"), rng("Accounts", accCols, "s2p_platform_status"));
  pivot(1, "Industry × Accounts", uniq(d.accounts, "industry"), rng("Accounts", accCols, "industry"));
  pivot(1, "Research Channel × Contacts", uniq(d.contacts, "research_channel"), rng("Contacts", conCols, "research_channel"));
  pivot(1, "Contact Tier × Contacts", uniq(d.contacts, "contact_tier"), rng("Contacts", conCols, "contact_tier"));
  pivot(1, "Email Status × Contacts", uniq(d.contacts, "email_status"), rng("Contacts", conCols, "email_status"));
  pivot(1, "Coupa Opportunity Type", uniq(d.accounts, "coupa_opportunity_type"), rng("Accounts", accCols, "coupa_opportunity_type"));
  pivot(1, "Ariba Opportunity Type", uniq(d.accounts, "ariba_opportunity_type"), rng("Accounts", accCols, "ariba_opportunity_type"));
  pv.getColumn(1).width = 44; pv.getColumn(2).width = 10;

  // ---- Executive Dashboard KPIs
  banner(dash, "ACCOUNT COPILOT — B2B Procurement Intelligence", `ICP: listed · revenue > USD 250M · 100+ employees · exported ${today}`, 12);
  const A = (k: string) => rng("Accounts", accCols, k), C = (k: string) => rng("Contacts", conCols, k);
  const kpis: [string, string][] = [
    ["Accounts", `COUNTA(${A("company_name")})`], ["ICP fit = Yes", `COUNTIF(${A("icp_fit")},"Yes")`],
    ["Strong / very strong", `COUNTIF(${A("s2p_signal_level")},"STRONG SIGNAL")+COUNTIF(${A("s2p_signal_level")},"VERY STRONG SIGNAL")`],
    ["Coupa accounts", `COUNTIF(${A("existing_s2p_product")},"*Coupa*")`], ["SAP Ariba accounts", `COUNTIF(${A("existing_s2p_product")},"*Ariba*")`],
    ["Contacts", `COUNTA(${C("full_name")})`], ["Verified contacts", `COUNTIF(${C("verification_status")},"VERIFIED")`],
    ["Emails verified active", `COUNTIF(${C("email_status")},"Verified Active")`], ["Conflicts retained", `COUNTA('Conflicts'!$D$${FIRST}:$D$${MAX})`],
  ];
  kpis.forEach(([label, f], i) => {
    const row = 4 + Math.floor(i / 3) * 4, col = 1 + (i % 3) * 4;
    dash.mergeCells(row, col, row, col + 2); dash.mergeCells(row + 1, col, row + 2, col + 2);
    for (let rr = row; rr <= row + 2; rr++) for (let cc = col; cc <= col + 2; cc++) dash.getCell(rr, cc).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F2744" } };
    dash.getCell(row, col).value = label.toUpperCase(); dash.getCell(row, col).font = { name: FONT, size: 8, bold: true, color: { argb: "FF8DB9EC" } };
    dash.getCell(row + 1, col).value = { formula: f }; dash.getCell(row + 1, col).font = { name: FONT, size: 24, bold: true, color: { argb: "FFFFFFFF" } };
    dash.getCell(row + 1, col).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  });
  for (let c = 1; c <= 12; c++) dash.getColumn(c).width = 12;

  const legend = wb.addWorksheet("Settings & Legend", { properties: { tabColor: { argb: TABS[11] } } });
  banner(legend, "LEGEND", "How to read this workbook", 2);
  [["Gold header / gold framed cells", "Your input — safe to edit"], ["Channel State = Claude", "Row added by Claude research"],
   ["Channel State = CoPilot / Claude-Seamless / …", "Reference row, carried unchanged"], ["Email Status 'Verified Active'", "Seamless.ai 'valid' on the company's own domain"],
   ["Unverified Email Candidate", "Catch-all domain; cannot be verified — never placed in Email"], ["Blank email", "Could not be reliably verified"],
   ["Nationality 'Not Publicly Verified'", "Never inferred"]].forEach(([k, v], i) => {
    legend.getCell(4 + i, 1).value = k; legend.getCell(4 + i, 2).value = v;
    legend.getCell(4 + i, 1).font = { name: FONT, size: 10, bold: true }; legend.getCell(4 + i, 2).font = { name: FONT, size: 10 };
  });
  legend.getColumn(1).width = 46; legend.getColumn(2).width = 60;

  return Buffer.from(await wb.xlsx.writeBuffer());
}
