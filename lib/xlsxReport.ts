import "server-only";
import ExcelJS from "exceljs";
import type { AllData, Row } from "@/lib/data";
import { buildPeople } from "@/lib/people";
import { revenueOf, revenueIsOfficial, fmtMoneyM } from "@/lib/icp";
import { regionOf, rulesFor } from "@/lib/icpDefinition.mjs";

// Campaign contact list: the people at the companies in a region, for a CRM or mailing tool.
// Same rules as the Master Book's Contact List: official emails only (no generic mailboxes or personal domains), never guessed,
// and people whose sources conflict are left out.
const PERSONAL = /@(gmail|googlemail|hotmail|outlook|live|yahoo|icloud|me|aol|proton(mail)?|gmx|yandex|mail)\./i;
const GENERIC = /^(info|sales|contact|enquiries|inquiries|admin|office|hello|support|marketing|hr|careers|jobs|procurement|purchasing|finance|accounts|tenders?)@/i;
const cleanEmail = (e: unknown) => { const v = String(e || "").trim(); return v && !PERSONAL.test(v) && !GENERIC.test(v) ? v : ""; };
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const UNKNOWN = /^(unknown|no evidence|none|not[ _](identified|found|public)|n\/a)$/i;
const known = (v: unknown) => { const t = s(v); return t && !UNKNOWN.test(t) ? t : ""; };
const splitName = (full: string) => {
  const parts = full.replace(/^(dr|eng|mr|ms|mrs|h\.?e)\.?\s+/i, "").trim().split(/\s+/).filter(Boolean);
  return { first: parts[0] || "", last: parts.slice(1).join(" ") };
};

export type CampaignOptions = { region: string; statuses: string[]; emailOnly: boolean; generatedBy: string; ids?: string[]; def?: unknown };

const GREEN = "FF0F6E56", BAND = "FFF1F7F5", LINE = "FFD5DEDA";
type Out = { company: string; name: string; first: string; last: string; title: string; email: string; erp: string; s2p: string;
  revenue: string; revType: string; employees: string; hq: string; tier: string };
export type CampaignData = { groups: Out[][]; contacts: number; companies: number; accounts: number };

