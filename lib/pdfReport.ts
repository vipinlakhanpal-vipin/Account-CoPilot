import "server-only";
import { SHOW_HUBSPOT } from "@/lib/features";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { AllData, Row } from "@/lib/data";
import type { Score } from "@/lib/icp";
import { icpMatch, opportunity, coupaFit, procurementMaturity, estimateSpend, whySelected, recommendedActions, withDefaults, revenueOf, revenueIsOfficial, fmtUsdM, fmtMoneyM, type Criteria } from "@/lib/icp";
import { erpText } from "@/lib/techApps";
import { selectReportAccounts, criteriaFor } from "@/lib/reportSelection";
import { explainScore, type ScoreName } from "@/lib/scoreExplain";
import { playbookFor, startersFor, productsLabel, type Detected } from "@/lib/playbook";
import { rulesFor, regionOf, OPTIONS, REGIONS, describeRules, type Rules } from "@/lib/icpDefinition.mjs";

// One PDF with the same information the Account brief shows for a company, for the companies in the chosen ICP statuses.
// pdf-lib's built-in Helvetica only covers Latin-1, so text is sanitised (≥ → >=, Arabic or other scripts dropped).

const W = 595.28, H = 841.89, M = 40, CW = W - 2 * M;
const INK = rgb(0.1, 0.12, 0.16), MUTED = rgb(0.4, 0.44, 0.5), TEAL = rgb(0.06, 0.43, 0.34), LINE = rgb(0.85, 0.87, 0.9);
const STATUS_COLOR: Record<string, ReturnType<typeof rgb>> = {
  "ICP — Verified": rgb(0.07, 0.5, 0.33), "ICP — Likely": rgb(0.12, 0.38, 0.75), "ICP — Needs check": rgb(0.75, 0.45, 0.05), "Not ICP": rgb(0.7, 0.2, 0.25), Unknown: MUTED };
const REPLACE: Record<string, string> = { "≥": ">=", "≤": "<=", "≈": "~", "→": "->", "←": "<-", "✓": "v", "✕": "x", "●": "-", "·": "-", "…": "...", " ": " ", "​": "" };

export const REPORT_STATUSES = ["ICP — Verified", "ICP — Likely", "ICP — Needs check"] as const;
export type ReportOptions = { statuses: string[]; region: string; limit?: number; generatedBy: string; criteria?: Partial<Criteria> | null; ids?: string[]; title?: string; rank?: "fit" | "revenue" | "name"; product?: Detected };
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const usd = (m: unknown) => { const n = Number(m); return m === null || m === undefined || m === "" ? "" : fmtUsdM(n); };
type Cur = { code: string; per_usd: number };
const money = (usdM: unknown, cur: Cur) => fmtMoneyM(Number(usdM), cur);
const day = (v: unknown) => s(v).slice(0, 10);

