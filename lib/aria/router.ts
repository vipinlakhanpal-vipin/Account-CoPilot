import "server-only";
import type { Row } from "@/lib/data";
import { type AriaContext, type AccountFilter, regionKey, filterAccounts, searchAccounts, countAccounts, getAccount, searchContacts, icpRules, findAccounts, roleKey } from "@/lib/aria/tools";
import { runTool } from "@/lib/aria/agent";
import type { AriaAction, AriaChoice } from "@/packages/aria/types";
import { REGIONS } from "@/lib/icpDefinition.mjs";

// The free path. Most questions people ask Aria are one of a handful of shapes (counts, lists, one company, contacts, rules, a PDF or an
// Excel). These are read by plain rules and answered straight from the database: no AI, no API cost. Anything the rules cannot read
// confidently returns null, and only then does the question go to the AI.
export type FreeReply = { text: string; actions: AriaAction[]; choices: AriaChoice[] };

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const esc = (v: unknown) => s(v).replace(/\|/g, "/").replace(/\n/g, " ");
function table(head: string[], rows: unknown[][]) {
  return `| ${head.join(" | ")} |\n|${head.map(() => "---").join("|")}|\n${rows.map((r) => `| ${r.map(esc).join(" | ")} |`).join("\n")}`;
}
const SUFFIX = /\b(pjsc|psc|llc|l\.l\.c|plc|ltd|limited|inc|co|company|corp|corporation|group|holding|holdings|international|the|of|and)\b/g;
const core = (name: string) => name.toLowerCase().replace(/\(.*?\)/g, " ").replace(SUFFIX, " ").replace(/[^a-z0-9& ]+/g, " ").replace(/\s+/g, " ").trim();

function findRegionIn(t: string): string {
  const alias: [RegExp, string][] = [[/\b(saudi|ksa)\b/, "KSA"], [/\b(uae|emirates|dubai|abu dhabi)\b/, "UAE"], [/\bqatar\b/, "Qatar"], [/\bkuwait\b/, "Kuwait"],
    [/\b(uk|united kingdom|britain|england)\b/, "UK"], [/\b(usa|u\.s\.a?|united states|america)\b/, "USA"], [/\b(us)\b(?! (a|b))/, "USA"], [/\boman\b/, "Oman"], [/\bbahrain\b/, "Bahrain"], [/\begypt\b/, "Egypt"]];
  for (const [re, key] of alias) if (re.test(t)) return key;
  for (const r of REGIONS as { key: string; name: string }[]) if (t.includes(r.name.toLowerCase())) return r.key;
  return "";
}

