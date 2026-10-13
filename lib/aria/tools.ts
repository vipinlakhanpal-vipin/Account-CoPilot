import "server-only";
import type { AllData, Row } from "@/lib/data";
import { buildPeople, type Person } from "@/lib/people";
import { revenueOf, revenueIsOfficial, fmtMoneyM, procurementMaturity } from "@/lib/icp";
import { regionOf, rulesFor, REGIONS } from "@/lib/icpDefinition.mjs";

// Aria's read-only data tools. Every tool works on the data the signed-in user is allowed to see (already scoped by region),
// returns compact rows, and never returns more than a screenful: the model summarises, the file buttons carry the rest.
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const UNKNOWN = /^(unknown|no evidence|none|not[ _](identified|found|public)|n\/a)$/i;
const known = (v: unknown) => { const t = s(v); return t && !UNKNOWN.test(t) ? t : ""; };
const cut = (v: unknown, n = 280) => { const t = s(v); return t.length > n ? `${t.slice(0, n)}…` : t; };
const isCoupa = (a: Row) => /coupa/i.test(s(a.existing_s2p_product));

export type AccountFilter = {
  region?: string; icp_status?: string[]; platform?: string; erp_contains?: string; industry_contains?: string; signal?: string[];
  name_contains?: string; min_revenue_usd_m?: number; max_revenue_usd_m?: number; has_contacts?: boolean; exclude_coupa_customers?: boolean;
};

export type AriaContext = { data: AllData; def: unknown; criteria: unknown; people: Person[]; peopleByCo: Map<string, Person[]>; engineLog: Row[] };
export function makeContext(data: AllData, def: unknown, criteria: unknown, engineLog: Row[] = []): AriaContext {
  const people = buildPeople(data.contacts);
  const peopleByCo = new Map<string, Person[]>();
  for (const p of people) (peopleByCo.get(p.company_id as string) || peopleByCo.set(p.company_id as string, []).get(p.company_id as string)!).push(p);
  return { data, def, criteria, people, peopleByCo, engineLog };
}

/** "KSA", "Saudi Arabia" or "saudi" → the region key, or "" when it isn't one we cover. */
export function regionKey(v: unknown): string {
  const t = s(v).toLowerCase();
  if (!t) return "";
  const hit = REGIONS.find((r: { key: string; name: string; countries: string[] }) => r.key.toLowerCase() === t || r.name.toLowerCase() === t || r.countries.some((c) => c.toLowerCase() === t));
  return hit ? hit.key : regionOf(v) !== "Unknown" ? regionOf(v) : "";
}
const statusName = (v: string) => { const t = v.replace(/^icp\s*[—-]\s*/i, "").trim().toLowerCase();
  return t === "verified" ? "ICP — Verified" : t === "likely" ? "ICP — Likely" : /needs?\s*check/.test(t) ? "ICP — Needs check" : t === "not icp" ? "Not ICP" : t === "unknown" ? "Unknown" : v; };
const signalName = (v: string) => { const t = v.trim().toUpperCase(); return /SIGNAL$/.test(t) ? t : `${t} SIGNAL`; };

export function filterAccounts(ctx: AriaContext, f: AccountFilter): Row[] {
  const reg = f.region ? regionKey(f.region) : "";
  const st = (f.icp_status || []).map(statusName);
  const sg = (f.signal || []).map(signalName);
  const platform = s(f.platform).toLowerCase();
  const other = /oracle procurement|ivalua|jaggaer|\bgep\b|zycus/i;
  return ctx.data.accounts.filter((a) => {
    if (reg && regionOf(a.country) !== reg) return false;
    if (st.length && !st.includes(s(a.icp_status))) return false;
    if (sg.length && !sg.includes(s(a.s2p_signal_level))) return false;
    if (platform === "coupa" && !isCoupa(a)) return false;
    if (platform === "ariba" && !/ariba/i.test(s(a.existing_s2p_product))) return false;
    if (platform === "other" && !other.test(s(a.existing_s2p_product))) return false;
    if (platform === "none" && (/coupa|ariba/i.test(s(a.existing_s2p_product)) || other.test(s(a.existing_s2p_product)))) return false;
    if (f.erp_contains && !s(a.erp).toLowerCase().includes(f.erp_contains.toLowerCase())) return false;
    if (f.industry_contains && !s(a.industry).toLowerCase().includes(f.industry_contains.toLowerCase())) return false;
    if (f.name_contains && !s(a.company_name).toLowerCase().includes(f.name_contains.toLowerCase())) return false;
    const rev = revenueOf(a);
    if (f.min_revenue_usd_m !== undefined && (rev === null || rev < f.min_revenue_usd_m)) return false;
    if (f.max_revenue_usd_m !== undefined && (rev === null || rev > f.max_revenue_usd_m)) return false;
    if (f.has_contacts && !(ctx.peopleByCo.get(a.id)?.length)) return false;
    if (f.exclude_coupa_customers && isCoupa(a)) return false;
    return true;
  });
}