class Writer {
  pdf!: PDFDocument; font!: PDFFont; bold!: PDFFont; mono!: PDFFont; page!: PDFPage; y = 0; chars = new Set<number>();
  static async create() {
    const w = new Writer();
    w.pdf = await PDFDocument.create();
    w.font = await w.pdf.embedFont(StandardFonts.Helvetica);
    w.bold = await w.pdf.embedFont(StandardFonts.HelveticaBold);
    w.mono = await w.pdf.embedFont(StandardFonts.Courier);
    w.chars = new Set(w.font.getCharacterSet());
    w.newPage();
    return w;
  }
  clean(v: unknown) {
    let out = "", dropped = false;
    for (const ch of s(v).replace(/\r/g, "").replace(/\t/g, " ")) {
      const cp = ch.codePointAt(0)!;
      if (ch === "\n") { out += "\n"; continue; }
      const r = REPLACE[ch];
      if (r !== undefined) { out += r; continue; }
      if (this.chars.has(cp)) { out += ch; continue; }
      dropped = true;
    }
    out = out.replace(/[ ]{2,}/g, " ").trim();
    return dropped && !out ? "(non-Latin name)" : out;
  }
  newPage() { this.page = this.pdf.addPage([W, H]); this.y = H - M; }
  ensure(h: number) { if (this.y - h < M + 14) this.newPage(); }
  wrap(text: string, font: PDFFont, size: number, width: number) {
    const lines: string[] = [];
    for (const para of this.clean(text).split("\n")) {
      let line = "";
      for (let word of para.split(" ")) {
        while (font.widthOfTextAtSize(word, size) > width) { // a token wider than the line (URL) is broken by character
          let cut = word.length;
          while (cut > 1 && font.widthOfTextAtSize(word.slice(0, cut), size) > width) cut--;
          if (line) { lines.push(line); line = ""; }
          lines.push(word.slice(0, cut)); word = word.slice(cut);
        }
        const t = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(t, size) <= width) line = t; else { lines.push(line); line = word; }
      }
      lines.push(line);
    }
    return lines;
  }
  /** Paragraph that flows across pages. */
  p(text: unknown, o: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; indent?: number; gap?: number; mono?: boolean } = {}) {
    const size = o.size ?? 9.5, font = o.mono ? this.mono : o.bold ? this.bold : this.font, x = M + (o.indent ?? 0), lead = size * 1.35;
    if (o.bold && size <= 9.5) this.ensure(lead * 4); // a bold sub-heading never ends a page on its own
    for (const ln of this.wrap(s(text), font, size, CW - (o.indent ?? 0))) {
      this.ensure(lead);
      this.y -= lead;
      if (ln) this.page.drawText(ln, { x, y: this.y, size, font, color: o.color ?? INK });
    }
    this.y -= o.gap ?? 2;
  }
  bullet(text: unknown, indent = 8) {
    const lead = 9.5 * 1.35;
    this.ensure(lead);
    const first = this.wrap(s(text), this.font, 9.5, CW - indent - 8);
    first.forEach((ln, i) => {
      this.ensure(lead); this.y -= lead;
      if (i === 0) this.page.drawText("-", { x: M + indent, y: this.y, size: 9.5, font: this.font, color: MUTED });
      this.page.drawText(ln, { x: M + indent + 8, y: this.y, size: 9.5, font: this.font, color: INK });
    });
    this.y -= 1;
  }
  h1(t: string) { this.ensure(30); this.p(t, { size: 18, bold: true, color: TEAL, gap: 4 }); }
  /** `keep` is the room the heading needs below it, so a heading never ends a page with its content on the next. */
  h2(t: string, keep = 100) {
    this.ensure(keep); this.y -= 6;
    this.p(t.toUpperCase(), { size: 9.5, bold: true, color: TEAL, gap: 1 });
    this.y -= 3;
    this.page.drawLine({ start: { x: M, y: this.y }, end: { x: W - M, y: this.y }, thickness: 0.6, color: LINE }); this.y -= 5;
  }
  kv(label: string, value: unknown, lw = 96) {
    const v = this.clean(value);
    if (!v) return;
    const lead = 9.5 * 1.35, lines = this.wrap(v, this.font, 9.5, CW - lw);
    this.ensure(lead);
    lines.forEach((ln, i) => {
      this.ensure(lead); this.y -= lead;
      if (i === 0) this.page.drawText(this.clean(label), { x: M, y: this.y, size: 8.5, font: this.bold, color: MUTED });
      this.page.drawText(ln, { x: M + lw, y: this.y, size: 9.5, font: this.font, color: INK });
    });
    this.y -= 1;
  }
  /** Simple table: widths are fractions of the content width. Rows keep to one or more wrapped lines. */
  table(head: string[], rows: string[][], widths: number[], size = 8.5) {
    const xs = widths.reduce<number[]>((a, w, i) => [...a, (a[i] ?? M) + w * CW], [M]);
    const draw = (cells: string[], font: PDFFont, shade: boolean) => {
      const wrapped = cells.map((c, i) => this.wrap(c, font, size, widths[i] * CW - 6));
      const n = Math.max(...wrapped.map((l) => l.length)), lead = size * 1.35, h = n * lead + 8;
      this.ensure(h);
      if (shade) this.page.drawRectangle({ x: M, y: this.y - h, width: CW, height: h, color: rgb(0.94, 0.96, 0.96) });
      wrapped.forEach((ls, i) => ls.forEach((ln, j) => this.page.drawText(ln, { x: xs[i] + 3, y: this.y - 4 - lead * (j + 1) + 3, size, font, color: INK })));
      this.y -= h;
      this.page.drawLine({ start: { x: M, y: this.y }, end: { x: W - M, y: this.y }, thickness: 0.3, color: LINE });
    };
    draw(head, this.bold, true);
    rows.forEach((r) => draw(r, this.font, false));
    this.y -= 4;
  }
  /** The Account CoPilot mark (same shapes as components/Logo.tsx; the tile is a flat teal since PDFs have no gradient fill here). */
  logo(x: number, top: number, size: number) {
    const k = size / 40;
    const at = { x, y: top, scale: k };
    this.page.drawSvgPath("M11 1 H29 A10 10 0 0 1 39 11 V29 A10 10 0 0 1 29 39 H11 A10 10 0 0 1 1 29 V11 A10 10 0 0 1 11 1 Z", { ...at, color: rgb(0.18, 0.7, 0.62) });
    this.page.drawSvgPath("M20 8 L30 31 L20 25.5 L10 31 Z", { ...at, color: rgb(1, 1, 1) });
    this.page.drawSvgPath("M20 8 L20 25.5 L10 31 Z", { ...at, color: rgb(0.87, 0.97, 0.94) });
    this.page.drawCircle({ x: x + 29.5 * k, y: top - 11 * k, size: 3 * k, color: rgb(1, 0.88, 0.54), borderColor: rgb(0.05, 0.09, 0.19), borderWidth: 0.8 });
  }
  pill(text: string, color: ReturnType<typeof rgb>) {
    const t = this.clean(text), w = this.bold.widthOfTextAtSize(t, 9) + 12;
    this.ensure(16);
    this.page.drawRectangle({ x: M, y: this.y - 14, width: w, height: 14, color, borderRadius: 7 } as never);
    this.page.drawText(t, { x: M + 6, y: this.y - 10.5, size: 9, font: this.bold, color: rgb(1, 1, 1) });
    this.y -= 20;
  }
}