// "net revenue between 500m and 1b", "revenue above 250 million", "under $2bn" → min/max in USD millions. Returns the matched text so it
// can be taken out before the rest of the question is read ("revenue" in a range is not a request to sort by revenue).
const UNIT: Record<string, number> = { m: 1, mn: 1, million: 1, b: 1000, bn: 1000, billion: 1000 };
const NUM = String.raw`\$?\s*([\d][\d,]*(?:\.\d+)?)\s*(m|mn|million|b|bn|billion)?\b`;
function parseRevenue(t: string, f: AccountFilter): string {
  const val = (n: string, u?: string) => Number(n.replace(/,/g, "")) * (u ? UNIT[u] : 1);
  const ctx = /\b(revenue|turnover|sales)\b/.test(t);
  let m = new RegExp(String.raw`(?:(?:net )?(?:revenue|turnover|sales)\s*)?(?:between|from)\s*${NUM}\s*(?:and|to|-|–|up ?to|till|until)\s*${NUM}`).exec(t);
  if (m && (ctx || m[2] || m[4])) {
    const hi = val(m[3], m[4]); let lo = val(m[1], m[2] || (m[4] && Number(m[1].replace(/,/g, "")) < Number(m[3].replace(/,/g, "")) ? m[4] : undefined));
    if (lo > hi) [lo, f.max_revenue_usd_m] = [hi, lo]; else f.max_revenue_usd_m = hi;
    f.min_revenue_usd_m = Math.min(lo, hi); if (f.max_revenue_usd_m === undefined) f.max_revenue_usd_m = Math.max(lo, hi);
    return m[0];
  }
  m = new RegExp(String.raw`(?:net )?(?:revenue|turnover|sales)\s*(?:of|is|at|around|about|:)?\s*${NUM}\s*(?:up ?to|upto|to|till|until|-|–)\s*${NUM}`).exec(t);
  if (m && (m[2] || m[4])) {
    const n1 = Number(m[1].replace(/,/g, "")), n3 = Number(m[3].replace(/,/g, ""));
    let lo = val(m[1], m[2] || (m[4] && n1 < n3 ? m[4] : undefined)); const hi = val(m[3], m[4]);
    if (lo > hi) { f.min_revenue_usd_m = hi; f.max_revenue_usd_m = lo; } else { f.min_revenue_usd_m = lo; f.max_revenue_usd_m = hi; }
    return m[0];
  }
  m = new RegExp(String.raw`(?:(?:net )?(?:revenue|turnover|sales)\s*)?(?:above|over|more than|at least|greater than|>=|>)\s*${NUM}`).exec(t);
  if (m && (ctx || m[2])) { f.min_revenue_usd_m = val(m[1], m[2]); return m[0]; }
  m = new RegExp(String.raw`(?:(?:net )?(?:revenue|turnover|sales)\s*)?(?:below|under|less than|up to|at most|<=|<)\s*${NUM}`).exec(t);
  if (m && (ctx || m[2])) { f.max_revenue_usd_m = val(m[1], m[2]); return m[0]; }
  return "";
}
const money = (m: number) => (m >= 1000 && m % 1000 === 0 ? `${m / 1000}b` : m >= 1000 ? `${+(m / 1000).toFixed(2)}b` : `${+m.toFixed(1)}m`);
const revenuePhrase = (f: AccountFilter) => f.min_revenue_usd_m !== undefined && f.max_revenue_usd_m !== undefined ? `net revenue between ${money(f.min_revenue_usd_m)} and ${money(f.max_revenue_usd_m)}`
  : f.min_revenue_usd_m !== undefined ? `net revenue above ${money(f.min_revenue_usd_m)}` : f.max_revenue_usd_m !== undefined ? `net revenue below ${money(f.max_revenue_usd_m)}` : "";

function parseFilters(t: string): AccountFilter {
  const f: AccountFilter = {};
  const region = findRegionIn(t); if (region) f.region = region;
  parseRevenue(t, f);
  const st: string[] = [];
  if (/\bverified\b/.test(t) && !/\bunverified\b/.test(t)) st.push("Verified");
  if (/\blikely\b/.test(t)) st.push("Likely");
  if (/needs? check/.test(t)) st.push("Needs check");
  if (/\bnot icp\b/.test(t)) st.push("Not ICP");
  if (/\bunknown\b/.test(t)) st.push("Unknown");
  if (st.length) f.icp_status = st;
  if (/\bcoupa\b/.test(t)) f.platform = "coupa"; else if (/\bariba\b/.test(t)) f.platform = "ariba";
  const erp = /\b(sap|oracle|dynamics|microsoft|infor|workday)\b/.exec(t); if (erp) f.erp_contains = erp[1] === "microsoft" ? "dynamics" : erp[1];
  const sig = /\b(very strong|strong|moderate|weak)\b/.exec(t); if (sig && /signal/.test(t)) f.signal = [sig[1].toUpperCase()];
  if (/\bwith (a )?(contact|email)|have (a )?contact/.test(t)) f.has_contacts = true;
  return f;
}
const readable = (f: AccountFilter) => [f.icp_status?.join("/"), f.platform && `${f.platform} customers`, f.erp_contains && `running ${f.erp_contains.toUpperCase()}`, f.region && `in ${f.region}`].filter(Boolean).join(" ");

