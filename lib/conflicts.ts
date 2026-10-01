import type { Row } from "@/lib/data";

// Groups the flat conflicts table (one row per disagreement found, possibly several per person/field over time)
// into one card per company > person > field, merging every value ever seen for that pair — recognizing a
// known abbreviation vs. its spelled-out form (Title only) as agreement, not a third distinct value. The crux:
// 2+ sources landing on the same value is corroboration, so that value is Suggested and the rest are left as
// alternatives to review; a single source with nothing else corroborating it is a judgment call for a person,
// never an automatic pick — source tier only breaks a tie between two values that are both already corroborated.
export type Candidate = { value: string; sources: string[]; tier: number };
export type ConflictGroup = {
  key: string; company_id: string; company: string; entity: string; field: string;
  candidates: Candidate[]; suggestedIndex: number; rowIds: string[]; resolved: boolean; resolution?: string;
};

// Suggesting a value requires real corroboration: at least 2 independent sources landing on the same (or
// equivalent) value. Source tier only breaks a tie between two values that are BOTH already multi-sourced —
// it never promotes a single-source value over another single-source value. When every candidate here has
// just one source and nothing else was found to corroborate it, that's a genuine single-witness disagreement:
// no suggestion, left for a person to judge.
function pickSuggested(candidates: Candidate[]): number {
  if (candidates.length < 2) return -1;
  const [top, second] = candidates;
  if (top.sources.length < 2) return -1;
  if (top.sources.length > second.sources.length) return 0;
  return (top.sources.length === second.sources.length && top.tier < second.tier) ? 0 : -1;
}

// Title variants that mean the same role (abbreviation vs. spelled out) must count as agreement, not a 3-way
// split — "CFO" and "Chief Finance Officer" are the same fact from two sources, not two different facts.
const TITLE_ALIASES: [RegExp, string][] = [
  [/^ceo$|chief executive officer/, "chief executive officer"],
  [/^cfo$|chief finance(ial)? officer/, "chief financial officer"],
  [/^coo$|chief operating officer/, "chief operating officer"],
  [/^cto$|chief technology officer/, "chief technology officer"],
  [/^cio$|chief information officer/, "chief information officer"],
  [/^cmo$|chief marketing officer/, "chief marketing officer"],
  [/^cpo$|chief procurement officer/, "chief procurement officer"],
  [/^cro$|chief revenue officer/, "chief revenue officer"],
  [/^cdo$|chief digital officer/, "chief digital officer"],
  [/^chro$|chief human resources officer|chief people officer/, "chief human resources officer"],
  [/^evp$|executive vice president/, "executive vice president"],
  [/^svp$|senior vice president/, "senior vice president"],
  [/^vp$|vice president/, "vice president"],
  [/^md$|managing director/, "managing director"],
  [/^gm$|general manager/, "general manager"],
];

function clean(s: string): string { return s.toLowerCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim(); }

// The key used to decide whether two raw strings are "the same value" for grouping — not what's shown.
function canonicalOf(field: string, raw: string): string {
  const s = clean(raw);
  if (field === "Title") { for (const [re, canon] of TITLE_ALIASES) if (re.test(s)) return canon; }
  return s;
}

// Tier 1 official filing/website, 2 Claude research with a cited link, 3 aggregator estimate (Seamless/ZoomInfo/...),
// 4 the user's own workbook entry ("Existing" — trusted but not independently re-verified), 5 unclassified.
function tierOf(source: string): number {
  const s = (source || "").toLowerCase();
  if (/annual report|investor relation|exchange filing|regulator|prospectus|official (site|website|filing)|press release|\bsec\b/.test(s)) return 1;
  if (/claude research/.test(s) && /https?:\/\//.test(s)) return 2;
  if (/claude research/.test(s)) return 3;
  if (/seamless|zoominfo|rocketreach|aggregator|d&b|refinitiv/.test(s)) return 3;
  if (/^existing$|workbook|user list|user upload/.test(s)) return 4;
  return 5;
}

export function groupConflicts(rows: Row[]): ConflictGroup[] {
  const groups = new Map<string, ConflictGroup>();
  for (const r of rows) {
    const key = `${r.company_id}|${r.entity}|${r.field}`;
    let g = groups.get(key);
    if (!g) {
      g = { key, company_id: r.company_id, company: r.company || "", entity: r.entity, field: r.field, candidates: [], suggestedIndex: -1, rowIds: [], resolved: true };
      groups.set(key, g);
    }
    g.rowIds.push(r.id);
    if (r.resolution) g.resolution = r.resolution; else g.resolved = false;
    for (const [value, source] of [[r.value_a, r.source_a], [r.value_b, r.source_b]] as [string, string][]) {
      if (!value) continue;
      const key2 = canonicalOf(r.field, value);
      let c = g.candidates.find((x) => canonicalOf(r.field, x.value) === key2);
      if (!c) { c = { value, sources: [], tier: tierOf(source) }; g.candidates.push(c); }
      else if (value.length > c.value.length) c.value = value; // show the more fully spelled-out form once two sources agree
      if (source && !c.sources.includes(source)) c.sources.push(source);
      c.tier = Math.min(c.tier, tierOf(source));
    }
  }
  for (const g of groups.values()) {
    g.candidates.sort((x, y) => y.sources.length - x.sources.length || x.tier - y.tier);
    g.suggestedIndex = pickSuggested(g.candidates);
  }
  return [...groups.values()].sort((x, y) => x.company.localeCompare(y.company) || x.entity.localeCompare(y.entity));
}