function howItWorks(w: Writer, regions: string[], def: unknown, opt: ReportOptions) {
  w.h2("How Account CoPilot produced this report");
  w.p("Every figure below comes from rules you defined, not from a model's opinion. The report only lists companies that the ICP rules and the evidence rank into the statuses you picked.", { gap: 6 });
  w.p("1. ICP Profile", { bold: true });
  for (const r of regions) {
    const rules = rulesFor(def, r) as Rules;
    w.bullet(`${describeRules(r, rules)}.`);
    const entity = OPTIONS.entity.find((e: [string, string]) => e[0] === rules.entity_level)?.[1] || rules.entity_level;
    w.p(`${entity}. Ownership allowed: ${rules.ownership_allowed.join(", ") || "any"}. Excludes: ${[rules.exclude.government_bodies && "government bodies", rules.exclude.single_sites && "single sites (one hotel, hospital, school)", rules.exclude.foreign_branches && "local branches of foreign HQs"].filter(Boolean).join(", ") || "nothing specific"}.`, { size: 8.5, color: MUTED, indent: 16 });
  }
  w.p("2. Evidence ladder (how revenue is found)", { bold: true });
  w.bullet("Official: annual report, results release, stock-exchange or regulator filing, bond or sukuk prospectus, credit-rating report, parent segment disclosure, or reputable press quoting the company.");
  w.bullet("Estimates (aggregators, Seamless bands) can only make a company LIKELY, never Verified. Every figure keeps its source and is labelled FACT, LIKELY, UNVERIFIED or UNKNOWN.");
  w.p("3. What the statuses mean", { bold: true });
  w.bullet("ICP - Verified: official revenue at or above the region's floor.");
  w.bullet("ICP - Likely: at or above the floor on estimates or your own data, no official figure yet.");
  w.bullet("ICP - Needs check: sources disagree around the floor, or the estimate is just under it. It is re-queued for a revenue check.");
  w.bullet(`Anything that is not Verified is re-checked every ${(rulesFor(def, regions[0]) as Rules).evidence.recheck_days} days, so companies move up as they grow or as official figures appear.`);
  w.p("4. Scores (rule-based, no API cost)", { bold: true });
  w.bullet("ICP Match: how well the account fits your criteria. Opportunity: buying signals, platform gaps and triggers. Coupa Fit: how well Coupa's modules suit the account.");
  w.bullet("Pipeline rank = weighted blend of the three, using the weights saved in Define ICP. Spend, invoice and transaction numbers are benchmark ESTIMATES.");
  w.p("5. How the data arrives", { bold: true });
  const daily = regions.map((r) => rulesFor(def, r) as Rules).filter((x) => x.status === "active");
  w.bullet(`A scheduled session runs every morning (6am Dubai): it finds new companies and re-verifies existing ones for each active region${daily.length ? ` (currently ${daily[0].engine.discover_per_day} new and up to ${daily[0].engine.verify_per_day} re-verified per region per day)` : ""}.`);
  w.bullet("It uses its own web search, never guesses emails or phones, and keeps conflicting findings rather than overwriting your reference workbook.");
  if (opt.ids?.length === 1) w.p("Selection for this report: one company, chosen from its account brief.", { size: 8.5, color: MUTED, gap: 6 });
  else if (opt.ids?.length) w.p(`Selection for this report: the companies in the list you opened${opt.title ? ` ("${opt.title}")` : ""}, region ${opt.region}, whatever their ICP status; ${opt.rank === "revenue" ? "largest revenue first" : opt.rank === "name" ? "A to Z" : "most promising first (by ICP Match)"}, up to ${opt.limit} companies.`, { size: 8.5, color: MUTED, gap: 6 });
  else w.p(`Selection for this report: region ${opt.region}; statuses ${opt.statuses.map((x) => x.replace("ICP — ", "")).join(", ")}; ${opt.rank === "revenue" ? "largest revenue first" : opt.rank === "name" ? "A to Z" : "most promising first (by ICP Match)"}, up to ${opt.limit} companies.`, { size: 8.5, color: MUTED, gap: 6 });
}

