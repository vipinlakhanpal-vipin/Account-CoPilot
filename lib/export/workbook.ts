import "server-only";
import ExcelJS from "exceljs";
import type { AllData, Row } from "@/lib/data";
import { buildPeople } from "@/lib/people";
import { fetchLogos, logoDomain } from "@/lib/logo";
import { personaFit } from "@/lib/icp";
import { rulesFor } from "@/lib/icpDefinition.mjs";

type Logos = { map: Map<string, { buf: Buffer; ext: "png" | "jpeg" }>; get: (r: Row) => string; ids: Map<string, number> };

// Design: Nunito 12 throughout (Excel falls back to a similar font if Nunito isn't installed), navy + white, soft banding,
// hairline row dividers, no gridlines, status values shown as coloured tags.
const FONT = "Nunito";
const SIZE = 12;
const INK = "FF1E2A3A", MUTED = "FF5B6B80", LINK = "FF1D5FB8";
const NAVY = "FF14283F", NAVY_2 = "FF1F3A5F", SUB = "FFB9CCE4";
const HEADER = NAVY_2;
const HUBSPOT_HEADER = "FF0E6E62";
const INPUT_HEADER = "FFB07D12";
const INPUT_FILL = "FFFFF6DD";
const INPUT_BORDER = "FFD9A93A";
const BAND = "FFF6F8FB";
const RULE = "FFE3E8EF";
// value → [fill, text]
const TAGS: Record<string, [string, string]> = {
  "VERY STRONG SIGNAL": ["FFD5F0E4", "FF0B6B45"], "STRONG SIGNAL": ["FFE3F5EC", "FF1F7A55"], "MODERATE SIGNAL": ["FFFFF1D6", "FF8A5A00"],
  "WEAK SIGNAL": ["FFF4F1EA", "FF6B5E45"], "NO SIGNAL": ["FFF1F3F6", "FF6B7280"], "CONFLICTING SIGNAL": ["FFFDE7E7", "FF9B1C1C"],
  "ICP — Verified": ["FFD5F0E4", "FF0B6B45"], "ICP — Likely": ["FFE1ECFB", "FF1D4F91"], "ICP — Needs check": ["FFFFF1D6", "FF8A5A00"],
  "Not ICP": ["FFF1F3F6", "FF6B7280"], "Unknown": ["FFF1F3F6", "FF6B7280"],
  "Skip — contact already in HubSpot": ["FFFDE7E7", "FF9B1C1C"], "Add contact to existing HubSpot company": ["FFFFF1D6", "FF8A5A00"],
  "New company + contact": ["FFD5F0E4", "FF0B6B45"],
  "Matches your personas": ["FFD5F0E4", "FF0B6B45"], "Partly matches": ["FFFFF1D6", "FF8A5A00"], "Outside your personas": ["FFF1F3F6", "FF6B7280"],
};
const YES_NO: Record<string, [string, string]> = { Yes: ["FFE1ECFB", "FF1D4F91"], No: ["FFF1F3F6", "FF6B7280"] };
const YES_NO_KEYS = new Set(["scp_customer", "hs_contact", "hs_in"]);
const HUBSPOT_KEYS = new Set(["scp_customer", "hs_stage", "hs_owner", "hs_deals", "hs_latest", "hs_contact", "hs_action", "hs_in"]);
const SIGNALS = TAGS;
// Tab colours by purpose: summary, outreach, accounts, evidence, reference
const TABS = ["FF14283F", "FF0E8C7A", "FF0E6E62", "FF1F3A5F", "FF2E5E8C", "FF3F7CB5", "FF6B7A8F", "FF8792A3", "FFB07D12", "FFC9A24A", "FF1F3A5F", "FF14283F"];
const SIG_ORDER = ["VERY STRONG SIGNAL", "STRONG SIGNAL", "MODERATE SIGNAL", "WEAK SIGNAL", "NO SIGNAL", "CONFLICTING SIGNAL"];
const rank = (s: string) => { const i = SIG_ORDER.indexOf(s); return i < 0 ? 9 : i; };
const f = (o: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> => ({ name: FONT, size: SIZE, color: { argb: INK }, ...o });
const fill = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

type Col = [header: string, key: string, width: number, kind?: "url" | "wrap" | "num" | "usd"];
// Values are USD millions; displays $6.04B / $600M while staying numeric for sorting.
const USD_FMT = '[>=1000]"$"#,##0.00,"B";"$"#,##0"M"';
const FIRST = 4, MAX = 3000;
const W = (w: number) => Math.round(w * 1.18); // wider columns for the 12pt font

function banner(ws: ExcelJS.Worksheet, title: string, subtitle: string, n: number) {
  const last = Math.max(n, 6);
  ws.mergeCells(1, 1, 1, last); ws.mergeCells(2, 1, 2, last);
  ws.getCell(1, 1).value = title; ws.getCell(2, 1).value = subtitle;
  for (let c = 1; c <= last; c++) { ws.getCell(1, c).fill = fill(NAVY); ws.getCell(2, c).fill = fill(NAVY); }
  ws.getCell(1, 1).font = f({ size: 20, bold: true, color: { argb: "FFFFFFFF" } });
  ws.getCell(2, 1).font = f({ size: 11, color: { argb: SUB } });
  ws.getCell(1, 1).alignment = { vertical: "middle", indent: 1 }; ws.getCell(2, 1).alignment = { vertical: "top", indent: 1 };
  ws.getRow(1).height = 38; ws.getRow(2).height = 24;
}

function table(wb: ExcelJS.Workbook, name: string, title: string, subtitle: string, colsIn: Col[], rowsIn: Row[], tab: number, inputs: string[] = [], logos?: Logos) {
  const cols: Col[] = [["#", "__n", 6, "num"], ...(logos ? [["", "__logo", 4] as Col] : []), ...colsIn];
  const rows: Row[] = rowsIn.map((r, i) => ({ ...r, __n: i + 1 }));
  const ws = wb.addWorksheet(name, { properties: { tabColor: { argb: TABS[tab % TABS.length] } },
    views: [{ state: "frozen", xSplit: logos ? 3 : 2, ySplit: 3, zoomScale: 90, showGridLines: false }] });
  banner(ws, title, subtitle, cols.length);
  cols.forEach(([h, key, w], i) => {
    const cell = ws.getCell(3, i + 1);
    cell.value = h;
    cell.fill = fill(inputs.includes(key) ? INPUT_HEADER : HUBSPOT_KEYS.has(key) ? HUBSPOT_HEADER : HEADER);
    cell.font = f({ bold: true, color: { argb: "FFFFFFFF" } });
    cell.alignment = { wrapText: true, vertical: "middle", horizontal: key === "__n" ? "center" : "left", indent: key === "__n" ? 0 : 1 };
    cell.border = { bottom: { style: "medium", color: { argb: NAVY } } };
    ws.getColumn(i + 1).width = key === "__n" ? 7 : key === "__logo" ? 4.5 : W(w);
  });
  ws.getRow(3).height = 42;
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
        cell.font = f({ color: { argb: LINK }, underline: true });
      } else {
        cell.value = (kind === "num" || kind === "usd") && v !== "" && isFinite(Number(v)) ? Number(v) : String(v);
        cell.font = key === "__n" ? f({ color: { argb: MUTED }, size: 10 }) : f();
      }
      if (kind === "num") cell.numFmt = "#,##0";
      if (kind === "usd") cell.numFmt = USD_FMT;
      const numeric = kind === "num" || kind === "usd";
      cell.alignment = { vertical: kind === "wrap" ? "top" : "middle", wrapText: kind === "wrap", horizontal: key === "__n" ? "center" : numeric ? "right" : "left", indent: numeric || key === "__n" ? 0 : 1 };
      cell.fill = fill(isInput ? INPUT_FILL : ri % 2 ? BAND : "FFFFFFFF");
      cell.border = isInput
        ? { top: { style: "thin", color: { argb: INPUT_BORDER } }, left: { style: "thin", color: { argb: INPUT_BORDER } }, bottom: { style: "thin", color: { argb: INPUT_BORDER } }, right: { style: "thin", color: { argb: INPUT_BORDER } } }
        : { bottom: { style: "hair", color: { argb: RULE } } };
      const tag = TAGS[String(v)] || (YES_NO_KEYS.has(key) ? YES_NO[String(v)] : undefined);
      if (tag) { cell.fill = fill(tag[0]); cell.font = f({ bold: true, color: { argb: tag[1] } }); }
    });
  });
  // Company logos: a 16px image inside the row (placed over the cell, so row heights don't change); one embedded copy per company.
  if (logos) rows.forEach((r, ri) => {
    const d = logos.get(r), l = d ? logos.map.get(d) : undefined;
    if (!l) return;
    let id = logos.ids.get(d);
    if (id === undefined) { id = wb.addImage({ buffer: l.buf as unknown as ExcelJS.Buffer, extension: l.ext }); logos.ids.set(d, id); }
    ws.addImage(id, { tl: { col: 1.2, row: FIRST - 1 + ri + 0.14 } as ExcelJS.Anchor, ext: { width: 16, height: 16 }, editAs: "oneCell" });
  });
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: cols.length } };
  ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "3:3",
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
  ws.headerFooter = { oddFooter: `&L&"${FONT}"&9Account CoPilot · ${name}&R&"${FONT}"&9Page &P of &N` };
  return ws;
}