function companyIn(t: string, ctx: AriaContext): { hits: Row[]; term: string } {
  const quoted = /["“]([^"”]+)["”]/.exec(t);
  const q = quoted ? quoted[1].toLowerCase() : t;
  const best: { len: number; rows: Row[]; term: string } = { len: 0, rows: [], term: "" };
  const byCore = new Map<string, Row[]>();
  for (const a of ctx.data.accounts) { const c = core(s(a.company_name)); if (c.length >= 3) (byCore.get(c) || byCore.set(c, []).get(c)!).push(a); }
  for (const [c, rows] of byCore) {
    const re = new RegExp(`(^|[^a-z0-9])${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`);
    if (re.test(q) && c.length > best.len) { best.len = c.length; best.rows = rows; best.term = c; }
  }
  if (best.len) return { hits: best.rows, term: best.term };
  return { hits: [], term: "" };
}
const rowsOf = (ctx: AriaContext, f: AccountFilter, limit = 15) => {
  const r = searchAccounts(ctx, { ...f, limit });
  return { r, md: table(["Company", "Country", "ICP status", "Revenue", "ERP", "Platform", "Signal", "Contacts"],
    r.rows.map((x) => [x.company, x.country, x.icp_status.replace("ICP — ", ""), x.revenue, x.erp, x.s2p_platform, x.signal, x.contacts])) };
};
const nextSteps = (f: AccountFilter, region?: string): AriaChoice[] => {
  const base = [f.icp_status?.join(" and "), "companies", region ? `in ${region}` : ""].filter(Boolean).join(" ");
  return region ? [{ label: "📊 Excel contact list", value: `Excel contact list for ${base}` }, { label: "📄 PDF report", value: `PDF report for ${base}` }] : [];
};

