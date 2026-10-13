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
function parseFilters(t: string): AccountFilter {
  const f: AccountFilter = {};
  const region = findRegionIn(t); if (region) f.region = region;
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
  const rank = /\b(revenue|largest|biggest)\b/.test(t) ? "revenue" : /\b(a to z|alphabet|by name)\b/.test(t) ? "name" : /\b(fit|icp match|best|promising)\b/.test(t) ? "fit" : "";
  const wantsExcel = /\b(excel|xlsx|spreadsheet|contact list|campaign list)\b/.test(t);
  const wantsPdf = /\b(pdf|report|brief|dossier)\b/.test(t);

  // ---- Excel: always ask region, how many, how to pick (as buttons) before building ----
  if (wantsExcel) {
    const scope = [f.icp_status?.join(" and "), f.platform && `${f.platform} customers`, f.erp_contains && `${f.erp_contains.toUpperCase()} users`].filter(Boolean).join(" ");
    const stem = (r: string) => `Excel contact list for ${scope ? `${scope} companies` : "companies"} in ${r}`;
    if (!f.region) return { text: "Which region should the contact list cover?", actions: [], choices: (REGIONS as { key: string }[]).map((r) => r.key).filter((k) => ["UAE", "KSA", "Qatar", "Kuwait", "UK", "USA"].includes(k)).map((k) => ({ label: k, value: stem(k) })) };
    if (!limit && !wantsAll) return { text: `How many ${f.region} companies should I include?`, actions: [], choices: ["1", "5", "10", "25", "50", "all"].map((n) => ({ label: n === "all" ? "All" : n, value: `${stem(f.region!)}, ${n === "all" ? "all companies" : `top ${n}`}` })) };
    if (!rank) return { text: "How should I pick them?", actions: [], choices: [["Best ICP fit", "best fit"], ["Largest revenue", "largest revenue"], ["A to Z", "A to Z"]].map(([label, w]) => ({ label, value: `${stem(f.region!)}, ${wantsAll ? "all companies" : `top ${limit}`}, by ${w}` })) };
    const out = await runTool("create_excel", { ...f, region: f.region, rank, ...(limit && !wantsAll ? { limit } : {}) }, ctx);
    const r = out.result as { error?: string; companies_in_file?: number; contacts_in_file?: number; companies_matching?: number };
    if (r.error || !out.action) return { text: r.error || "I could not prepare that file.", actions: [], choices: [] };
    return { text: `Your Excel is ready: **${r.companies_in_file} companies** and **${r.contacts_in_file} contacts** for ${f.region}, picked by ${rank === "revenue" ? "largest revenue" : rank === "name" ? "name" : "best ICP fit"} (from ${r.companies_matching} matching companies). Each company is listed once with its contacts beneath it.`, actions: [out.action], choices: [] };
  }

  // ---- PDF: a named company, or a set ----
  if (wantsPdf) {
    if (company.hits.length === 1) {
      const out = await runTool("create_pdf", { company_names: [s(company.hits[0].company_name)] }, ctx);
      if (out.action) return { text: `Your PDF report on **${s(company.hits[0].company_name)}** is ready: facts, ICP reasoning, scores, signals, stakeholders and evidence.`, actions: [out.action], choices: [] };
    }
    if (company.hits.length > 1) return { text: `Several companies match "${company.term}". Which one?`, actions: [], choices: company.hits.slice(0, 6).map((a) => ({ label: s(a.company_name), value: `PDF report on ${s(a.company_name)}` })) };
    if (f.region || f.icp_status || f.platform || f.erp_contains) {
      const n = limit || 25;
      const out = await runTool("create_pdf", { ...f, limit: n, rank: rank || "fit" }, ctx);
      const r = out.result as { error?: string; companies_matching?: number; companies_in_pdf?: number };
      if (r.error || !out.action) return { text: r.error || "I could not prepare that report.", actions: [], choices: [] };
      return { text: `Your PDF is ready: **${r.companies_in_pdf} companies** (of ${r.companies_matching} matching), most promising first.`, actions: [out.action], choices: [] };
    }
    return null; // "report" with nothing to anchor it: let the AI read it
  }

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
  if (/\b(list|show|which|find|give me|display|top|largest|biggest|who)\b/.test(t) && (f.region || f.icp_status || f.platform || f.erp_contains || f.signal || f.has_contacts) && /\b(compan\w*|account\w*|customer\w*|prospect\w*|verified|likely)\b/.test(t)) {
    const r = searchAccounts(ctx, { ...f, limit: Math.min(limit || 15, 25) });
    if (!r.total && !r.existing_coupa_customers) return { text: "No companies match that.", actions: [], choices: [] };
    const md = table(["Company", "Country", "ICP status", "Revenue", "ERP", "Platform", "Signal", "Contacts"],
      r.rows.map((x) => [x.company, x.country, x.icp_status.replace("ICP — ", ""), x.revenue, x.erp, x.s2p_platform, x.signal, x.contacts]));
    const coupaLine = !r.coupa_customers_included_in_rows && r.existing_coupa_customers
      ? `\n\n+ **${r.existing_coupa_customers}** existing Coupa customers also match; they are not listed here (as on the dashboard). Say "include Coupa customers" to see them.` : "";
    return { text: `**${r.total}** prospects${readable(f) ? ` (${readable(f)})` : ""}${r.total > r.shown ? `, showing the ${r.shown} largest by revenue` : ""}:\n\n${md}${coupaLine}`, actions: [], choices: nextSteps(f, f.region) };
  }
  return null;
}
