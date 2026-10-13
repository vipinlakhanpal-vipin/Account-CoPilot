import "server-only";
import ExcelJS from "exceljs";
import type { AllData, Row } from "@/lib/data";
import { buildPeople } from "@/lib/people";
import { revenueOf, revenueIsOfficial } from "@/lib/icp";
import { regionOf } from "@/lib/icpDefinition.mjs";

// Campaign contact list: one row per person at the companies in a region, for uploading to a CRM or mailing tool.
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

export type CampaignOptions = { region: string; statuses: string[]; emailOnly: boolean; generatedBy: string; ids?: string[] };

export async function buildCampaignList(d: AllData, o: CampaignOptions) {
  const idSet = o.ids ? new Set(o.ids) : null;
  const accounts = d.accounts.filter((a) => (idSet ? idSet.has(a.id) : o.statuses.includes(s(a.icp_status))) && regionOf(a.country) === o.region);
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const people = buildPeople(d.contacts.filter((p) => byId.has(p.company_id))).filter((p) => p.trust !== "Conflicting");

  const rows = people.map((p) => {
    const a = byId.get(p.company_id)!;
    const email = cleanEmail(p.email) || p.rows.map((r) => cleanEmail(r.email)).find(Boolean) || "";
    const name = s(p.full_name), { first, last } = splitName(name), rev = revenueOf(a);
    return { company: s(a.company_name), name, first, last, title: s(p.title_verbatim), email, erp: known(a.erp).replace(/\s*\(.*$/, ""), s2p: known(a.existing_s2p_product),
      revenue: rev ? Math.round(rev) : "", revType: rev ? (revenueIsOfficial(a) ? "Official" : "Estimate") : "", employees: known(a.employee_range).replace(/\s*\(.*$/, ""),
      hq: [s(a.hq_city), s(a.country)].filter(Boolean).join(", "), tier: s(p.contact_tier) };
  }).filter((r) => r.name && (!o.emailOnly || r.email))
    .sort((x, y) => x.company.localeCompare(y.company) || x.tier.localeCompare(y.tier) || x.name.localeCompare(y.name));

  const companiesWithRows = new Set(rows.map((r) => r.company));
  const wb = new ExcelJS.Workbook();
  wb.creator = "Account CoPilot";
  const ws = wb.addWorksheet("Campaign List", { views: [{ state: "frozen", ySplit: 1 }] });
  const cols: [string, string, number][] = [
    ["Company Name", "company", 34], ["Contact Name", "name", 26], ["First Name", "first", 16], ["Last Name", "last", 20], ["Contact Job Title", "title", 40],
    ["Email ID", "email", 34], ["Existing ERP", "erp", 24], ["Existing S2P Platform", "s2p", 24], ["Net Revenue (USD M)", "revenue", 18],
    ["Revenue Type", "revType", 14], ["Total Employees", "employees", 16], ["HQ Location", "hq", 24],
  ];
  ws.columns = cols.map(([header, key, width]) => ({ header, key, width }));
  rows.forEach((r) => ws.addRow(r));
  const head = ws.getRow(1);
  head.height = 24;
  head.eachCell((c) => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F6E56" } };
    c.alignment = { vertical: "middle", wrapText: true }; });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  ws.getColumn("revenue").numFmt = "#,##0";

  const about = wb.addWorksheet("About this file");
  about.columns = [{ width: 26 }, { width: 90 }];
  [
    ["Generated", `${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC by ${o.generatedBy || "a team member"}`],
    ["Region", o.region],
    ["ICP statuses", idSet ? "All statuses (the list you opened)" : o.statuses.map((x) => x.replace("ICP — ", "")).join(", ")],
    ["Contacts in this file", String(rows.length)],
    ["Companies with a contact", `${companiesWithRows.size} of ${accounts.length}`],
    ["Email rule", o.emailOnly ? "Only people with an official email are included." : "People without an email are included; their Email ID is blank."],
    ["Emails", "Official company emails only. Generic mailboxes (info@, sales@ …) and personal domains are left out, and emails are never guessed."],
    ["Net Revenue", "USD millions. Revenue Type says whether the figure is Official (filing or results) or an Estimate."],
    ["Left out", "People whose sources conflict about who they are or where they work."],
  ].forEach((r) => about.addRow(r));
  about.getColumn(1).font = { bold: true };
  about.getColumn(2).alignment = { wrapText: true, vertical: "top" };

  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  return { buf, contacts: rows.length, companies: companiesWithRows.size, totalCompanies: accounts.length };
}