export async function tryFree(question: string, ctx: AriaContext): Promise<FreeReply | null> {
  const t = question.toLowerCase().replace(/\s+/g, " ").trim();
  const f = parseFilters(t);
  if (/include (the )?(existing )?coupa/.test(t)) f.exclude_coupa_customers = false;
  const company = companyIn(t, ctx);
  const num = /\btop\s*(\d{1,3})\b|\b(\d{1,3})\s*compan/.exec(t);
  const limit = num ? Number(num[1] || num[2]) : 0;
  const wantsAll = /\ball\b|\bevery\b|\bfull\b/.test(t);
  const tNoRange = (() => { const g: AccountFilter = {}; const hit = parseRevenue(t, g); return hit ? t.replace(hit, " ") : t; })();
  const rank = /\b(revenue|largest|biggest)\b/.test(tNoRange) ? "revenue" : /\b(a to z|alphabet|by name)\b/.test(t) ? "name" : /\b(fit|icp match|best|promising)\b/.test(t) ? "fit" : "";
  const wantsExcel = /\b(excel|xlsx|spreadsheet|contact list|campaign list)\b/.test(t);
  const wantsPdf = /\b(pdf|brief|dossier)\b/.test(t);
  const wantsReport = /\breport\b/.test(t); // "report" alone: ask whether they want a PDF or an Excel
  const anchored = !!(f.region || f.icp_status || f.platform || f.erp_contains || f.min_revenue_usd_m !== undefined || f.max_revenue_usd_m !== undefined);

  // ---- A named company: its PDF straight away (one company is already a precise request) ----
  if ((wantsPdf || wantsReport) && !wantsExcel && company.hits.length === 1) {
    const out = await runTool("create_pdf", { company_names: [s(company.hits[0].company_name)] }, ctx);
    if (out.action) return { text: `Your PDF report on **${s(company.hits[0].company_name)}** is ready: facts, ICP reasoning, scores, signals, stakeholders (email, phone, LinkedIn) and evidence.`, actions: [out.action], choices: [] };
  }
  if ((wantsPdf || wantsReport) && !wantsExcel && company.hits.length > 1)
    return { text: `Several companies match "${company.term}". Which one?`, actions: [], choices: company.hits.slice(0, 6).map((a) => ({ label: s(a.company_name), value: `PDF report on ${s(a.company_name)}` })) };

  // ---- A set of companies: always ask before building (format, region, how many, how to pick). Each answer is a button that carries the whole request. ----
  if (wantsExcel || ((wantsPdf || wantsReport) && anchored)) {
    const kind: "xlsx" | "pdf" | "" = wantsExcel ? "xlsx" : wantsPdf ? "pdf" : "";
    const label = (k: string) => (k === "xlsx" ? "Excel contact list" : "PDF report");
    const scope = [f.icp_status?.join(" and "), f.platform && `${f.platform} customers`, f.erp_contains && `${f.erp_contains.toUpperCase()} users`].filter(Boolean).join(" ");
    const rev = revenuePhrase(f);
    const stem = (k: string, r: string) => `${label(k || "pdf")} for ${scope ? `${scope} companies` : "companies"} in ${r}${rev ? ` with ${rev}` : ""}`;
    const heard = [f.region, scope, rev].filter(Boolean).join(", ");
    if (!f.region) return { text: "Which region should it cover?", actions: [], choices: (REGIONS as { key: string }[]).map((r) => r.key).filter((k) => ["UAE", "KSA", "Qatar", "Kuwait", "UK", "USA"].includes(k)).map((k) => ({ label: k, value: stem(kind, k) })) };
    if (!kind) return { text: `Which format for ${heard}?`, actions: [], choices: [{ label: "📄 PDF report", value: stem("pdf", f.region) }, { label: "📊 Excel contact list", value: stem("xlsx", f.region) }] };
    if (!limit && !wantsAll) return { text: `How many ${f.region} companies should I include?`, actions: [], choices: [...["1", "5", "10", "25", "50", "all"].map((n) => ({ label: n === "all" ? "All" : n, value: `${stem(kind, f.region!)}, ${n === "all" ? "all companies" : `top ${n}`}` })), { label: "Other number", value: `${stem(kind, f.region!)}, top {n}`, number: true }] };
    if (!rank) return { text: "How should I pick them?", actions: [], choices: [["Best ICP fit", "best fit"], ["Largest revenue", "largest revenue"], ["A to Z", "A to Z"]].map(([l, w]) => ({ label: l, value: `${stem(kind, f.region!)}, ${wantsAll ? "all companies" : `top ${limit}`}, by ${w}` })) };
    const how = rank === "revenue" ? "largest revenue" : rank === "name" ? "name" : "best ICP fit";
    if (kind === "xlsx") {
      const out = await runTool("create_excel", { ...f, region: f.region, rank, ...(limit && !wantsAll ? { limit } : {}) }, ctx);
      const r = out.result as { error?: string; companies_in_file?: number; contacts_in_file?: number; companies_matching?: number };
      if (r.error || !out.action) return { text: r.error || "I could not prepare that file.", actions: [], choices: [] };
      return { text: `Your Excel is ready: **${r.companies_in_file} companies** and **${r.contacts_in_file} contacts** for ${heard}, picked by ${how} (from ${r.companies_matching} matching companies). Each company is listed once with its people beneath it: email, phone and LinkedIn where they are on file.`, actions: [out.action], choices: [] };
    }
    const out = await runTool("create_pdf", { ...f, region: f.region, limit: wantsAll ? 150 : limit, rank }, ctx);
    const r = out.result as { error?: string; companies_matching?: number; companies_in_pdf?: number };
    if (r.error || !out.action) return { text: r.error || "I could not prepare that report.", actions: [], choices: [] };
    return { text: `Your PDF is ready: **${r.companies_in_pdf} companies** (of ${r.companies_matching} matching) for ${heard}, picked by ${how}. Each company has its facts, scores, signals and stakeholders with email, phone and LinkedIn where on file.`, actions: [out.action], choices: [] };
  }
  if (wantsPdf || wantsReport) return null; // "report" with nothing to anchor it: let the AI read it

  // ---- ICP rules ----
  if (/\b(icp rules?|rules? for|icp definition|define icp|criteria)\b/.test(t)) {
    const r = icpRules(ctx, f.region) as { regions?: Record<string, unknown>[]; error?: string };
    if (r.error || !r.regions) return null;
    return { text: `ICP rules${f.region ? ` for ${f.region}` : ""}:\n\n${table(["Region", "Status", "Min revenue (USD M)", "Min staff", "Entity level", "Daily find / verify", "Pipeline match %"],
      r.regions.map((x) => [x.region, x.status, x.revenue_min_usd_m, x.employees_min, String(x.entity_level).replace(/_/g, " "), `${x.daily_find} / ${x.daily_verify}`, x.pipeline_min_match_pct]))}`, actions: [], choices: [] };
  }

  // ---- Counts ----
  if (/\b(how many|count|number of|total)\b/.test(t)) {
    const group = /\b(by|per|each|every) (region|country)|in each region|across (all )?regions|(in|for|of) all (the )?regions|all regions/.test(t) ? "country" : /\b(by|per|each) (status|icp)/.test(t) ? "icp_status"
      : /\b(by|per|each) (platform)/.test(t) ? "platform" : /\b(by|per|each) erp/.test(t) ? "erp" : /\b(by|per|each) (industry|sector)/.test(t) ? "industry"
      : /\b(by|per|each) signal/.test(t) ? "signal" : f.icp_status && !f.region ? "country" : "icp_status";
    const r = countAccounts(ctx, { ...f, group_by: group });
    const label = readable(f) || "all accounts";
    const colName = ({ country: "Region", icp_status: "ICP status", platform: "Platform", erp: "ERP", industry: "Industry", signal: "Signal" } as Record<string, string>)[group] || group;
    if (f.platform === "coupa") { // asked about Coupa customers themselves: there is nothing to separate
      return { text: `**${r.all_accounts}** existing Coupa customers.\n\n${table([colName, "Existing Coupa customers"], r.groups.map((g) => [g.key, g.all_accounts]))}`, actions: [], choices: [] };
    }
    const head = r.existing_coupa_customers
      ? `**${r.prospects}** prospects (${label}), as on the dashboard, plus **${r.existing_coupa_customers}** existing Coupa customers = **${r.all_accounts}** accounts in total.`
      : `**${r.all_accounts}** companies (${label}).`;
    const rows = r.groups.map((g) => [g.key, g.prospects, g.existing_coupa_customers ? `+ ${g.existing_coupa_customers}` : "", g.all_accounts]);
    const note = group === "icp_status" ? "\n\nNote: the dashboard's Needs check tile also counts Unknown." : "";
    return { text: `${head}\n\n${table([colName, "Prospects (dashboard)", "Existing Coupa customers", "All accounts"], rows)}${note}`, actions: [], choices: nextSteps(f, f.region) };
  }

  // ---- One company's detail ----
  if (company.hits.length && /\b(tell me about|about|details?|what do we know|profile|overview|summary|info on|information on|show me)\b/.test(t) && !f.icp_status) {
    if (company.hits.length > 1) return { text: `Several companies match "${company.term}". Which one?`, actions: [], choices: company.hits.slice(0, 6).map((a) => ({ label: s(a.company_name), value: `Tell me about ${s(a.company_name)}` })) };
    const d = getAccount(ctx, { id: s(company.hits[0].id) }) as Record<string, unknown> & { signals?: { level: string; signal: string }[]; contacts?: { name: string; title: string; email: string }[]; maturity?: { level: string; why: string } };
    if (d.error) return null;
    const kv: [string, unknown][] = [["Company", d.company], ["Country / HQ", d.hq], ["ICP status", s(d.icp_status)], ["Net revenue", `${d.revenue}${d.revenue_type ? ` (${d.revenue_type})` : ""}`],
      ["Employees", d.employees], ["ERP", d.erp], ["S2P platform", `${d.s2p_platform}${d.platform_status ? ` · ${d.platform_status}` : ""}`], ["S2P signal", d.signal],
      ["Maturity", d.maturity ? `${d.maturity.level}: ${d.maturity.why}` : ""], ["Ownership / listing", [d.ownership, d.listing].filter(Boolean).join(" · ")], ["Why this ICP status", d.icp_reason],
      ["Opportunity", d.opportunity], ["Website", d.website]].filter(([, v]) => s(v)) as [string, unknown][];
    const sig = (d.signals || []).slice(0, 4).map((x) => `- **${x.level}**: ${x.signal}`).join("\n");
    const ppl = (d.contacts || []).slice(0, 5);
    const name = s(d.company);
    return { text: `${table(["Field", "Detail"], kv)}${sig ? `\n\n**Top signals**\n${sig}` : ""}${ppl.length ? `\n\n**Contacts**\n${table(["Name", "Title", "Email"], ppl.map((p) => [p.name, p.title, p.email]))}` : ""}`,
      actions: [], choices: [{ label: "📄 PDF report", value: `PDF report on ${name}` }, { label: "👥 Contacts", value: `Contacts at ${name}` }] };
  }

  // ---- A role is named ("... have a CFO contact", "who are the procurement heads in KSA"): answer at person level, with name and title ----
  const roleWord = /\b(cfos?|cpos?|ceos?|cios?|ctos?|coos?|chief financial officers?|chief procurement officers?|head of procurement|procurement (heads?|directors?|leaders?)|finance (heads?|directors?))\b/.exec(t)?.[1];
  if (roleWord && !wantsExcel && !wantsPdf && !/\b(how many|count|number of)\b/.test(t) && !(company.hits.length === 1 && /\b(tell me about|about|details?)\b/.test(t))) {
    const role = roleKey(roleWord.replace(/s$/, "").replace(/chief financial officer/, "cfo").replace(/chief procurement officer/, "cpo").replace(/.*procurement.*/, "procurement").replace(/finance.*/, "finance"));
    const r = searchContacts(ctx, { ...f, role: role || undefined, company_name: company.hits.length === 1 ? s(company.hits[0].company_name) : undefined, limit: 25 });
    const label = (role || "matching").toUpperCase();
    const one = company.hits.length === 1 ? s(company.hits[0].company_name) : "";
    if (!r.total) return { text: `No **${label}** contacts are on file${one ? ` at ${one}` : readable(f) ? ` (${readable(f)})` : ""}. Contacts exist only for companies enriched from the workbook or Seamless; most non-UAE regions have none yet.`, actions: [], choices: [] };
    const head = one ? `**${r.total}** ${label} contact${r.total === 1 ? "" : "s"} at ${one}:`
      : `**${r.companies_with_a_match}** of ${r.companies_in_filter} companies${readable(f) ? ` (${readable(f)})` : ""} have a ${label} contact on file${r.total > r.shown ? `; showing ${r.shown} of ${r.total} people, largest companies first` : ""}:`;
    return { text: `${head}\n\n${table(["Company", "Revenue", "ERP", label + " name", "Title", "Email"],
      r.rows.map((x) => [x.company, x.revenue, x.erp, x.name, x.title, x.email]))}`, actions: [], choices: f.region ? nextSteps(f, f.region).slice(0, 1) : [] };
  }

  // ---- Contacts ----
  if (/\b(contacts?|stakeholders?|people|cfos?|cpos?|ceos?|cios?|ctos?|coos?|head of|directors?|who is|who are|emails?)\b/.test(t) && !wantsExcel
    && !(f.has_contacts || ((f.icp_status || f.platform || f.erp_contains) && !company.hits.length))) {
    const title = /\b(cfo|cpo|ceo|cio|cto|coo)s?\b/.exec(t)?.[1] || (/head of procurement|procurement/.test(t) ? "procurement" : "");
    const r = searchContacts(ctx, { company_name: company.hits[0] && company.hits.length === 1 ? s(company.hits[0].company_name) : undefined, region: f.region, title_contains: title || undefined, limit: 20 });
    if (!company.hits.length && !f.region && !title) return null;
    if (!r.total) return { text: `No contacts with an official email match that. ${r.note}`, actions: [], choices: [] };
    return { text: `**${r.total}** contacts with an official email${r.total > r.shown ? ` (showing ${r.shown})` : ""}:\n\n${table(["Company", "Name", "Title", "Tier", "Email"], r.rows.map((x) => [x.company, x.name, x.title, x.tier, x.email]))}`, actions: [], choices: f.region ? nextSteps({}, f.region).slice(0, 1) : [] };
  }

  // ---- Lists ----
  // A revenue amount was written but not understood: ask, never guess (a wrong filter shows the wrong companies)
  if (/\b(revenue|turnover|sales)\b/.test(t) && /(\$|usd|aed|\d\s*(m|mn|million|b|bn|billion)\b)/.test(t) && f.min_revenue_usd_m === undefined && f.max_revenue_usd_m === undefined)
    return { text: "I could not read that revenue range, so I have not filtered by it. Say it like **between 250m and 650m**, **above 1b** or **below 100m** (US dollars).", actions: [], choices: [] };
  if (/\b(list|show|which|find|give me|display|top|largest|biggest|who)\b/.test(t) && (f.region || f.icp_status || f.platform || f.erp_contains || f.signal || f.has_contacts) && /\b(compan\w*|account\w*|customer\w*|prospect\w*|verified|likely)\b/.test(t)) {
    const r = searchAccounts(ctx, { ...f, limit: Math.min(limit || 15, 25) });
    if (!r.total && !r.existing_coupa_customers) return { text: "No companies match that.", actions: [], choices: [] };
    const md = table(["Company", "Country", "ICP status", "Revenue", "ERP", "Platform", "Signal", "Contacts"],
      r.rows.map((x) => [x.company, x.country, x.icp_status.replace("ICP — ", ""), x.revenue, x.erp, x.s2p_platform, x.signal, x.contacts]));
    const coupaLine = !r.coupa_customers_included_in_rows && r.existing_coupa_customers
      ? `\n\n+ **${r.existing_coupa_customers}** existing Coupa customers also match; they are not listed here (as on the dashboard). Say "include Coupa customers" to see them.` : "";
    return { text: `**${r.total}** prospects${[readable(f), revenuePhrase(f)].filter(Boolean).length ? ` (${[readable(f), revenuePhrase(f)].filter(Boolean).join(", ")})` : ""}${r.total > r.shown ? `, showing the ${r.shown} largest by revenue` : ""}:\n\n${md}${coupaLine}`, actions: [], choices: nextSteps(f, f.region) };
  }
  return null;
}