/** How each score's points are earned, mirroring lib/icp.ts so the report explains exactly what it computed. */
function pointsExplained(w: Writer) {
  w.h2("How the points are calculated", 150);
  w.p("Each score is the points a company earned divided by the points available, shown as a percentage. Only checks that apply are counted: ICP Match counts the criteria saved in the Discovery panel, and the lines starting with \"Your\" appear only when you have set them in Define ICP.", { gap: 6 });

  w.p("ICP Match: how well the company fits your criteria", { bold: true, gap: 5 });
  w.table(["Check", "Max", "How the points are earned"], [
    ["Revenue", "30", "30 if revenue is official (filing or results) and inside your bands; 10 if only an estimate; 5 if sources disagree or no figure exists; 0 if outside your bands"],
    ["Employees", "15", "15 if headcount is inside your bands; 6 if headcount is unknown; 0 if outside"],
    ["Geography", "15", "15 if the company's country is one you selected; otherwise 0"],
    ["Industry", "15", "15 if its industry is one you selected (only when you set industries)"],
    ["Ownership", "5", "5 if its ownership type matches (only when you set ownership)"],
    ["Technology", "10", "10 if its ERP or platform matches your list; 3 if the stack is unknown; 0 otherwise (only when set)"],
    ["Triggers", "10", "10 if any trigger you selected is found (only when set)"],
    ["Procurement maturity", "10", "10 suite in place (Coupa or Ariba); 7 other or in-house tools; 5 manual or ERP only; 4 unknown"],
  ], [0.2, 0.07, 0.73]);

  w.p("Opportunity: how likely the company is to buy soon", { bold: true, gap: 5 });
  w.table(["Check", "Max", "How the points are earned"], [
    ["S2P signal strength", "40", "Very strong 40; Strong 30; Moderate 18; Weak 8; Conflicting 10; no signal 0"],
    ["Procurement transformation", "15", "15 if procurement transformation is evidenced or a platform project is under way (evaluation, RFP, implementing, replacement)"],
    ["ERP modernisation", "15", "15 if an ERP programme is evidenced; 8 if it runs S/4HANA or Oracle Fusion; otherwise 0"],
    ["Digital transformation", "10", "10 if a digital programme is evidenced"],
    ["Cost reduction", "5", "5 if a cost-optimisation programme is evidenced"],
    ["Executive hiring", "10", "5 for each recorded leadership move, up to 10"],
    ["Recent growth", "5", "5 if record revenue, profit or growth is reported"],
    ["Your buying triggers", "20", "20 if two or more of your triggers are found; 12 for one (when set in Define ICP)"],
    ["Your ERP of interest", "10", "10 if it runs an ERP on your list (when set in Define ICP)"],
  ], [0.26, 0.07, 0.67]);

  w.p("Coupa Fit: estimated fit across five Coupa value areas", { bold: true, gap: 4 });
  w.p("Source-to-Pay, Supplier management, Contract management, Spend analytics and Invoice automation are each worth 20 points. Each is estimated from the platform the company runs today (no suite found or an existing Coupa customer scores highest, Ariba lowest as a displacement play), its size (revenue of $1B or more scores highest), its ERP (SAP, Oracle or Microsoft best), and its sector (supplier-heavy sectors lift supplier and contract management; services-heavy sectors lift contracts and invoicing). \"Your platform focus\" adds 20 points if the platform is on your Define ICP list, 8 if it is unknown, 0 otherwise.", { size: 9, gap: 4 });
  w.p("Pipeline rank is a weighted blend of the three scores, using the weights saved in Define ICP. Spend and transaction figures are benchmark estimates, never company data.", { size: 9, color: MUTED, gap: 6 });
}

