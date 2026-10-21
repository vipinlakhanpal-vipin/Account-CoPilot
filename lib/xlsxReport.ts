import "server-only";
import ExcelJS from "exceljs";
import type { AllData, Row } from "@/lib/data";
import { buildPeople } from "@/lib/people";
import { revenueOf, revenueIsOfficial, fmtMoneyM, icpMatch, withDefaults, type Criteria } from "@/lib/icp";
import { regionOf, rulesFor } from "@/lib/icpDefinition.mjs";
import { playbookFor, startersFor, productsLabel, type Detected } from "@/lib/playbook";

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

export type CampaignOptions = { region: string; statuses: string[]; emailOnly: boolean; generatedBy: string; ids?: string[]; def?: unknown; limit?: number; rank?: "fit" | "revenue" | "name"; criteria?: Partial<Criteria> | null; product?: Detected };

const GREEN = "FF0F6E56", BAND = "FFF1F7F5", LINE = "FFD5DEDA";
type Out = { company: string; name: string; first: string; last: string; title: string; email: string; phone: string; linkedin: string; erp: string; s2p: string;
  revenue: string; revType: string; employees: string; hq: string; tier: string; unit: string };

export async function buildCampaignList(d: AllData, o: CampaignOptions) {
  const idSet = o.ids ? new Set(o.ids) : null;
  const accounts = d.accounts.filter((a) => (idSet ? idSet.has(a.id) : o.statuses.includes(s(a.icp_status))) && regionOf(a.country) === o.region);
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const people = buildPeople(d.contacts.filter((p) => byId.has(p.company_id))).filter((p) => p.trust !== "Conflicting");

  const rows: Out[] = people.map((p) => {
    const a = byId.get(p.company_id)!;
    const email = cleanEmail(p.email) || p.rows.map((r) => cleanEmail(r.email)).find(Boolean) || "";
    const name = s(p.full_name), { first, last } = splitName(name), rev = revenueOf(a);
    const cur = rulesFor(o.def, a.country).currency as { code: string; per_usd: number };
    // Phones exactly as stored (never guessed); a person with several numbers across sources gets them all, once each.
    const seenNo = new Set<string>(), phone = p.rows.flatMap((r) => s(r.phone).split(/[;/]/)).map((x) => x.trim()).filter((x) => {
      const digits = x.replace(/\D/g, ""); if (digits.length < 7 || seenNo.has(digits)) return false; seenNo.add(digits); return true; }).join(" / ");
    return { company: s(a.company_name), name, first, last, title: s(p.title_verbatim), email, phone, linkedin: s(p.linkedin_url) || p.rows.map((r) => s(r.linkedin_url)).find(Boolean) || "", erp: known(a.erp).replace(/\s*\(.*$/, ""),
      s2p: known(a.existing_s2p_product), revenue: rev ? fmtMoneyM(rev, cur) : "",
      revType: rev ? (revenueIsOfficial(a) ? "Official" : "Estimate") : "", employees: known(a.employee_range).replace(/\s*\(.*$/, ""),
      hq: [s(a.hq_city), s(a.country)].filter(Boolean).join(", "), tier: s(p.contact_tier), unit: s(p.business_unit) };
  }).filter((r) => r.name && (!o.emailOnly || r.email || r.phone || r.linkedin)) // reachable: an official email, a phone or a LinkedIn profile
    .sort((x, y) => x.company.localeCompare(y.company) || (x.unit ? 1 : 0) - (y.unit ? 1 : 0) || x.unit.localeCompare(y.unit) || x.tier.localeCompare(y.tier) || x.name.localeCompare(y.name));
  // A company with a property or business unit (for example Kerzner International under Atlantis, The Palm) names the account's own contacts "Main account", so the tree reads: company, then group contacts, then each property.
  const hasUnits = new Set(rows.filter((r) => r.unit).map((r) => r.company));
  rows.forEach((r) => { if (hasUnits.has(r.company) && !r.unit) r.unit = "Main account"; });

  // One block per company, so each company is listed once with its people beneath it.
  const groups: Out[][] = [];
  for (const r of rows) { const g = groups[groups.length - 1]; if (g && g[0].company === r.company) g.push(r); else groups.push([r]); }
  // "Up to N companies": keep the N companies you asked for, picked by best ICP fit (default), largest revenue, or A to Z.
  const totalWithContacts = groups.length;
  const rank = o.rank || "fit";
  if (o.limit || rank !== "fit") {
    const base = withDefaults(o.criteria), score = new Map<string, number>();
    accounts.forEach((a) => score.set(s(a.company_name), rank === "revenue" ? revenueOf(a) || 0
      : rank === "name" ? 0 : icpMatch(a, { ...base, company: { ...base.company, countries: [s(a.country) || "UAE"], regions: [] } }).total));
    groups.sort((x, y) => rank === "name" ? x[0].company.localeCompare(y[0].company)
      : (score.get(y[0].company) || 0) - (score.get(x[0].company) || 0) || x[0].company.localeCompare(y[0].company));
    if (o.limit && groups.length > o.limit) groups.length = o.limit;
  }
  const companies = groups.length, contacts = groups.reduce((n, g) => n + g.length, 0);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Account CoPilot";
  const cols: [string, keyof Out, number][] = [
    ["Company Name", "company", 34], ["Property / Business Unit", "unit", 24], ["Contact Name", "name", 26], ["First Name", "first", 16], ["Last Name", "last", 20], ["Contact Job Title", "title", 40],
    ["Email ID", "email", 34], ["Phone (Tel / Mobile)", "phone", 24], ["LinkedIn Profile", "linkedin", 34], ["Existing ERP", "erp", 24], ["Existing S2P Platform", "s2p", 24], ["Net Revenue (USD, local in brackets)", "revenue", 30],
    ["Revenue Type", "revType", 14], ["Total Employees", "employees", 16], ["HQ Location", "hq", 24],
  ];
  const styleHeader = (row: ExcelJS.Row) => {
    row.height = 26;
    row.eachCell((c) => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN } };
      c.alignment = { vertical: "middle", wrapText: true }; });
  };

  // One sheet only: grouped by company, with the totals up top
  const ws = wb.addWorksheet("Campaign List", { views: [{ state: "frozen", ySplit: 4, showGridLines: false }] });
  ws.columns = cols.map(([, , width]) => ({ width }));
  ws.mergeCells(1, 1, 1, 6);
  ws.getCell(1, 1).value = "Account CoPilot — campaign contact list";
  ws.getCell(1, 1).font = { bold: true, size: 15, color: { argb: GREEN } };
  ws.mergeCells(2, 1, 2, cols.length);
  ws.getCell(2, 1).value = `Region: ${o.region}   |   Companies: ${companies} of ${accounts.length} selected${totalWithContacts > companies ? ` (${companies} of ${totalWithContacts} with contacts, picked by ${rank === "revenue" ? "largest revenue" : rank === "name" ? "name, A to Z" : "best ICP fit"})` : ""}   |   Contacts: ${contacts}`;
  ws.getCell(2, 1).font = { bold: true, size: 12 };
  ws.mergeCells(3, 1, 3, cols.length);
  ws.getCell(3, 1).value = `Each company is listed once with its contacts beneath it. Revenue is in USD, with the regional currency in brackets. ${accounts.length - totalWithContacts} of the ${accounts.length} companies have no contact${o.emailOnly ? " with an email, phone or LinkedIn profile" : ""} on file and are not listed.`;
  ws.getCell(3, 1).font = { italic: true, color: { argb: "FF5B6670" } };
  ws.getCell(3, 1).alignment = { wrapText: true, vertical: "top" };
  ws.getRow(3).height = 30;
  cols.forEach(([h], i) => { ws.getCell(4, i + 1).value = h; });
  styleHeader(ws.getRow(4));

  const COMPANY_KEYS = ["company", "erp", "s2p", "revenue", "revType", "employees", "hq"]; // merged down the group
  const COMPANY_LEVEL = cols.map(([, key], i) => (COMPANY_KEYS.includes(key as string) ? i + 1 : 0)).filter(Boolean);
  let r = 5;
  groups.forEach((g, gi) => {
    const start = r;
    g.forEach((p, i) => {
      cols.forEach(([, key], ci) => {
        // company-level values are written once, on the group's first row
        if (i > 0 && COMPANY_LEVEL.includes(ci + 1)) return;
        ws.getCell(r, ci + 1).value = key === "linkedin" && p.linkedin ? { text: p.linkedin, hyperlink: p.linkedin } : (p[key] as string);
      });
      r++;
    });
    const end = r - 1;
    for (let rr = start; rr <= end; rr++) for (let c = 1; c <= cols.length; c++) {
      const cell = ws.getCell(rr, c);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: gi % 2 ? "FFFFFFFF" : BAND } };
      cell.alignment = { vertical: "top", wrapText: true };
      cell.border = { top: rr === start ? { style: "thin", color: { argb: GREEN } } : undefined, bottom: rr === end ? { style: "hair", color: { argb: LINE } } : undefined };
    }
    if (end > start) COMPANY_LEVEL.forEach((c) => ws.mergeCells(start, c, end, c));
    ws.getCell(start, 1).font = { bold: true };
  });

  // A search that names a product (Coupa, SAP Ariba, another platform) also gets a Playbook sheet and a Discovery Questions sheet.
  if (o.product?.products.length) {
    const names = new Set(groups.map((g) => g[0].company));
    const picked = accounts.filter((a) => names.has(s(a.company_name)));
    const plays = playbookFor(o.product), label = productsLabel(o.product);
    const head = (sh: ExcelJS.Worksheet, row: number, labels: string[]) => { labels.forEach((h, i) => { sh.getCell(row, i + 1).value = h; }); styleHeader(sh.getRow(row)); };
    const wrap = (sh: ExcelJS.Worksheet, from: number, to: number, nCols: number) => { for (let rr = from; rr <= to; rr++) for (let c = 1; c <= nCols; c++) { const cell = sh.getCell(rr, c);
      cell.alignment = { vertical: "top", wrapText: true }; cell.border = { bottom: { style: "hair", color: { argb: LINE } } }; } };

    const pb = wb.addWorksheet("Playbook", { views: [{ state: "frozen", ySplit: 3, showGridLines: false }] });
    pb.columns = [{ width: 26 }, { width: 34 }, { width: 90 }, { width: 30 }];
    pb.mergeCells(1, 1, 1, 4); pb.getCell(1, 1).value = `Playbook — ${label} (${o.product.mode === "customers" ? "existing customers" : "new business"})`;
    pb.getCell(1, 1).font = { bold: true, size: 15, color: { argb: GREEN } };
    pb.mergeCells(2, 1, 2, 4); pb.getCell(2, 1).value = "A working guide for the accounts in this file. It holds method and questions to test, not figures or customer stories: add SCP's own approved references before you share it with a customer. Anything the app estimated is marked as an estimate.";
    pb.getCell(2, 1).font = { italic: true, color: { argb: "FF5B6670" } }; pb.getCell(2, 1).alignment = { wrapText: true, vertical: "top" }; pb.getRow(2).height = 32;
    let pr = 3;
    for (const pl of plays) {
      if (plays.length > 1) { pb.mergeCells(pr, 1, pr, 4); pb.getCell(pr, 1).value = pl.product; pb.getCell(pr, 1).font = { bold: true, size: 13, color: { argb: GREEN } }; pr++; }
      head(pb, pr, ["Section", "Play", "Detail", "Use it when"]); pr++;
      const first = pr; let last = "";
      for (const row of pl.rows) { pb.getCell(pr, 1).value = row.section === last ? "" : row.section; pb.getCell(pr, 1).font = { bold: true }; last = row.section;
        pb.getCell(pr, 2).value = row.point; pb.getCell(pr, 2).font = { bold: true }; pb.getCell(pr, 3).value = row.detail; pb.getCell(pr, 4).value = row.use; pr++; }
      wrap(pb, first, pr - 1, 4); pr++;
    }
    // Where each account starts, from the ERP, S2P platform and signal the app holds.
    const st = startersFor(picked, o.product);
    pb.getCell(pr, 1).value = "Where each account starts"; pb.getCell(pr, 1).font = { bold: true, size: 13, color: { argb: GREEN } }; pr++;
    pb.mergeCells(pr, 1, pr, 4); pb.getCell(pr, 1).value = "Worked out from the ERP, S2P platform and signal level on file for each company. Check it against the account page before you act."; pb.getCell(pr, 1).font = { italic: true, color: { argb: "FF5B6670" } }; pr++;
    const cols2 = ["Company", "ERP / S2P platform", "Signal / status", "Starting play and who to lead with"];
    head(pb, pr, cols2); pr++;
    const f2 = pr;
    st.forEach((x) => { pb.getCell(pr, 1).value = x.company; pb.getCell(pr, 1).font = { bold: true }; pb.getCell(pr, 2).value = [x.erp && `ERP: ${x.erp}`, x.s2p && `S2P: ${x.s2p}`].filter(Boolean).join("\n") || "—";
      pb.getCell(pr, 3).value = `${x.signal} / ${x.status}`; pb.getCell(pr, 4).value = `${x.play}\nLead with: ${x.lead}.`; pr++; });
    wrap(pb, f2, pr - 1, 4);

    const dq = wb.addWorksheet("Discovery Questions", { views: [{ state: "frozen", ySplit: 3, showGridLines: false }] });
    dq.columns = [{ width: 5 }, { width: 22 }, { width: 62 }, { width: 40 }, { width: 44 }, { width: 24 }];
    dq.mergeCells(1, 1, 1, 6); dq.getCell(1, 1).value = `Discovery questions — ${label}`; dq.getCell(1, 1).font = { bold: true, size: 15, color: { argb: GREEN } };
    dq.mergeCells(2, 1, 2, 6); dq.getCell(2, 1).value = "Ask them in the buyer's own words, and write down the answer. Leave each meeting with the pain, the process, the systems, the decision path and a date.";
    dq.getCell(2, 1).font = { italic: true, color: { argb: "FF5B6670" } }; dq.getCell(2, 1).alignment = { wrapText: true, vertical: "top" };
    let dr = 3;
    for (const pl of plays) {
      if (plays.length > 1) { dq.mergeCells(dr, 1, dr, 6); dq.getCell(dr, 1).value = pl.product; dq.getCell(dr, 1).font = { bold: true, size: 13, color: { argb: GREEN } }; dr++; }
      head(dq, dr, ["#", "Topic", "Question", "Why we ask", "Listen for", "Best asked of"]); dr++;
      const first = dr;
      pl.questions.forEach((q, i) => { dq.getCell(dr, 1).value = i + 1; dq.getCell(dr, 2).value = q.topic; dq.getCell(dr, 2).font = { bold: true }; dq.getCell(dr, 3).value = q.q; dq.getCell(dr, 4).value = q.why; dq.getCell(dr, 5).value = q.listen; dq.getCell(dr, 6).value = q.who; dr++; });
      wrap(dq, first, dr - 1, 6); dr++;
    }
  }

  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  return { buf, contacts, companies, totalCompanies: accounts.length };
}