export { parseRevenue as parseRevenueText }; // exported so the range reading can be tested

// ---- Conversation memory: a chat is one topic until the person completes it ----
const REFINE_START = /^(only|also|just|now|then|and|but|with|without|exclude|instead|make it|narrow|add|remove|same|those|them|these|filter|sort|rank|order|limit|change|what about|how about)\b/;
const REFINE_REF = /\b(from (those|them|these|that)|of (those|them|these)|among (those|them)|in that (list|set)|the same)\b/;
const FILTER_WORD = /\b(verified|likely|needs check|unknown|not icp|coupa|ariba|sap|oracle|dynamics|revenue|above|below|between|only|contacts?|email|phone|top \d+)\b/;
const ASKS = /\b(list|show|find|give me|how many|count|number of|report|pdf|excel|tell me about|who|which|top \d+|what is|what are)\b/;
const clean = (m: string) => m.replace(/^§(keep|new):\s*/, "").trim();
const isRefinement = (m: string) => { const t = clean(m).toLowerCase(); return REFINE_START.test(t) || REFINE_REF.test(t) || (t.split(/\s+/).length <= 6 && FILTER_WORD.test(t) && !findRegionIn(t) && !/\b(list|find|how many|report|pdf|excel|tell me about)\b/.test(t)); };
/**
 * What Aria should answer for the newest typed message, given the earlier ones in this chat.
 * - A refinement ("only verified", "also with Coupa", "above 400m") is added to the earlier question, so the chat stays on its topic.
 * - A brand-new standalone question while a topic is open is not run at once: Aria asks whether to close this chat (it stays in History) or keep going.
 * - Answers to Aria's own buttons (flow) and a first question always run as they are.
 */