/** The three scores as lists of points on the left, and on the right a framed plain-language note on how each percentage came about. */
function scoresWithFrame(w: Writer, items: [ScoreName, Score][]) {
  const leftW = CW * 0.6, frameX = M + CW * 0.63, frameW = CW * 0.37, pad = 8;
  type L = { t: string; size: number; font: PDFFont; color: ReturnType<typeof rgb>; x: number; gap?: number };
  const left: L[] = [], right: L[] = [];
  const addL = (t: string, size: number, font: PDFFont, color: ReturnType<typeof rgb>, indent: number, gap = 0) => w.wrap(t, font, size, leftW - indent).forEach((ln, i, a) => left.push({ t: ln, size, font, color, x: M + indent, gap: i === a.length - 1 ? gap : 0 }));
  const addR = (t: string, size: number, font: PDFFont, color: ReturnType<typeof rgb>, gap = 0) => w.wrap(t, font, size, frameW - 2 * pad).forEach((ln, i, a) => right.push({ t: ln, size, font, color, x: frameX + pad, gap: i === a.length - 1 ? gap : 0 }));
  for (const [label, sc] of items) {
    addL(`${label}: ${sc.total}%`, 9.5, w.bold, INK, 0, 0);
    sc.parts.forEach((x) => addL(`${x.label}: ${x.score} of ${x.max} pts - ${x.why}`, 8.5, w.font, MUTED, 10, 0));
    addL(explainScore(label, sc).total, 9, w.bold, TEAL, 10, 0);
    left.push({ t: "", size: 8.5, font: w.font, color: INK, x: M, gap: 0 });
  }
  addR("HOW TO READ THESE SCORES", 7.5, w.bold, TEAL, 2);
  addR("The simple rule: score = points the company got, divided by the points it could get, times 100. Every score ends up between 0 and 100. Example: 35 out of 70 is half, so 50%.", 7.5, w.font, INK, 5);
  for (const [label, sc] of items) {
    const e = explainScore(label, sc);
    addR(`${e.name}: ${e.pct}%`, 8, w.bold, INK, 1);
    addR(e.question, 7.5, w.font, INK, 1);
    addR(e.formula, 7.5, w.bold, TEAL, 1);
    if (e.extremes) addR(e.extremes, 7.5, w.font, INK, 1);
    addR(e.reading, 7, w.font, MUTED, 5);
  }
  const hOf = (ls: L[]) => ls.reduce((t, l) => t + l.size * 1.35 + (l.gap || 0), 0);
  const frameH = hOf(right) + 2 * pad, h = Math.max(hOf(left), frameH);
  w.ensure(Math.min(h + 40, H - 2 * M - 20)); // the heading and the whole block stay on one page
  w.h2("Scores: how well this account fits", 0);
  const top = w.y;
  w.page.drawRectangle({ x: frameX, y: top - frameH, width: frameW, height: frameH, color: rgb(0.94, 0.97, 0.96), borderColor: rgb(0.62, 0.8, 0.74), borderWidth: 0.8 });
  let y = top;
  for (const l of left) { y -= l.size * 1.35; if (l.t) w.page.drawText(l.t, { x: l.x, y, size: l.size, font: l.font, color: l.color }); y -= l.gap || 0; }
  let ry = top - pad;
  for (const l of right) { ry -= l.size * 1.35; w.page.drawText(l.t, { x: l.x, y: ry + 2, size: l.size, font: l.font, color: l.color }); ry -= l.gap || 0; }
  w.y = Math.min(y, top - frameH) - 4;
}

