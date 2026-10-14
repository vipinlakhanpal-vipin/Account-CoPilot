import "server-only";
import type { AllData, Row } from "@/lib/data";
import { buildPeople } from "@/lib/people";
import { revenueOf, revenueIsOfficial, fmtMoneyM } from "@/lib/icp";
import { regionOf, rulesFor, REGIONS } from "@/lib/icpDefinition.mjs";

// Find company → "Search Company": one box that searches everything already in the app (name, former names, website,
// city, industry, ERP, platform) and understands plain filters typed into it (revenue > 250M, verified, KSA, SAP, coupa…).
// Pure and read-only. The caller passes data already scoped to the user's regions, so nothing here can leak another region.
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const low = (v: unknown) => s(v).toLowerCase();
const isCoupa = (a: Row) => /coupa/i.test(s(a.existing_s2p_product));
const OTHER_S2P = /oracle procurement|ivalua|jaggaer|\bgep\b|zycus/i;
const platformOf = (a: Row) => { const p = s(a.existing_s2p_product); return /coupa/i.test(p) ? "Coupa" : /ariba/i.test(p) ? "SAP Ariba" : OTHER_S2P.test(p) ? "Other S2P" : "No platform on file"; };
const listingOf = (a: Row) => { const l = low(a.listing_status);
  return /^listed/.test(l) ? "Listed" : /government/.test(l) ? "Government-owned" : /subsidiary/.test(l) ? "Subsidiary of listed group" : /private/.test(l) ? "Private" : "Unknown"; };
const STATUSES = ["ICP — Verified", "ICP — Likely", "ICP — Needs check", "Unknown", "Not ICP"];

export type FindFilters = { region?: string[]; status?: string[]; listing?: string[]; signal?: string[]; platform?: string[]; contacts?: boolean };
export type FindQuery = FindFilters & { q: string; sort?: "best" | "revenue" | "name"; limit?: number };
export type FindItem = { id: string; slug: string; company_name: string; country: string; region: string; hq_city: string; industry: string; icp_status: string;
  revenue: string; revenue_note: string; employees: string; erp: string; platform: string; signal: string; listing: string; contacts: number; coupa_customer: boolean; matched: string[] };
export type Facet = { value: string; count: number };

type Parsed = { tokens: string[]; revMin?: number; revMax?: number; empMin?: number; empMax?: number; region: string[]; status: string[]; listing: string[];
  signal: string[]; platform: string[]; contacts: boolean; understood: { label: string; without: string }[] };

const REGION_WORDS: Record<string, string> = { uae: "UAE", emirates: "", dubai: "", ksa: "KSA", saudi: "KSA", "saudi arabia": "KSA", qatar: "Qatar", kuwait: "Kuwait", oman: "Oman",
  bahrain: "Bahrain", egypt: "Egypt", usa: "USA", "united states": "USA", uk: "UK", "united kingdom": "UK", germany: "Germany", morocco: "Morocco", kenya: "Kenya", "south africa": "SouthAfrica" };
const toM = (n: string, unit?: string) => { const v = Number(n.replace(/,/g, "")); const u = (unit || "").toLowerCase();
  return u.startsWith("b") ? v * 1000 : u.startsWith("k") ? v / 1000 : v; };
const fmtM = (m: number) => (m >= 1000 ? `$${+(m / 1000).toFixed(2)}B` : `$${+m.toFixed(0)}M`);