export function conversation(question: string, prior: string[], flow: boolean): { question: string; ask?: FreeReply } {
  const forced = /^§keep:/.test(question);
  const q = clean(question);
  const earlier = prior.filter((m) => !/^§new:/.test(m));
  if (!earlier.length || flow) return { question: forced || isRefinement(q) ? withTopic(q, earlier) : q };
  if (forced || isRefinement(q)) return { question: withTopic(q, earlier) };
  const t = q.toLowerCase();
  const standalone = ASKS.test(t) || !!findRegionIn(t);
  if (!standalone) return { question: q };
  return { question: q, ask: { text: "That looks like a **new question**. Shall I close this chat, which stays saved in History, and start a new one? Or keep going with the current topic and use your earlier criteria too?", actions: [],
    choices: [{ label: "Close this chat, start a new one", value: `§new:${q}` }, { label: "Keep going in this chat", value: `§keep:${q}` }] } };
}
function withTopic(q: string, earlier: string[]): string {
  let eff = "";
  for (const m of earlier) { const c = clean(m); eff = isRefinement(c) && eff ? `${c}, ${eff}` : c; }
  if (!eff) return q;
  // what the newest message says again replaces the earlier version (a new revenue range, a different status), it does not add to it
  const ql = q.toLowerCase(); let e = eff.toLowerCase();
  if (parseRevenue(ql, {})) { const h = parseRevenue(e, {}); if (h) e = e.replace(h, " "); }
  if (/\b(verified|likely|needs? check|not icp|unknown)\b/.test(ql) && !/\bunverified\b/.test(ql)) e = e.replace(/\b(verified|likely|needs? check|not icp|unknown)\b/g, " ");
  return `${q}, ${e.replace(/\s+/g, " ").trim()}`;
}