export async function buildReport(all: AllData, def: unknown, opt: ReportOptions): Promise<{ bytes: Uint8Array; count: number; total: number }> {
  const criteria = withDefaults(opt.criteria);
  const hires: Record<string, number> = {};
  all.history.forEach((h) => { if (/change|promot|join|hire/i.test(s(h.determination))) hires[h.company_id] = (hires[h.company_id] || 0) + 1; });
  const single = opt.ids?.length === 1;
  // Which companies, and in what order, is decided by the same function the Excel uses, so the two files always match.
  const sel = selectReportAccounts(all.accounts, { region: opt.region, ids: opt.ids, statuses: opt.statuses, rank: opt.rank, limit: opt.limit, criteria: opt.criteria });
  const picked = sel.selected.map((a) => {
    const c = criteriaFor(criteria, a);
    const focus = (rulesFor(def, a.country) as Rules).focus;
    return { a, m: icpMatch(a, c), o: opportunity(a, hires[a.id] || 0, focus), f: coupaFit(a, focus), c };
  });
  const total = sel.total;

  const w = await Writer.create();
  const regionName = (REGIONS.find((r: { key: string; name: string }) => r.key === opt.region)?.name) || (opt.region === "All" ? "all regions" : opt.region);
  const title = single && picked[0] ? `Account CoPilot report on ${s(picked[0].a.company_name)}`
    : opt.title ? `Account CoPilot report on ${w.clean(opt.title)}` : `Account CoPilot report on ${regionName}`;
  const logoTop = w.y;
  w.logo(M, logoTop, 46);
  w.p("ACCOUNT COPILOT", { size: 9, bold: true, color: MUTED, gap: 2, indent: 58 });
  w.p(title, { size: 18, bold: true, color: TEAL, gap: 4, indent: 58 });
  w.y = Math.min(w.y, logoTop - 54);
  w.p(`Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC by ${opt.generatedBy || "a team member"}  |  ${picked.length} of ${total} matching companies`, { size: 9, color: MUTED, gap: 8 });
  const regions = opt.region === "All" ? [...new Set(picked.map((x) => regionOf(x.a.country)))] : [opt.region];
  // The company comes first. How the report was produced and how the points work are explained on the last pages.
  w.p("Each company page explains its scores in a framed note beside the points. How this report was produced, and the full scoring rules, are at the end.", { size: 8.5, color: MUTED, gap: 8 });

  const curOf = (a: Row) => (rulesFor(def, a.country) as Rules).currency as Cur;
  const contactCos = new Set(all.contacts.map((p) => p.company_id));
  if (!single) {
    w.ensure(150);
    w.h2("Companies in this report", 170);
    const counts = REPORT_STATUSES.map((st) => `${st.replace("ICP — ", "")}: ${picked.filter((x) => x.a.icp_status === st).length}`).join("   ");
    w.p(counts, { size: 9, color: MUTED, gap: 2 });
    w.p(`Amounts are in USD, with the regional currency in brackets. Stakeholder contacts are on file for ${picked.filter((x) => contactCos.has(x.a.id)).length} of these ${picked.length} companies.`, { size: 8.5, color: MUTED, gap: 4 });
    w.table(["#", "Company", "Country", "Status", "Revenue", "Match", "Opp.", "Fit"],
      picked.map((x, i) => [String(i + 1), s(x.a.company_name), s(x.a.country), s(x.a.icp_status).replace("ICP — ", ""),
        money(revenueOf(x.a), curOf(x.a)) + (revenueOf(x.a) && !revenueIsOfficial(x.a) ? " est." : ""),
        `${x.m.total}%`, `${x.o.total}%`, `${x.f.total}%`]), [0.04, 0.27, 0.09, 0.1, 0.26, 0.08, 0.08, 0.08]);
  }

  for (const [idx, { a, m, o, f, c }] of picked.entries()) {
    if (idx > 0 || !single) w.newPage(); // a single-company report starts right under the title
    const people = all.contacts.filter((p) => p.company_id === a.id);
    const seen = new Set<string>(), cs = people.filter((p) => { const k = `${s(p.full_name)}|${s(p.title_verbatim)}`.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((x, y) => (s(x.business_unit) ? 1 : 0) - (s(y.business_unit) ? 1 : 0) || s(x.business_unit).localeCompare(s(y.business_unit)) || s(x.contact_tier).localeCompare(s(y.contact_tier)));
    const hasUnit = cs.some((p) => s(p.business_unit)); // a property under the account (for example Kerzner International under Atlantis, The Palm)
    const sigs = all.signals.filter((x) => x.company_id === a.id);
    const apps = all.apps.filter((x) => x.company_id === a.id && x.category !== "ERP (core)");
    const srcs = all.sources.filter((x) => x.company_id === a.id);
    const conf = all.conflicts.filter((x) => x.company_id === a.id);
    const spend = c.showSpend ? estimateSpend(a) : null;
    const mat = procurementMaturity(a);
    const hs = a.profile?.["HubSpot"] as Record<string, unknown> | undefined;

    w.p(`${s(a.exchange)} ${s(a.ticker)} ${s(a.industry)}`.trim(), { size: 8.5, color: MUTED, gap: 0 });
    w.h1(s(a.company_name));
    w.pill(s(a.icp_status) || "Unknown", STATUS_COLOR[s(a.icp_status)] || MUTED);

    w.h2("Facts");
    const rev = revenueOf(a);
    w.kv("Website", a.company_website || a.domain);
    const cur = curOf(a);
    w.kv("Revenue", rev ? `${money(rev, cur)}${revenueIsOfficial(a) ? " - official" : " - estimate"}.  ${[a.verified_revenue_source, a.revenue_local && `reported as ${a.revenue_local}`, a.revenue_fy].filter(Boolean).join(" - ")}` : "");
    w.kv("Stock listing", a.listing_status || (a.exchange ? `Listed (${a.exchange})` : ""));
    w.kv("Employees", a.employee_range);
    w.kv("ICP fit", [a.icp_fit, a.icp_fit_reason].filter(Boolean).join(" - "));
    w.kv("Ownership", a.ownership);
    w.kv("Parent", a.parent_company);
    w.kv("Entity", a.entity_type && a.entity_type !== "Unknown" ? a.entity_type : "");
    w.kv("Board phone", a.board_phone);
    w.kv("Last researched", day(a.last_researched));
    w.kv("Record dates", `Added ${day(a.created_at) || "-"} | Updated ${day(a.updated_at) || "-"} | Status since ${day(a.profile?.["Status changed"]?.at || a.last_verified || a.created_at) || "-"}`);
    w.kv("Data source", (a.lists || []).join(", "));

    w.h2(`Procurement & IT maturity: ${mat.level}`);
    w.p(mat.why);
    w.kv("S2P platform", mat.platform); w.kv("ERP", mat.erp); w.kv("S2P signal", mat.signal); w.kv("Addressable spend", spend ? money(spend.total, cur) : "");

    scoresWithFrame(w, [["ICP Match", m], ["Opportunity", o], ["Coupa Fit", f]]);
    const why = whySelected(a, c, m, spend);
    if (why.length) { w.p("Why this account was selected", { bold: true }); why.forEach((x) => w.bullet(x)); }
    if (spend) {
      w.h2("Procurement & spend intelligence (ESTIMATE)", 230);
      w.p(`Annual addressable spend is revenue x a sector benchmark, split by category. Amounts in USD${cur.code === "USD" ? "" : `, with ${cur.code} in brackets (at ${cur.per_usd} per USD)`}.`, { size: 8.5, color: MUTED, gap: 4 });
      const pct = (v: number) => `${spend.total ? Math.round((v / spend.total) * 100) : 0}%`;
      w.table(["Spend category", "Annual amount", "Share of addressable spend"], [
        ["Total addressable spend", money(spend.total, cur), "100%"],
        ["Direct (materials and goods for production)", money(spend.direct, cur), pct(spend.direct)],
        ["Indirect (operating and administrative)", money(spend.indirect, cur), pct(spend.indirect)],
        ["MRO (maintenance, repair and operations)", money(spend.mro, cur), pct(spend.mro)],
        ["Services (contractors and professional services)", money(spend.services, cur), pct(spend.services)],
        ["CAPEX (capital projects and equipment)", money(spend.capex, cur), pct(spend.capex)],
        ["Annual procurement budget (indirect + services + MRO)", money(spend.budget, cur), pct(spend.budget)],
      ], [0.5, 0.28, 0.22]);
      w.table(["Transaction volume", "Estimate"], [
        ["Invoices per month", `~${Math.round(spend.invoicesPerMonth).toLocaleString("en-US")}`],
        ["Purchase orders per month", `~${Math.round(spend.posPerMonth).toLocaleString("en-US")}`],
        ["Suppliers per year", `~${Math.round(spend.suppliers).toLocaleString("en-US")}`],
        ["Active suppliers", `~${Math.round(spend.activeSuppliers).toLocaleString("en-US")}`],
        ["Procurement transactions per year", `~${Math.round(spend.transactionsPerYear).toLocaleString("en-US")}`],
      ], [0.5, 0.5]);
      w.p(spend.basis, { size: 8, color: MUTED });
    }
    const rec = recommendedActions(a, cs, f);
    w.p("Recommended actions", { bold: true });
    w.kv("Connect with", rec.stakeholders.length ? rec.stakeholders.join("; ") : "No buying-committee contact on file yet: research the CPO / CFO.");
    w.kv("Messaging", rec.messaging);
    w.kv("Questions", rec.questions.join(" | "));
    w.kv("Pain points", rec.pains.join(" | "));
    w.kv("Coupa use cases", rec.useCases.join(" | "));
    w.kv("Next steps", rec.next.join(" | "));

    w.h2("S2P intelligence");
    w.p(a.s2p_strong_signals || "No S2P evidence found.");
    if (a.existing_s2p_detail) w.p(`Detail: ${a.existing_s2p_detail}`, { size: 8.5, color: MUTED });
    w.p(`Coupa: ${a.coupa_opportunity_type || "No Evidence"}  |  Ariba: ${a.ariba_opportunity_type || "No Evidence"}`, { size: 8.5, color: MUTED });
    sigs.forEach((x) => w.bullet(`${s(x.signal)} [${s(x.level)}${x.category ? `, ${s(x.category)}` : ""}] ${s(x.evidence)}${x.date ? ` (${s(x.date)})` : ""}${x.source_url ? ` - ${s(x.source_url)}` : ""}`));

    w.h2("ERP landscape and third-party apps");
    w.p(`ERP: ${erpText(a.erp)}${a.erp_status && !/^not[ _]public$/i.test(s(a.erp)) ? ` (${s(a.erp_status)})` : ""}`);
    if (a.erp_evidence) w.p(s(a.erp_evidence), { size: 8.5, color: MUTED });
    if (apps.length) { w.p("Third-party apps", { bold: true, gap: 1 }); apps.forEach((x) => w.bullet(`${s(x.name)} - ${s(x.category)} - ${s(x.status)}`)); } // listed only when there is data

    const trans = [["Procurement model", a.procurement_model], ["Procurement transformation", a.procurement_transformation_signals], ["Digital transformation", a.digital_transformation_signals],
      ["Implementation partner", a.known_implementation_partner], ["Subsidiaries", a.subsidiaries]].filter(([, v]) => v);
    if (trans.length) { w.h2("Transformation context"); trans.forEach(([l, v]) => w.kv(l as string, v, 150)); }

    if (SHOW_HUBSPOT && hs) { w.h2("HubSpot (read-only)"); w.p(hs.in_hubspot ? `${s(hs.hubspot_name)} | stage ${s(hs.stage) || "-"} | owner ${s(hs.owner) || "-"}` : "Not in HubSpot."); }

    w.h2("Opportunity observations");
    w.p(a.potential_opportunity || "-");
    if (a.account_notes) w.p(a.account_notes, { size: 8.5, color: MUTED });

    w.h2(`Stakeholders (${cs.length})`, 150);
    if (cs.length) w.table(hasUnit ? ["Name", "Property / unit", "Title", "Tier", "Email", "Phone", "LinkedIn"] : ["Name", "Title", "Tier", "Email", "Phone", "LinkedIn"],
      cs.slice(0, 25).map((p) => { const li = s(p.linkedin_url).replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
        return hasUnit ? [s(p.full_name), s(p.business_unit) || "Main account", s(p.title_verbatim), s(p.contact_tier), s(p.email), s(p.phone), li] : [s(p.full_name), s(p.title_verbatim), s(p.contact_tier), s(p.email), s(p.phone), li]; }),
      hasUnit ? [0.13, 0.11, 0.2, 0.05, 0.17, 0.13, 0.21] : [0.15, 0.22, 0.06, 0.2, 0.15, 0.22], 8);
    else w.p("No stakeholder contacts are on file for this company yet. The daily engine finds companies and verifies revenue; it does not collect people. Contacts reach the app from your reference workbook or from Seamless enrichment.", { size: 8.5, color: MUTED });

    if (conf.length) { w.h2(`Conflicts retained (${conf.length})`); w.p("Sources disagree on one or more fields for this company. The app keeps both values; open the account in the app to review them.", { size: 8.5, color: MUTED }); }

    w.h2(`Evidence (${srcs.length} sources)`);
    srcs.slice(0, 20).forEach((x) => w.bullet(`[${s(x.source_tier)}] ${s(x.source)}${x.date_published ? ` (${s(x.date_published)})` : ""} - ${s(x.information_found)}${x.url ? ` - ${s(x.url)}` : ""}`));
    if (srcs.length > 20) w.p(`+ ${srcs.length - 20} more sources in the app.`, { size: 8.5, color: MUTED });
  }

  // A search that names a product (Coupa, SAP Ariba, another platform) also gets a Playbook and a Discovery Questions section.
  if (opt.product?.products.length) {
    const plays = playbookFor(opt.product), label = productsLabel(opt.product);
    w.newPage();
    w.h1(`Playbook: ${label}`);
    w.p(`${opt.product.mode === "customers" ? "Existing customers" : "New business"}. A working guide for the accounts in this report. It holds method and questions to test, not figures or customer stories: add SCP's own approved references before sharing it with a customer.`, { size: 8.5, color: MUTED, gap: 6 });
    for (const pl of plays) {
      if (plays.length > 1) w.h2(pl.product, 60);
      let last = "";
      for (const row of pl.rows) {
        if (row.section !== last) { w.h2(row.section.replace(/^\d+\.\s*/, ""), 70); last = row.section; }
        w.p(row.point, { bold: true, gap: 0 });
        w.p(row.detail + (row.use ? `  (${row.use})` : ""), { size: 9, indent: 8, gap: 3 });
      }
    }
    if (picked.length) {
      w.h2("Where each account starts", 120);
      w.p("Worked out from the ERP, S2P platform and signal level on file for each company. Check it against the account page before you act.", { size: 8.5, color: MUTED, gap: 3 });
      w.table(["Company", "ERP / S2P platform", "Signal", "Starting play"],
        startersFor(picked.map((x) => x.a), opt.product).map((x) => [x.company, [x.erp, x.s2p].filter(Boolean).join(" / ") || "-", x.signal, x.play]), [0.22, 0.2, 0.1, 0.48], 8);
    }
    w.newPage();
    w.h1(`Discovery questions: ${label}`);
    w.p("Ask them in the buyer's own words and write down the answer. Leave each meeting with the pain, the process, the systems, the decision path and a date.", { size: 8.5, color: MUTED, gap: 6 });
    for (const pl of plays) {
      if (plays.length > 1) w.h2(pl.product, 80);
      w.table(["#", "Topic", "Question", "Why we ask / listen for", "Ask"], pl.questions.map((q, i) => [String(i + 1), q.topic, q.q, `${q.why} Listen for: ${q.listen}`, q.who]), [0.04, 0.12, 0.32, 0.38, 0.14], 8);
    }
  }

  // Bottom of the report: how it was produced and how the points are calculated.
  w.newPage();
  howItWorks(w, regions.length ? regions : [opt.region], def, opt);
  pointsExplained(w);

  const pages = w.pdf.getPages();
  pages.forEach((pg, i) => {
    pg.drawText(`Account CoPilot - confidential - page ${i + 1} of ${pages.length}`, { x: M, y: 22, size: 7.5, font: w.font, color: MUTED });
  });
  return { bytes: await w.pdf.save(), count: picked.length, total };
}