const curOf = (ctx: AriaContext, a: Row) => rulesFor(ctx.def, a.country).currency as { code: string; per_usd: number };
function accountRow(ctx: AriaContext, a: Row) {
  const rev = revenueOf(a);
  return { id: a.id, company: s(a.company_name), country: s(a.country), icp_status: s(a.icp_status), revenue: rev ? fmtMoneyM(rev, curOf(ctx, a)) : "",
    revenue_type: rev ? (revenueIsOfficial(a) ? "official" : "estimate") : "", erp: known(a.erp).replace(/\s*\(.*$/, ""), s2p_platform: known(a.existing_s2p_product),
    platform_status: known(a.s2p_platform_status), signal: s(a.s2p_signal_level).replace(" SIGNAL", ""), employees: known(a.employee_range).replace(/\s*\(.*$/, ""),
    industry: s(a.industry).replace(/_/g, " "), contacts: ctx.peopleByCo.get(a.id)?.length || 0, existing_coupa_customer: isCoupa(a) };
}

export function searchAccounts(ctx: AriaContext, f: AccountFilter & { sort_by?: string; limit?: number }) {
  const rows = filterAccounts(ctx, f);
  const sort = s(f.sort_by) || "revenue";
  rows.sort((x, y) => sort === "name" ? s(x.company_name).localeCompare(s(y.company_name)) : (revenueOf(y) || 0) - (revenueOf(x) || 0));
  const limit = Math.min(Math.max(Number(f.limit) || 15, 1), 40);
  return { total: rows.length, shown: Math.min(limit, rows.length), existing_coupa_customers_in_total: rows.filter(isCoupa).length,
    note: rows.length > limit ? `Only the first ${limit} are shown; offer an Excel or PDF for the full list.` : undefined, rows: rows.slice(0, limit).map((a) => accountRow(ctx, a)) };
}

const GROUPS: Record<string, (a: Row) => string> = {
  icp_status: (a) => s(a.icp_status) || "Unknown", country: (a) => s(a.country) || "Unknown", signal: (a) => s(a.s2p_signal_level).replace(" SIGNAL", "") || "No signal",
  platform: (a) => known(a.existing_s2p_product) || "None found", erp: (a) => known(a.erp).replace(/\s*\(.*$/, "") || "Unknown", industry: (a) => s(a.industry).replace(/_/g, " ") || "Unknown",
  entity_type: (a) => s(a.entity_type) || "Unknown",
};
export function countAccounts(ctx: AriaContext, f: AccountFilter & { group_by?: string }) {
  const rows = filterAccounts(ctx, f), by = GROUPS[s(f.group_by)] ? s(f.group_by) : "icp_status", counts = new Map<string, number>();
  rows.forEach((a) => { const k = GROUPS[by](a); counts.set(k, (counts.get(k) || 0) + 1); });
  return { total: rows.length, group_by: by, existing_coupa_customers_in_total: rows.filter(isCoupa).length,
    groups: [...counts.entries()].sort((x, y) => y[1] - x[1]).slice(0, 30).map(([key, count]) => ({ key, count })) };
}

export function findAccounts(ctx: AriaContext, q: { id?: string; name?: string }) {
  if (q.id) return ctx.data.accounts.filter((a) => a.id === q.id);
  const n = s(q.name).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!n) return [];
  const norm = (a: Row) => s(a.company_name).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const exact = ctx.data.accounts.filter((a) => norm(a) === n);
  return exact.length ? exact : ctx.data.accounts.filter((a) => norm(a).includes(n) || (n.length > 3 && n.includes(norm(a)))).slice(0, 6);
}

export function getAccount(ctx: AriaContext, q: { id?: string; name?: string }) {
  const hits = findAccounts(ctx, q);
  if (!hits.length) return { error: "No account matches that name or id." };
  if (hits.length > 1) return { error: "Several accounts match; ask which one.", candidates: hits.map((a) => ({ id: a.id, company: s(a.company_name), country: s(a.country), icp_status: s(a.icp_status) })) };
  const a = hits[0], row = accountRow(ctx, a), mat = procurementMaturity(a);
  const sigs = ctx.data.signals.filter((x) => x.company_id === a.id).slice(0, 6).map((x) => ({ level: s(x.level), signal: cut(x.signal, 160), evidence: cut(x.evidence, 200), date: s(x.date) }));
  const people = (ctx.peopleByCo.get(a.id) || []).slice(0, 10).map((p) => ({ name: s(p.full_name), title: cut(p.title_verbatim, 90), tier: s(p.contact_tier), email: s(p.email), trust: s(p.trust) }));
  return { ...row, website: s(a.company_website || a.domain), hq: [s(a.hq_city), s(a.country)].filter(Boolean).join(", "), ownership: cut(a.ownership, 120), parent: s(a.parent_company),
    listing: s(a.listing_status || a.exchange), entity_type: s(a.entity_type), icp_reason: cut(a.icp_fit_reason, 400), s2p_signals_text: cut(a.s2p_strong_signals, 400),
    maturity: { level: mat.level, why: cut(mat.why, 200) }, transformation: { procurement: cut(a.procurement_transformation_signals, 240), digital: cut(a.digital_transformation_signals, 240) },
    opportunity: cut(a.potential_opportunity, 300), notes: cut(a.account_notes, 300), signals: sigs, contacts: people, last_researched: s(a.last_researched).slice(0, 10) };
}

export function searchContacts(ctx: AriaContext, f: { company_name?: string; region?: string; title_contains?: string; tier?: string; has_email?: boolean; limit?: number }) {
  const reg = f.region ? regionKey(f.region) : "";
  const byId = new Map(ctx.data.accounts.map((a) => [a.id, a]));
  let rows = ctx.people.filter((p) => p.trust !== "Conflicting");
  rows = rows.filter((p) => {
    const a = byId.get(p.company_id as string);
    if (!a) return false;
    if (reg && regionOf(a.country) !== reg) return false;
    if (f.company_name && !s(a.company_name).toLowerCase().includes(f.company_name.toLowerCase())) return false;
    if (f.title_contains && !s(p.title_verbatim).toLowerCase().includes(f.title_contains.toLowerCase())) return false;
    if (f.tier && !s(p.contact_tier).toLowerCase().includes(f.tier.toLowerCase())) return false;
    if (f.has_email !== false && !s(p.email)) return false;
    return true;
  });
  const limit = Math.min(Math.max(Number(f.limit) || 20, 1), 40);
  return { total: rows.length, shown: Math.min(limit, rows.length), note: "Contacts exist only for companies enriched from the workbook or Seamless; most non-UAE regions have none yet.",
    rows: rows.slice(0, limit).map((p) => { const a = byId.get(p.company_id as string)!; return { company: s(a.company_name), country: s(a.country), name: s(p.full_name),
      title: cut(p.title_verbatim, 90), tier: s(p.contact_tier), email: s(p.email), phone: s(p.phone) }; }) };
}

// ---------- everything else that lives in the app ----------
const lc = (v: unknown) => s(v).toLowerCase();
const coName = (ctx: AriaContext, id: unknown) => s(ctx.data.accounts.find((a) => a.id === id)?.company_name);
const limitOf = (v: unknown, d = 15, max = 40) => Math.min(Math.max(Number(v) || d, 1), max);

/** One search across accounts, contacts, signals, technology and sources: where does this word appear? */
export function fullTextSearch(ctx: AriaContext, q: { query: string; limit?: number }) {
  const n = lc(q.query);
  if (n.length < 2) return { error: "Give a word or phrase of at least two letters." };
  const per = limitOf(q.limit, 6, 12);
  const ACC = ["company_name", "industry", "erp", "existing_s2p_product", "hq_city", "account_notes", "potential_opportunity", "s2p_strong_signals",
    "procurement_transformation_signals", "digital_transformation_signals", "icp_fit_reason", "subsidiaries", "parent_company", "relevant_technologies"];
  const accs = ctx.data.accounts.filter((a) => ACC.some((k) => lc(a[k]).includes(n)));
  const ppl = ctx.people.filter((p) => ["full_name", "title_verbatim", "email", "company"].some((k) => lc(p[k]).includes(n)));
  const sigs = ctx.data.signals.filter((x) => lc(x.signal).includes(n) || lc(x.evidence).includes(n));
  const apps = ctx.data.apps.filter((x) => lc(x.name).includes(n) || lc(x.evidence).includes(n));
  const srcs = ctx.data.sources.filter((x) => lc(x.information_found).includes(n) || lc(x.source).includes(n));
  return { query: q.query,
    companies: { total: accs.length, rows: accs.slice(0, per).map((a) => accountRow(ctx, a)) },
    people: { total: ppl.length, rows: ppl.slice(0, per).map((p) => ({ name: s(p.full_name), title: cut(p.title_verbatim, 80), company: s(p.company), email: s(p.email) })) },
    signals: { total: sigs.length, rows: sigs.slice(0, per).map((x) => ({ company: coName(ctx, x.company_id), level: s(x.level), signal: cut(x.signal, 140), date: s(x.date) })) },
    technology: { total: apps.length, rows: apps.slice(0, per).map((x) => ({ company: coName(ctx, x.company_id), name: s(x.name), category: s(x.category), status: s(x.status) })) },
    sources: { total: srcs.length, rows: srcs.slice(0, per).map((x) => ({ company: coName(ctx, x.company_id), source: cut(x.source, 80), tier: s(x.source_tier), found: cut(x.information_found, 140) })) } };
}

export function searchSignals(ctx: AriaContext, f: { company_name?: string; level?: string; platform?: string; text?: string; region?: string; limit?: number }) {
  const reg = f.region ? regionKey(f.region) : "", byId = new Map(ctx.data.accounts.map((a) => [a.id, a]));
  const lvl = f.level ? signalName(f.level) : "";
  const rows = ctx.data.signals.filter((x) => {
    const a = byId.get(x.company_id);
    if (!a) return false;
    if (reg && regionOf(a.country) !== reg) return false;
    if (f.company_name && !lc(a.company_name).includes(lc(f.company_name))) return false;
    if (lvl && s(x.level) !== lvl) return false;
    if (f.platform && !lc(x.platform).includes(lc(f.platform))) return false;
    if (f.text && !(lc(x.signal).includes(lc(f.text)) || lc(x.evidence).includes(lc(f.text)))) return false;
    return true;
  });
  const limit = limitOf(f.limit);
  return { total: rows.length, shown: Math.min(limit, rows.length), rows: rows.slice(0, limit).map((x) => ({ company: coName(ctx, x.company_id), level: s(x.level), category: s(x.category),
    platform: s(x.platform), signal: cut(x.signal, 150), evidence: cut(x.evidence, 160), date: s(x.date), source: s(x.source_url) })) };
}

export function searchTechnology(ctx: AriaContext, f: { company_name?: string; name_contains?: string; category?: string; status?: string; limit?: number }) {
  const rows = ctx.data.apps.filter((x) => (!f.company_name || lc(coName(ctx, x.company_id)).includes(lc(f.company_name)))
    && (!f.name_contains || lc(x.name).includes(lc(f.name_contains))) && (!f.category || lc(x.category).includes(lc(f.category))) && (!f.status || lc(x.status).includes(lc(f.status))));
  const limit = limitOf(f.limit);
  return { total: rows.length, shown: Math.min(limit, rows.length), rows: rows.slice(0, limit).map((x) => ({ company: coName(ctx, x.company_id), name: s(x.name), category: s(x.category),
    status: s(x.status), evidence: cut(x.evidence, 160) })) };
}

export function searchConflicts(ctx: AriaContext, f: { company_name?: string; field?: string; limit?: number }) {
  const rows = ctx.data.conflicts.filter((x) => (!f.company_name || lc(coName(ctx, x.company_id)).includes(lc(f.company_name))) && (!f.field || lc(x.field).includes(lc(f.field))));
  const limit = limitOf(f.limit);
  return { total: rows.length, shown: Math.min(limit, rows.length), rows: rows.slice(0, limit).map((x) => ({ company: coName(ctx, x.company_id), entity: s(x.entity), field: s(x.field),
    value_a: cut(x.value_a, 120), value_b: cut(x.value_b, 120) })) };
}

export function searchHistory(ctx: AriaContext, f: { company_name?: string; person?: string; determination_contains?: string; limit?: number }) {
  const rows = ctx.data.history.filter((x) => (!f.company_name || lc(x.company || coName(ctx, x.company_id)).includes(lc(f.company_name)))
    && (!f.person || lc(x.full_name).includes(lc(f.person))) && (!f.determination_contains || lc(x.determination).includes(lc(f.determination_contains))));
  const limit = limitOf(f.limit);
  return { total: rows.length, shown: Math.min(limit, rows.length), rows: rows.slice(0, limit).map((x) => ({ person: s(x.full_name), company: s(x.company || coName(ctx, x.company_id)),
    title: cut(x.title, 90), determination: cut(x.determination, 120), source: cut(x.source, 80) })) };
}

export function icpRules(ctx: AriaContext, region?: string) {
  const keys = region ? [regionKey(region)].filter(Boolean) : REGIONS.map((r: { key: string }) => r.key);
  if (!keys.length) return { error: "Unknown region." };
  return { regions: keys.map((k) => {
    const r = rulesFor(ctx.def, k) as { status: string; revenue: { min_usd_m: number; max_usd_m: number | null }; employees: { min: number; max: number | null }; listing: string; entity_level: string;
      ownership_allowed: string[]; engine: { discover_per_day: number; verify_per_day: number }; pipeline: { min_match: number; exclude_not_icp: boolean }; focus: { platforms: string[]; erp: string[]; triggers: string[] } };
    return { region: k, status: r.status, revenue_min_usd_m: r.revenue.min_usd_m, revenue_max_usd_m: r.revenue.max_usd_m, employees_min: r.employees.min, listing: r.listing,
      entity_level: r.entity_level, ownership_allowed: r.ownership_allowed, daily_find: r.engine.discover_per_day, daily_verify: r.engine.verify_per_day,
      pipeline_min_match_pct: r.pipeline.min_match, focus_platforms: r.focus.platforms, focus_erp: r.focus.erp, focus_triggers: r.focus.triggers };
  }) };
}

export function engineActivity(ctx: AriaContext, f: { region?: string; limit?: number }) {
  if (!ctx.engineLog.length) return { note: "Engine run history is not available to this user, or no runs are recorded yet." };
  const reg = f.region ? regionKey(f.region) : "";
  const rows = ctx.engineLog.filter((e) => !reg || regionKey(e.region) === reg || s(e.region).includes(reg));
  const limit = limitOf(f.limit, 10, 30);
  return { total: rows.length, rows: rows.slice(0, limit).map((e) => ({ at: s(e.at).slice(0, 16).replace("T", " "), region: s(e.region), source: s(e.source),
    new_companies: Array.isArray(e.new_companies) ? e.new_companies.length : 0, checked: Number(e.verified) || 0, summary: cut(e.summary, 200) })) };
}