export async function buildWorkbook(d: AllData, icpDef?: unknown): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Account CoPilot";
  wb.calcProperties.fullCalcOnLoad = true;
  const today = new Date().toISOString().slice(0, 10);
  const logoMap = await fetchLogos(d.accounts.map(logoDomain));
  const accLogos: Logos = { map: logoMap, get: (r) => logoDomain(r), ids: new Map() };
  const conLogos: Logos = { map: logoMap, get: (r) => String(r.__domain || ""), ids: accLogos.ids };
  const dash = wb.addWorksheet("Executive Dashboard", { properties: { tabColor: { argb: TABS[0] } }, views: [{ showGridLines: false }] });

  // Contact List — clean, outreach-ready: one row per person (all sources merged), only the nine agreed fields.
  // Kept: people with at least one way to reach them (email, phone or LinkedIn) whose sources don't conflict.
  // Official email only: generic mailboxes (info@, sales@ …) and personal domains (gmail, hotmail …) are left blank. Emails are never guessed.
  const PERSONAL = /@(gmail|googlemail|hotmail|outlook|live|yahoo|icloud|me|aol|proton(mail)?|gmx|yandex|mail)\./i;
  const GENERIC = /^(info|sales|contact|enquiries|inquiries|admin|office|hello|support|marketing|hr|careers|jobs|procurement|purchasing|finance|accounts|tenders?)@/i;
  const coById = new Map(d.accounts.map((a) => [a.id, a]));
  const cleanEmail = (e: unknown) => { const v = String(e || "").trim(); return v && !PERSONAL.test(v) && !GENERIC.test(v) ? v : ""; };
  const contactRows = buildPeople(d.contacts).filter((p) => p.trust !== "Conflicting").map((p): Row => {
    const co = coById.get(p.company_id) || {};
    const phones = [...new Set(p.rows.map((r) => String(r.phone || "").trim()).filter(Boolean))];
    const email = cleanEmail(p.email) || p.rows.map((r) => cleanEmail(r.email)).find(Boolean) || "";
    const hs = co.profile?.["HubSpot"];
    const pf = personaFit(p, rulesFor(icpDef, co.country).personas); // buyer personas from Define ICP
    return { __domain: logoDomain(co), persona_score: pf.label === "No personas set" ? "" : pf.score, persona_label: pf.label === "No personas set" ? "" : pf.label, persona_why: pf.why,
      company: p.company || co.company_name || "", website: co.company_website || (co.domain ? `https://${co.domain}` : ""),
      full_name: p.full_name, title: p.title_verbatim, phone: phones.join(" / "), email,
      location: p.location || [co.hq_city, co.country].filter(Boolean).join(", "), linkedin: p.linkedin_url || "",
      ...hubspotCols(hs, email) };
  }).filter((r) => r.email || r.phone || r.linkedin)
    .sort((a, b) => String(a.company).localeCompare(String(b.company)) || (Number(b.persona_score) || 0) - (Number(a.persona_score) || 0) || String(a.full_name).localeCompare(String(b.full_name)));
  const listCols: Col[] = [["Company Name", "company", 30], ["Company Website", "website", 26, "url"], ["Contact Person (Full Name)", "full_name", 26], ["Job Title", "title", 34, "wrap"], ["Persona Fit %", "persona_score", 11, "num"], ["Persona Match", "persona_label", 20],
      ["Phone (Tel / Mobile)", "phone", 22], ["Official Email", "email", 30], ["Location", "location", 20], ["LinkedIn Profile", "linkedin", 32, "url"],
      ["Company in HubSpot", "scp_customer", 14], ["Company Stage (HubSpot)", "hs_stage", 20], ["Company Owner (HubSpot)", "hs_owner", 22],
      ["Deals (HubSpot)", "hs_deals", 26, "wrap"], ["Latest Deal (HubSpot)", "hs_latest", 44, "wrap"], ["Contact in HubSpot", "hs_contact", 14],
      ["HubSpot Import Action", "hs_action", 30, "wrap"]];
  table(wb, "Contact List", "CONTACT LIST — Outreach-ready contacts",
    `Exported ${today} · one row per person, best buyer-persona fit first within each company (Define ICP) · official emails only, never guessed · teal columns from SCP's HubSpot`,
    listCols, contactRows, 1, [], conLogos);

  // HubSpot deals linked to profiled companies (read-only copy; stays inside this app and its export)
  const dealRows = d.accounts.flatMap((a) => (a.profile?.["HubSpot"]?.deals || []).map((x: Row) => ({ company: a.company_name, hs_name: a.profile["HubSpot"].hubspot_name,
    deal: x.name, stage: x.stage, amount: x.amount ?? "", close: x.close, owner: a.profile["HubSpot"].owner })))
    .sort((a, b) => String(a.company).localeCompare(String(b.company)) || String(b.close).localeCompare(String(a.close)));
  table(wb, "HubSpot Deals", "HUBSPOT DEALS — Deals on profiled companies",
    `Exported ${today} · read-only from SCP HubSpot · company matched by domain, then name`,
    [["Company (app)", "company", 30], ["Company (HubSpot)", "hs_name", 28], ["Deal", "deal", 44, "wrap"], ["Deal Stage", "stage", 16], ["Amount", "amount", 14, "usd"],
      ["Close Date", "close", 12], ["Company Owner", "owner", 22]], dealRows, 2);

  const accCols: Col[] = [
    ["Company", "company_name", 30], ["Website", "company_website", 24, "url"], ["Country", "country", 9], ["Exchange", "exchange", 10], ["Ticker", "ticker", 10],
    ["Industry", "industry", 20], ["ICP Status", "icp_status", 18], ["Status Since", "status_since", 12], ["Date Added", "date_added", 12], ["Last Updated", "date_updated", 12], ["ICP Reason", "icp_fit_reason", 44, "wrap"], ["Listing", "listing_status", 14], ["Lists", "lists_text", 26], ["In HubSpot", "hs_in", 11], ["HubSpot Stage", "hs_stage", 18], ["HubSpot Owner", "hs_owner", 20], ["ICP Fit", "icp_fit", 10], ["ICP Fit Reason", "icp_fit_reason", 34, "wrap"], ["Revenue (USD)", "revenue_usd_m", 13, "usd"],
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
  const ICP_ORDER = ["ICP — Verified", "ICP — Likely", "ICP — Needs check", "Unknown", "Not ICP"];
  const icpRank = (x: string) => { const i = ICP_ORDER.indexOf(String(x)); return i < 0 ? 9 : i; };
  const day = (v: unknown) => (v ? String(v).slice(0, 10) : "");
  const accounts: Row[] = d.accounts.map((a): Row => ({ ...a, lists_text: (a.lists || []).join(", "), date_added: day(a.created_at), date_updated: day(a.updated_at),
    hs_in: a.profile?.["HubSpot"] ? (a.profile["HubSpot"].in_hubspot ? "Yes" : "No") : "", hs_stage: a.profile?.["HubSpot"]?.stage || "", hs_owner: a.profile?.["HubSpot"]?.owner || "",
    status_since: day(a.profile?.["Status changed"]?.at || a.last_verified || a.created_at) }))
    .sort((a, b) => icpRank(a.icp_status) - icpRank(b.icp_status) || rank(a.s2p_signal_level) - rank(b.s2p_signal_level) || String(a.company_name).localeCompare(b.company_name));
  table(wb, "Accounts", "ACCOUNTS — ICP & Target Lists", `Exported ${today} · sorted by ICP status, then S2P signal · gold columns are for your input · teal columns from HubSpot`, accCols, accounts, 3, ["account_owner", "account_priority", "pitch_next_step"], accLogos);

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
  const pv = wb.addWorksheet("Pivot Analysis", { properties: { tabColor: { argb: TABS[10] } }, views: [{ showGridLines: false }] });
  banner(pv, "PIVOT ANALYSIS — Live summary tables", "Counts are formulas over the Accounts / Contacts tabs", 10);
  const letter = (n: number) => { let s = ""; for (n += 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
  const LOGO_SHEETS = new Set(["Accounts", "Contact List"]); // these have a logo column after #
  const colOf = (cols: Col[], key: string, sheet = "") => letter(cols.findIndex((c) => c[1] === key) + 1 + (LOGO_SHEETS.has(sheet) ? 1 : 0)); // +1 for the leading # column
  const rng = (sheet: string, cols: Col[], key: string) => `'${sheet}'!$${colOf(cols, key, sheet)}$${FIRST}:$${colOf(cols, key, sheet)}$${MAX}`;
  const uniq = (rows: Row[], key: string) => [...new Set(rows.map((r) => r[key] || "Unknown"))].sort();
  let r0 = 4;
  const pivot = (col: number, title: string, labels: string[], range: string) => {
    pv.getCell(r0, col).value = title; pv.getCell(r0, col).font = f({ bold: true, size: 14, color: { argb: NAVY_2 } });
    ["Value", "Count"].forEach((h, i) => { const c = pv.getCell(r0 + 1, col + i); c.value = h; c.font = f({ bold: true, color: { argb: "FFFFFFFF" } });
      c.fill = fill(HEADER); c.alignment = { horizontal: i ? "right" : "left", indent: 1 }; });
    labels.forEach((l, i) => {
      const a = pv.getCell(r0 + 2 + i, col), b = pv.getCell(r0 + 2 + i, col + 1);
      a.value = l; b.value = { formula: `COUNTIF(${range},"${String(l).replace(/"/g, "")}")` };
      [a, b].forEach((c) => { c.font = f(); c.fill = fill(i % 2 ? BAND : "FFFFFFFF"); c.border = { bottom: { style: "hair", color: { argb: RULE } } }; });
      a.alignment = { indent: 1 }; b.alignment = { horizontal: "right", indent: 1 };
    });
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
  pv.getColumn(1).width = 52; pv.getColumn(2).width = 14;

  // ---- Executive Dashboard: KPI cards + a clickable guide to every sheet
  banner(dash, "ACCOUNT COPILOT — Master Book", `ICP: revenue ≥ USD 250M and 100+ employees (listing not required) · exported ${today}`, 13);
  const A = (k: string) => rng("Accounts", accCols, k), C = (k: string) => rng("Contacts", conCols, k), L = (k: string) => rng("Contact List", listCols, k);
  const kpis: [string, string, string][] = [
    ["Accounts", `COUNTA(${A("company_name")})`, NAVY_2], ["ICP — Verified", `COUNTIF(${A("icp_status")},"ICP — Verified")`, "FF0B6B45"],
    ["ICP — Likely", `COUNTIF(${A("icp_status")},"ICP — Likely")`, "FF1D4F91"], ["Needs check", `COUNTIF(${A("icp_status")},"ICP — Needs check")`, "FF8A5A00"],
    ["Not ICP", `COUNTIF(${A("icp_status")},"Not ICP")`, "FF6B7280"], ["Accounts in HubSpot", `COUNTIF(${A("hs_in")},"Yes")`, HUBSPOT_HEADER],
    ["Coupa accounts", `COUNTIF(${A("existing_s2p_product")},"*Coupa*")`, "FF0E8C7A"], ["SAP Ariba accounts", `COUNTIF(${A("existing_s2p_product")},"*Ariba*")`, "FF2E5E8C"],
    ["People to contact", `COUNTA(${L("full_name")})`, NAVY_2], ["People already in HubSpot", `COUNTIF(${L("hs_contact")},"Yes")`, HUBSPOT_HEADER],
    ["Strong S2P signals", `COUNTIF(${A("s2p_signal_level")},"STRONG SIGNAL")+COUNTIF(${A("s2p_signal_level")},"VERY STRONG SIGNAL")`, "FF0B6B45"],
    ["Conflicts retained", `COUNTA('Conflicts'!$D$${FIRST}:$D$${MAX})`, "FF9B1C1C"],
  ];
  dash.getCell(4, 2).value = "At a glance"; dash.getCell(4, 2).font = f({ size: 16, bold: true, color: { argb: NAVY_2 } });
  kpis.forEach(([label, formula, accent], i) => {
    const row = 6 + Math.floor(i / 4) * 5, col = 2 + (i % 4) * 3;
    dash.mergeCells(row, col, row, col + 1); dash.mergeCells(row + 1, col, row + 2, col + 1);
    for (let rr = row; rr <= row + 2; rr++) for (let cc = col; cc <= col + 1; cc++) {
      const c = dash.getCell(rr, cc); c.fill = fill("FFF4F7FB");
      c.border = { left: cc === col ? { style: "thick", color: { argb: accent } } : undefined, top: rr === row ? { style: "hair", color: { argb: RULE } } : undefined,
        bottom: rr === row + 2 ? { style: "hair", color: { argb: RULE } } : undefined, right: cc === col + 1 ? { style: "hair", color: { argb: RULE } } : undefined };
    }
    dash.getCell(row, col).value = label; dash.getCell(row, col).font = f({ size: 11, bold: true, color: { argb: MUTED } });
    dash.getCell(row, col).alignment = { vertical: "bottom", indent: 1 };
    dash.getCell(row + 1, col).value = { formula }; dash.getCell(row + 1, col).font = f({ size: 28, bold: true, color: { argb: accent } });
    dash.getCell(row + 1, col).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    dash.getRow(row).height = 22; dash.getRow(row + 1).height = 24; dash.getRow(row + 2).height = 20;
  });
  for (let c = 1; c <= 13; c++) dash.getColumn(c).width = c === 1 ? 3 : c % 3 === 1 ? 3 : 17;
  // sheet guide
  const g0 = 22;
  dash.getCell(g0, 2).value = "What's in this workbook"; dash.getCell(g0, 2).font = f({ size: 16, bold: true, color: { argb: NAVY_2 } });
  const guide: [string, string][] = [
    ["Contact List", "One row per person, ready for outreach: official emails only, plus HubSpot status and the import action for each person"],
    ["HubSpot Deals", "Every HubSpot deal on your profiled companies: stage, amount and close date"],
    ["Accounts", "Every account with ICP status, revenue and its source, ERP, S2P platform and signals; gold columns are yours to fill"],
    ["Contacts", "Every contact row as stored, with verification, source and notes"],
    ["Stakeholders", "Contacts sorted by S2P signal, then tier, for call planning"],
    ["S2P Signals", "Source-to-Pay signals with evidence and source"],
    ["ERP & Apps Landscape", "ERP and third-party applications with verification status"],
    ["Source Evidence", "The audit trail: every source used and what it said"],
    ["Employment History", "Current vs previous roles and recent moves"],
    ["Conflicts", "Where sources disagree; both values kept, resolve in the gold column"],
    ["Target List (Reference)", "Your original profiling workbook, unchanged"],
    ["Pivot Analysis", "Live summary counts by status, signal, platform and industry"],
    ["Settings & Legend", "What every colour and label means"],
  ].filter(([n]) => wb.getWorksheet(n) || n === "Pivot Analysis" || n === "Settings & Legend") as [string, string][];
  guide.forEach(([n, what], i) => {
    const r = g0 + 2 + i;
    dash.mergeCells(r, 2, r, 4); dash.mergeCells(r, 5, r, 13);
    const a = dash.getCell(r, 2), b = dash.getCell(r, 5);
    a.value = { text: n, hyperlink: `#'${n}'!A1` }; a.font = f({ bold: true, color: { argb: LINK }, underline: true });
    b.value = what; b.font = f({ color: { argb: INK } }); b.alignment = { vertical: "middle", wrapText: true };
    a.alignment = { vertical: "middle", indent: 1 };
    for (let c = 2; c <= 13; c++) { const x = dash.getCell(r, c); x.fill = fill(i % 2 ? BAND : "FFFFFFFF"); x.border = { bottom: { style: "hair", color: { argb: RULE } } }; }
    dash.getRow(r).height = 22;
  });

  const legend = wb.addWorksheet("Settings & Legend", { properties: { tabColor: { argb: TABS[11] } }, views: [{ showGridLines: false }] });
  banner(legend, "LEGEND", "How to read this workbook", 3);
  const items: [string, string, [string, string]?][] = [
    ["ICP — Verified", "Revenue ≥ $250M from an official source (annual report, filing, company-quoted results)", TAGS["ICP — Verified"]],
    ["ICP — Likely", "≥ $250M per your data, Seamless or estimates; not yet confirmed officially", TAGS["ICP — Likely"]],
    ["ICP — Needs check", "Sources disagree across the $250M line", TAGS["ICP — Needs check"]],
    ["Not ICP", "Official revenue below $250M, or small on estimates (below $100M with 1,000 staff or fewer)", TAGS["Not ICP"]],
    ["Unknown", "No revenue figure from any source yet", TAGS["Unknown"]],
    ["Skip — contact already in HubSpot", "This person's email already exists in HubSpot; don't import", TAGS["Skip — contact already in HubSpot"]],
    ["Add contact to existing HubSpot company", "Company is in HubSpot, person isn't; import and link to that company", TAGS["Add contact to existing HubSpot company"]],
    ["New company + contact", "Neither is in HubSpot; import both", TAGS["New company + contact"]],
    ["Teal header", "Column comes from SCP's HubSpot (read-only, checked by the agent)", [HUBSPOT_HEADER, "FFFFFFFF"]],
    ["Gold header / gold framed cells", "Your input — safe to edit", [INPUT_HEADER, "FFFFFFFF"]],
    ["Channel State = Claude", "Row added by Claude research"],
    ["Channel State = CoPilot / Claude-Seamless / …", "Reference row, carried unchanged"],
    ["Email Status 'Verified Active'", "Seamless.ai 'valid' on the company's own domain"],
    ["Unverified Email Candidate", "Catch-all domain; cannot be verified — never placed in Email"],
    ["Blank email", "Could not be reliably verified; emails are never guessed"],
    ["Nationality 'Not Publicly Verified'", "Never inferred"],
  ];
  ["Label", "Meaning"].forEach((h, i) => { const c = legend.getCell(3, i + 1); c.value = h; c.fill = fill(HEADER); c.font = f({ bold: true, color: { argb: "FFFFFFFF" } }); c.alignment = { indent: 1, vertical: "middle" }; });
  legend.getRow(3).height = 30;
  items.forEach(([k, v, tag], i) => {
    const a = legend.getCell(4 + i, 1), b = legend.getCell(4 + i, 2);
    a.value = k; b.value = v;
    a.font = tag ? f({ bold: true, color: { argb: tag[1] } }) : f({ bold: true }); b.font = f();
    a.fill = fill(tag ? tag[0] : i % 2 ? BAND : "FFFFFFFF"); b.fill = fill(i % 2 ? BAND : "FFFFFFFF");
    a.alignment = { indent: 1, vertical: "middle", wrapText: true }; b.alignment = { indent: 1, vertical: "middle", wrapText: true };
    [a, b].forEach((c) => (c.border = { bottom: { style: "hair", color: { argb: RULE } } }));
    legend.getRow(4 + i).height = 30;
  });
  legend.getColumn(1).width = 50; legend.getColumn(2).width = 90;

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** HubSpot columns for one Contact List row. Used to avoid importing records that already exist in HubSpot. */
function hubspotCols(hs: Row | undefined, email: string): Row {
  if (!hs) return { scp_customer: "Not checked yet", hs_stage: "", hs_owner: "", hs_deals: "", hs_latest: "", hs_contact: "", hs_action: "" };
  const inContact = !!email && (hs.contact_emails || []).includes(email.toLowerCase());
  const deals: Row[] = hs.deals || [];
  const count = (re: RegExp) => deals.filter((x) => re.test(String(x.stage))).length;
  const won = count(/won/i), lost = count(/lost|disqualified/i), open = deals.length - won - lost - count(/inactive/i);
  const money = (n: unknown) => (n === null || n === undefined || n === "" ? "" : ` · $${Number(n).toLocaleString("en-US")}`);
  const latest = deals[0] ? `${deals[0].name} · ${deals[0].stage}${money(deals[0].amount)} · ${deals[0].close}` : "";
  return {
    scp_customer: hs.in_hubspot ? "Yes" : "No",
    hs_stage: hs.in_hubspot ? hs.stage || "" : "", hs_owner: hs.in_hubspot ? hs.owner || "" : "",
    hs_deals: deals.length ? `${deals.length} (${won} won, ${open} open, ${lost} lost)` : hs.in_hubspot ? "None" : "",
    hs_latest: latest, hs_contact: email ? (inContact ? "Yes" : "No") : "",
    hs_action: inContact ? "Skip — contact already in HubSpot" : hs.in_hubspot ? "Add contact to existing HubSpot company" : "New company + contact",
  };
}