export function parseFind(raw: string): Parsed {
  let q = ` ${raw.trim()} `;
  const out: Parsed = { tokens: [], region: [], status: [], listing: [], signal: [], platform: [], contacts: false, understood: [] };
  let last = "";
  const without = (piece: string) => raw.replace(new RegExp(piece.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"), "i"), " ").replace(/\s+/g, " ").trim();
  const note = (label: string) => out.understood.push({ label, without: without(last) });
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => void) => { const m = q.match(re); if (m) { last = m[0]; fn(m); q = q.replace(m[0], " "); } };
  // revenue / employees with an operator: "revenue > 250M", "rev >= 1.5b", "revenue under 100m", "employees > 500"
  const OPW = String.raw`(>=|<=|>|<|=|over|above|more than|at least|under|below|less than|at most)?`;
  const isLess = (op?: string) => /^(<|<=|under|below|less than|at most)$/i.test(op || "");
  take(new RegExp(String.raw`\b(?:revenue|rev|turnover|sales)\s*${OPW}\s*\$?\s*([\d,.]+)\s*(m|mn|million|b|bn|billion|k)?\b`, "i"), (m) => {
    const v = toM(m[2], m[3]);
    if (isLess(m[1])) { out.revMax = v; note(`Revenue ≤ ${fmtM(v)}`); } else { out.revMin = v; note(`Revenue ≥ ${fmtM(v)}`); }
  });
  take(new RegExp(String.raw`\b(?:employees?|staff|headcount|emp)\s*${OPW}\s*([\d,]+)\s*(k)?\b`, "i"), (m) => {
    const v = Number(m[2].replace(/,/g, "")) * (m[3] ? 1000 : 1);
    if (isLess(m[1])) { out.empMax = v; note(`Employees ≤ ${v.toLocaleString()}`); } else { out.empMin = v; note(`Employees ≥ ${v.toLocaleString()}`); }
  });
  take(/\b(?:icp|status)\s*(?:=|:|is)?\s*(not\s*icp|needs?\s*check|verified|likely|unknown)\b/i, (m) => {
    const k = m[1].toLowerCase().replace(/\s+/g, " "); const v = /needs?/.test(k) ? "ICP — Needs check" : /not/.test(k) ? "Not ICP" : k === "verified" ? "ICP — Verified" : k === "likely" ? "ICP — Likely" : "Unknown";
    out.status.push(v); note(`ICP status: ${v.replace("ICP — ", "")}`);
  });
  take(/\b(not\s*icp)\b/i, () => { out.status.push("Not ICP"); note("ICP status: Not ICP"); });
  take(/\bneeds?\s*check\b/i, () => { out.status.push("ICP — Needs check"); note("ICP status: Needs check"); });
  take(/\b(verified|likely)\b/i, (m) => { const v = m[1].toLowerCase() === "verified" ? "ICP — Verified" : "ICP — Likely"; out.status.push(v); note(`ICP status: ${v.replace("ICP — ", "")}`); });
  take(/\bsignal\s*(?:=|:|is)?\s*(very\s*strong|strong|moderate|weak)\b/i, (m) => {
    const k = m[1].toLowerCase().replace(/\s+/g, " ").toUpperCase(); out.signal.push(`${k} SIGNAL`); note(`S2P signal: ${k.toLowerCase()}`);
  });
  take(/\b(very\s*strong|strong|moderate|weak)\s*(?:s2p\s*)?signals?\b/i, (m) => {
    const k = m[1].toLowerCase().replace(/\s+/g, " ").toUpperCase(); out.signal.push(`${k} SIGNAL`); note(`S2P signal: ${k.toLowerCase()}`);
  });
  take(/\b(listed|publicly listed)\b/i, () => { out.listing.push("Listed"); note("Listing: Listed"); });
  take(/\b(private|family group)\b/i, () => { out.listing.push("Private"); note("Listing: Private"); });
  take(/\b(government|government-owned|state-owned)\b/i, () => { out.listing.push("Government-owned"); note("Listing: Government-owned"); });
  take(/\bcoupa\b/i, () => { out.platform.push("Coupa"); note("Platform: Coupa"); });
  take(/\bariba\b/i, () => { out.platform.push("SAP Ariba"); note("Platform: SAP Ariba"); });
  take(/\b(?:has|with)\s+contacts?\b/i, () => { out.contacts = true; note("Has contacts"); });
  // region words (longest first so "saudi arabia" wins over "saudi")
  for (const w of Object.keys(REGION_WORDS).sort((a, b) => b.length - a.length)) {
    if (!REGION_WORDS[w]) continue;
    const re = new RegExp(String.raw`\b${w.replace(/\s+/g, "\\s+")}\b`, "i");
    take(re, () => { const k = REGION_WORDS[w]; if (!out.region.includes(k)) { out.region.push(k); note(`Region: ${k}`); } });
  }
  out.tokens = q.toLowerCase().replace(/["',;]+/g, " ").split(/\s+/).filter((t) => t.length > 0 && !["in", "of", "the", "and", "with", "companies", "company", "accounts"].includes(t));
  if (out.understood.length || out.tokens.length > 1)
    for (const t of out.tokens) out.understood.push({ label: `Text: ${t}`, without: raw.replace(new RegExp(`\\b${t.replace(/[^a-z0-9]/g, "\\$&")}\\b`, "i"), " ").replace(/\s+/g, " ").trim() });
  return out;
}

const norm = (v: string) => v.toLowerCase().replace(/&/g, " and ").replace(/\b(pjsc|psc|llc|l\.l\.c|ltd|limited|plc|group|holding|holdings|co|company|fze|fzco|saog|saoc|ksc|ksa|jsc|inc|corp|corporation|the)\b/g, " ")
  .replace(/[^a-z0-9]+/g, " ").trim();
const aliasesOf = (a: Row): string[] => {
  const m = (a.profile as Record<string, unknown> | null)?.["Merged companies"];
  const list = Array.isArray(m) ? m : m && typeof m === "object" ? Object.values(m as object) : [];
  return list.flatMap((x) => (typeof x === "string" ? [x] : x && typeof x === "object" ? [s((x as Record<string, unknown>).name), s((x as Record<string, unknown>).company_name)] : [])).filter(Boolean);
};
const wordHit = (hay: string, t: string) => (t.length <= 3 ? new RegExp(`(^|[^a-z0-9])${t.replace(/[^a-z0-9]/g, "")}([^a-z0-9]|$)`).test(hay) : hay.includes(t));

/** How well one token matches one account, and in which field. 0 = no match. */
function tokenScore(a: Row, t: string, alias: string[]): { score: number; field: string } {
  const name = low(a.company_name);
  if (name === t) return { score: 100, field: "name" };
  if (name.startsWith(t)) return { score: 85, field: "name" };
  if (new RegExp(`(^|[^a-z0-9])${t.replace(/[^a-z0-9]/g, "")}`).test(name) && t.length > 1) return { score: 70, field: "name" };
  if (name.includes(t)) return { score: 55, field: "name" };
  if (alias.some((x) => low(x).includes(t))) return { score: 50, field: "former name" };
  const fields: [string, string, number][] = [["website", `${low(a.domain)} ${low(a.company_website)}`, 40], ["HQ", low(a.hq_city), 28], ["industry", low(a.industry).replace(/_/g, " "), 24],
    ["ERP", low(a.erp), 24], ["platform", low(a.existing_s2p_product), 24], ["parent", low(a.parent_company), 18], ["country", low(a.country), 10]];
  let best = { score: 0, field: "" };
  for (const [f, hay, w] of fields) if (hay && wordHit(hay, t) && w > best.score) best = { score: w, field: f };
  return best;
}

function lev(a: string, b: string): number {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return prev[n];
}


// Words that rarely identify a company on their own ("Ghobash Trading Enterprise" is "Ghobash Group"). When no company matches
// every word, these are dropped so the distinctive word can still find it.
const GENERIC = new Set(["trading", "trade", "enterprise", "enterprises", "group", "groups", "company", "co", "llc", "ltd", "limited", "general", "international", "intl", "holding", "holdings",
  "corporation", "corp", "establishment", "est", "services", "service", "industries", "industrial", "the", "of", "and", "al", "el", "for", "contracting", "contractors", "projects",
  "fze", "fzco", "pjsc", "psc", "plc", "inc", "uae", "gulf", "middle", "east", "emirates", "global", "investment", "investments", "sons", "bros", "brothers", "partners", "ksa", "qatar", "kuwait"]);
const wordsOf = (v: string) => v.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 2);
/** Rough sound-alike key: ghobash / gobash, mohamed / muhammad, philips / fillips share a key. */
const skeleton = (w: string) => { const x = w.toLowerCase().replace(/ph/g, "f").replace(/gh/g, "g").replace(/ck/g, "k").replace(/[cq]/g, "k").replace(/x/g, "ks").replace(/z/g, "s").replace(/w/g, "v");
  return x[0] + x.slice(1).replace(/[aeiouy]/g, "").replace(/(.)\1+/g, "$1"); };
/** How well a typed word matches a word of this company's name (spelling slips, sound-alikes, prefixes). */
function fuzzyWord(a: Row, alias: string[], t: string): { score: number; word: string } {
  const words = [...wordsOf(s(a.company_name)), ...alias.flatMap((x) => wordsOf(x)), ...wordsOf(root(s(a.domain) || s(a.company_website)))];
  let best = { score: 0, word: "" };
  const maxD = t.length <= 4 ? 1 : t.length <= 7 ? 2 : 3;
  for (const w of words) {
    let sc = 0;
    if (w === t) sc = 100;
    else if (t.length >= 4 && (w.startsWith(t) || (w.length >= 4 && t.startsWith(w)))) sc = 80;
    else if (t.length >= 4 && w.length >= 4 && skeleton(w) === skeleton(t)) sc = 72;
    else { const d = lev(w, t); if (d <= maxD && Math.abs(w.length - t.length) <= maxD && t.length >= 3) sc = 75 - 10 * d; }
    if (sc > best.score) best = { score: sc, word: w };
  }
  return best;
}
const root = (d: string) => d.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].split(".")[0];

export function findCompanies(data: AllData, def: unknown, qy: FindQuery) {
  const p = parseFind(qy.q || "");
  const people = buildPeople(data.contacts);
  const contactsBy = new Map<string, number>();
  for (const x of people) contactsBy.set(x.company_id as string, (contactsBy.get(x.company_id as string) || 0) + 1);
  const toItem = (a: Row, matched: string[]): FindItem => {
    const rev = revenueOf(a), cur = rulesFor(def, a.country).currency as { code: string; per_usd: number };
    return { id: a.id, slug: s(a.slug), company_name: s(a.company_name), country: s(a.country), region: regionOf(a.country), hq_city: s(a.hq_city), industry: s(a.industry).replace(/_/g, " "),
      icp_status: s(a.icp_status) || "Unknown", revenue: rev ? fmtMoneyM(rev, cur) : "", revenue_note: rev ? (revenueIsOfficial(a) ? "official figure" : "estimate") : "",
      employees: s(a.employee_range).replace(/\s*\(.*$/, ""), erp: /^(unknown|not[ _](found|public)|n\/a|none)/i.test(s(a.erp)) ? "" : s(a.erp).replace(/\s*\(.*$/, ""), platform: platformOf(a), signal: s(a.s2p_signal_level).replace(" SIGNAL", ""),
      listing: listingOf(a), contacts: contactsBy.get(a.id) || 0, coupa_customer: isCoupa(a), matched };
  };
  // 1) text + parsed filters
  type Hit = { a: Row; score: number; matched: string[]; why?: string; n?: number };
  const collect = (tokens: string[], fuzzy = false): Hit[] => {
  const hits: Hit[] = [];
  for (const a of data.accounts) {
    const reg = regionOf(a.country);
    if (p.region.length && !p.region.includes(reg)) continue;
    if (p.status.length && !p.status.includes(s(a.icp_status) || "Unknown")) continue;
    if (p.listing.length && !p.listing.includes(listingOf(a))) continue;
    if (p.signal.length && !p.signal.includes(s(a.s2p_signal_level))) continue;
    if (p.platform.length && !p.platform.includes(platformOf(a))) continue;
    if (p.contacts && !contactsBy.get(a.id)) continue;
    const rev = revenueOf(a);
    if (p.revMin !== undefined && (rev === null || rev < p.revMin)) continue;
    if (p.revMax !== undefined && (rev === null || rev > p.revMax)) continue;
    if (p.empMin !== undefined || p.empMax !== undefined) {
      const nums = (s(a.employee_range).match(/[\d,]+/g) || []).map((x) => Number(x.replace(/,/g, ""))).filter((x) => x > 0);
      const hi = nums.length ? Math.max(...nums) : 0, lo = nums.length ? Math.min(...nums) : 0;
      if (!nums.length) continue;
      if (p.empMin !== undefined && hi < p.empMin) continue;
      if (p.empMax !== undefined && lo > p.empMax) continue;
    }
    let score = 0; const matched: string[] = []; let ok = true;
    const al = aliasesOf(a);
    if (!fuzzy) {
      for (const t of tokens) { const r = tokenScore(a, t, al); if (!r.score) { ok = false; break; } score += r.score; if (r.field !== "name" && !matched.includes(r.field)) matched.push(r.field); }
      if (!ok) continue;
      hits.push({ a, score, matched });
    } else {
      // any one distinctive word may match, by spelling or by sound
      const got = tokens.map((t) => ({ t, ...fuzzyWord(a, al, t) })).filter((g) => g.score > 0);
      if (!got.length) continue;
      hits.push({ a, n: got.length, score: got.reduce((x, g) => x + g.score, 0), matched, why: got.map((g) => (g.word === g.t ? `"${g.t}" is in the name` : `"${g.t}" is close to "${g.word}"`)).join("; ") });
    }
  }
  return hits;
  };
  let hits = collect(p.tokens);
  let relaxed = "";
  if (!hits.length && p.tokens.length) {
    const core = p.tokens.filter((t) => !GENERIC.has(t));
    if (core.length && core.length < p.tokens.length) {
      const h2 = collect(core);
      if (h2.length) { hits = h2; relaxed = `No company matches every word, so "${p.tokens.filter((t) => GENERIC.has(t)).join(" ")}" was ignored and these match "${core.join(" ")}".`; }
    }
  }
  let similar: (FindItem & { why: string })[] = [];
  if (!hits.length && p.tokens.length) {
    const core = p.tokens.filter((t) => !GENERIC.has(t));
    const fz = collect(core.length ? core : p.tokens, true), top = Math.max(0, ...fz.map((h) => h.n || 0));
    similar = fz.filter((h) => (h.n || 0) === top).sort((x, y) => y.score - x.score || (revenueOf(y.a) || 0) - (revenueOf(x.a) || 0)).slice(0, 8)
      .map((h) => ({ ...toItem(h.a, h.matched), why: h.why || "" }));
  }
  // 2) facet filters from the chips, with counts that ignore the facet's own selection
  const f = qy;
  const pass = (h: Hit, skip?: keyof FindFilters) => {
    const a = h.a;
    if (skip !== "region" && f.region?.length && !f.region.includes(regionOf(a.country))) return false;
    if (skip !== "status" && f.status?.length && !f.status.includes(s(a.icp_status) || "Unknown")) return false;
    if (skip !== "listing" && f.listing?.length && !f.listing.includes(listingOf(a))) return false;
    if (skip !== "signal" && f.signal?.length && !f.signal.includes(s(a.s2p_signal_level))) return false;
    if (skip !== "platform" && f.platform?.length && !f.platform.includes(platformOf(a))) return false;
    if (skip !== "contacts" && f.contacts && !contactsBy.get(a.id)) return false;
    return true;
  };
  const count = (skip: keyof FindFilters, key: (a: Row) => string, order?: string[]): Facet[] => {
    const m = new Map<string, number>();
    for (const h of hits) if (pass(h, skip)) { const k = key(h.a); m.set(k, (m.get(k) || 0) + 1); }
    const rows = [...m].map(([value, c]) => ({ value, count: c }));
    return order ? rows.sort((x, y) => (order.indexOf(x.value) + 99) % 99 - (order.indexOf(y.value) + 99) % 99 || y.count - x.count) : rows.sort((x, y) => y.count - x.count);
  };
  const facets = {
    region: count("region", (a) => regionOf(a.country), REGIONS.map((r: { key: string }) => r.key)),
    status: count("status", (a) => s(a.icp_status) || "Unknown", STATUSES),
    listing: count("listing", listingOf, ["Listed", "Private", "Government-owned", "Subsidiary of listed group", "Unknown"]),
    signal: count("signal", (a) => s(a.s2p_signal_level) || "NO SIGNAL", ["VERY STRONG SIGNAL", "STRONG SIGNAL", "MODERATE SIGNAL", "WEAK SIGNAL", "NO SIGNAL"]),
    platform: count("platform", platformOf, ["Coupa", "SAP Ariba", "Other S2P", "No platform on file"]),
    withContacts: hits.filter((h) => pass(h, "contacts") && contactsBy.get(h.a.id)).length,
  };
  const shown = hits.filter((h) => pass(h));
  const sort = qy.sort || "best";
  shown.sort((x, y) => sort === "name" ? s(x.a.company_name).localeCompare(s(y.a.company_name))
    : sort === "revenue" || x.score === y.score ? (revenueOf(y.a) || 0) - (revenueOf(x.a) || 0) : y.score - x.score);
  const limit = qy.limit === 0 ? 0 : Math.min(Math.max(qy.limit || 25, 1), 100);
  // 3) nothing found → close spellings
  let suggestions: { company_name: string; slug: string; region: string }[] = [];
  if (!shown.length && p.tokens.length && !p.understood.some((u) => !u.label.startsWith("Text:"))) {
    const want = norm(p.tokens.join(" "));
    suggestions = data.accounts.map((a) => ({ a, d: lev(want, norm(s(a.company_name)).slice(0, want.length + 3)) }))
      .filter((x) => x.d <= Math.max(2, Math.round(want.length * 0.3))).sort((x, y) => x.d - y.d).slice(0, 4)
      .map((x) => ({ company_name: s(x.a.company_name), slug: s(x.a.slug), region: regionOf(x.a.country) }));
  }
  return { total: shown.length, items: shown.slice(0, limit).map((h) => toItem(h.a, h.matched)), ids: limit === 0 ? [] : shown.slice(0, 300).map((h) => h.a.id as string), facets,
    understood: p.understood, tokens: p.tokens, suggestions, relaxed, similar };
}

/** For "Find New Company": which of these names is already in the app (so nothing is researched twice). */
export function existingMatches(data: AllData, names: string[]) {
  const index = data.accounts.map((a) => ({ a, keys: [norm(s(a.company_name)), ...aliasesOf(a).map(norm)].filter((k) => k.length >= 3) }));
  return names.map((input) => {
    const n = norm(input);
    let hit = n.length >= 3 ? index.find((x) => x.keys.some((k) => k === n || (Math.min(k.length, n.length) >= 6 && (k.includes(n) || n.includes(k))))) : undefined;
    let possible = false;
    if (!hit) { // same distinctive words, spelled or sounding alike ("Al Jaidah Group" ~ "Jaidah Group")
      const core = wordsOf(input).filter((w) => !GENERIC.has(w) && w.length >= 3);
      if (core.length) {
        const found = data.accounts.find((a) => { const al = aliasesOf(a); return core.every((t) => fuzzyWord(a, al, t).score >= 72); });
        if (found) { hit = { a: found, keys: [] }; possible = true; }
      }
    }
    return { input, possible, match: hit ? { slug: s(hit.a.slug), company_name: s(hit.a.company_name), region: regionOf(hit.a.country), icp_status: s(hit.a.icp_status) || "Unknown" } : null };
  });
}