/** One row per person at the given accounts, grouped by company. Shared by the Reports Excel and the Master Book's Contact List. */
export function campaignData(d: AllData, accounts: Row[], o: { emailOnly: boolean; def?: unknown }): CampaignData {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const people = buildPeople(d.contacts.filter((p) => byId.has(p.company_id))).filter((p) => p.trust !== "Conflicting");
  const rows: Out[] = people.map((p) => {
    const a = byId.get(p.company_id)!;
    const email = cleanEmail(p.email) || p.rows.map((r) => cleanEmail(r.email)).find(Boolean) || "";
    const name = s(p.full_name), { first, last } = splitName(name), rev = revenueOf(a);
    const cur = rulesFor(o.def, a.country).currency as { code: string; per_usd: number };
    return { company: s(a.company_name), name, first, last, title: s(p.title_verbatim), email, erp: known(a.erp).replace(/\s*\(.*$/, ""),
      s2p: known(a.existing_s2p_product), revenue: rev ? fmtMoneyM(rev, cur) : "", revType: rev ? (revenueIsOfficial(a) ? "Official" : "Estimate") : "",
      employees: known(a.employee_range).replace(/\s*\(.*$/, ""), hq: [s(a.hq_city), s(a.country)].filter(Boolean).join(", "), tier: s(p.contact_tier) };
  }).filter((r) => r.name && (!o.emailOnly || r.email))
    .sort((x, y) => x.company.localeCompare(y.company) || x.tier.localeCompare(y.tier) || x.name.localeCompare(y.name));
  const groups: Out[][] = [];
  for (const r of rows) { const g = groups[groups.length - 1]; if (g && g[0].company === r.company) g.push(r); else groups.push([r]); }
  return { groups, contacts: rows.length, companies: groups.length, accounts: accounts.length };
}

const COLS: [string, keyof Out, number][] = [
  ["Company Name", "company", 34], ["Contact Name", "name", 26], ["First Name", "first", 16], ["Last Name", "last", 20], ["Contact Job Title", "title", 40],
  ["Email ID", "email", 34], ["Existing ERP", "erp", 24], ["Existing S2P Platform", "s2p", 24], ["Net Revenue (USD, local in brackets)", "revenue", 30],
  ["Revenue Type", "revType", 14], ["Total Employees", "employees", 16], ["HQ Location", "hq", 24],
];
/** Row where the contacts start on the sheet written by writeCampaignSheet (the header is row 4). */
export const CAMPAIGN_FIRST_ROW = 5;

/** Writes the grouped Campaign List layout: totals at the top, each company once with its contacts beneath it. */
export function writeCampaignSheet(wb: ExcelJS.Workbook, name: string, data: CampaignData, m: { scope: string; emailOnly: boolean; tab?: string }) {
  const ws = wb.addWorksheet(name, { properties: m.tab ? { tabColor: { argb: m.tab } } : {}, views: [{ state: "frozen", ySplit: 4, showGridLines: false }] });
  ws.columns = COLS.map(([, , width]) => ({ width }));
  ws.mergeCells(1, 1, 1, 6);
  ws.getCell(1, 1).value = "Account CoPilot — campaign contact list";
  ws.getCell(1, 1).font = { bold: true, size: 15, color: { argb: GREEN } };
  ws.mergeCells(2, 1, 2, 12);
  ws.getCell(2, 1).value = `Region: ${m.scope}   |   Companies: ${data.companies} of ${data.accounts} selected   |   Contacts: ${data.contacts}`;
  ws.getCell(2, 1).font = { bold: true, size: 12 };
  ws.mergeCells(3, 1, 3, 12);
  ws.getCell(3, 1).value = `Each company is listed once with its contacts beneath it. Revenue is in USD, with the regional currency in brackets. ${data.accounts - data.companies} of the ${data.accounts} companies have no contact${m.emailOnly ? " with an official email" : ""} on file and are not listed.`;
  ws.getCell(3, 1).font = { italic: true, color: { argb: "FF5B6670" } };
  ws.getCell(3, 1).alignment = { wrapText: true, vertical: "top" };
  ws.getRow(3).height = 30;
  COLS.forEach(([h], i) => { ws.getCell(4, i + 1).value = h; });
  const head = ws.getRow(4);
  head.height = 26;
  head.eachCell((c) => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN } };
    c.alignment = { vertical: "middle", wrapText: true }; });

  const COMPANY_LEVEL = [1, 7, 8, 9, 10, 11, 12]; // company, ERP, S2P, revenue, revenue type, employees, HQ: merged down the group
  let r = CAMPAIGN_FIRST_ROW;
  data.groups.forEach((g, gi) => {
    const start = r;
    g.forEach((p, i) => {
      COLS.forEach(([, key], ci) => {
        if (i > 0 && COMPANY_LEVEL.includes(ci + 1)) return; // company-level values are written once, on the group's first row
        ws.getCell(r, ci + 1).value = p[key] as string;
      });
      r++;
    });
    const end = r - 1;
    for (let rr = start; rr <= end; rr++) for (let c = 1; c <= COLS.length; c++) {
      const cell = ws.getCell(rr, c);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: gi % 2 ? "FFFFFFFF" : BAND } };
      cell.alignment = { vertical: "top", wrapText: true };
      cell.border = { top: rr === start ? { style: "thin", color: { argb: GREEN } } : undefined, bottom: rr === end ? { style: "hair", color: { argb: LINE } } : undefined };
    }
    if (end > start) COMPANY_LEVEL.forEach((c) => ws.mergeCells(start, c, end, c));
    ws.getCell(start, 1).font = { bold: true };
  });
  return ws;
}

export async function buildCampaignList(d: AllData, o: CampaignOptions) {
  const idSet = o.ids ? new Set(o.ids) : null;
  const accounts = d.accounts.filter((a) => (idSet ? idSet.has(a.id) : o.statuses.includes(s(a.icp_status))) && regionOf(a.country) === o.region);
  const data = campaignData(d, accounts, { emailOnly: o.emailOnly, def: o.def });
  const wb = new ExcelJS.Workbook();
  wb.creator = "Account CoPilot";
  writeCampaignSheet(wb, "Campaign List", data, { scope: o.region, emailOnly: o.emailOnly });
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  return { buf, contacts: data.contacts, companies: data.companies, totalCompanies: data.accounts };
}
