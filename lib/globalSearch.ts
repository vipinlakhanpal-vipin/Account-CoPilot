// Header's global search bar: a single free-text box that either searches by name/location, or — when it
// recognizes a keyword (revenue, employees, icp, listing, signal) with an operator/value — translates that into
// the matching option(s) already used by the Discovery panel's own filters.
export type ParsedQuery = { name: string; revenue: string[]; employees: string[]; icpStatus: string[]; listing: string[]; signal: string[] };

const REVENUE_BANDS: [string, number, number][] = [
  ["<$100M", 0, 100], ["$100M-$250M", 100, 250], ["$250M-$500M", 250, 500], ["$500M-$1B", 500, 1000], ["$1B-$5B", 1000, 5000], ["$5B+", 5000, Infinity],
];
const EMPLOYEE_BANDS: [string, number, number][] = [
  ["100-250", 100, 250], ["250-500", 250, 500], ["500-1000", 500, 1000], ["1000-5000", 1000, 5000], ["5000+", 5000, Infinity],
];

function num(raw: string, unit?: string): number {
  const n = Number(raw.replace(/,/g, ""));
  if (!unit) return n;
  const u = unit.toLowerCase();
  return u.startsWith("b") ? n * 1000 : u.startsWith("k") ? n / 1000 : n;
}

/** Bands satisfying the operator against a threshold value (in the band table's own unit — millions for revenue). */
function bandsFor(bands: [string, number, number][], op: string, value: number): string[] {
  if (op === "<" || op === "<=") return bands.filter(([, , max]) => max <= value).map(([b]) => b);
  return bands.filter(([, min]) => min >= value).map(([b]) => b); // ">", ">=", "=", or bare "revenue 250M" all mean "at least this much"
}

const REV_RE = /\b(?:rev(?:enue)?)\s*(>=|<=|>|<|=)?\s*\$?\s*([\d,.]+)\s*(m|mn|million|b|bn|billion|k)?\b/i;
const EMP_RE = /\b(?:emp(?:loyees?)?)\s*(>=|<=|>|<|=)?\s*([\d,]+)\b/i;
const ICP_RE = /\b(?:icp(?:\s*status)?|status)\s*(?:=|:)?\s*(not\s*icp|needs?\s*check|verified|likely|unknown)\b/i;
const LISTING_RE = /\blisting(?:\s*status)?\s*(?:=|:)?\s*(listed|private|government(?:-owned)?|subsidiary)\b/i;
const SIGNAL_RE = /\b(?:s2p\s*)?signal(?:\s*level)?\s*(?:=|:)?\s*(very\s*strong|strong|moderate|weak|no|conflicting)\b/i;

const ICP_MAP: Record<string, string> = { verified: "ICP — Verified", likely: "ICP — Likely", unknown: "Unknown" };
const LISTING_MAP: Record<string, string> = { listed: "Listed", private: "Private", subsidiary: "Subsidiary of listed group" };
const SIGNAL_MAP: Record<string, string> = { strong: "STRONG SIGNAL", moderate: "MODERATE SIGNAL", weak: "WEAK SIGNAL", no: "NO SIGNAL", conflicting: "CONFLICTING SIGNAL" };

function cut(q: string, m: RegExpMatchArray): string {
  return (q.slice(0, m.index) + q.slice((m.index || 0) + m[0].length)).trim();
}

export function parseGlobalQuery(raw: string): ParsedQuery {
  let q = raw.trim();
  const out: ParsedQuery = { name: "", revenue: [], employees: [], icpStatus: [], listing: [], signal: [] };

  const rev = q.match(REV_RE);
  if (rev) { out.revenue = bandsFor(REVENUE_BANDS, rev[1] || ">=", num(rev[2], rev[3])); q = cut(q, rev); }
  const emp = q.match(EMP_RE);
  if (emp) { out.employees = bandsFor(EMPLOYEE_BANDS, emp[1] || ">=", num(emp[2])); q = cut(q, emp); }
  const icp = q.match(ICP_RE);
  if (icp) { const key = icp[1].toLowerCase().replace(/\s+/g, " "); out.icpStatus = [/needs?\s*check/.test(key) ? "ICP — Needs check" : /not\s*icp/.test(key) ? "Not ICP" : ICP_MAP[key] || ""].filter(Boolean); q = cut(q, icp); }
  const listing = q.match(LISTING_RE);
  if (listing) { const key = listing[1].toLowerCase(); out.listing = [/government/.test(key) ? "Government-owned" : LISTING_MAP[key] || ""].filter(Boolean); q = cut(q, listing); }
  const signal = q.match(SIGNAL_RE);
  if (signal) { const key = signal[1].toLowerCase().replace(/\s+/g, " "); out.signal = [/very\s*strong/.test(key) ? "VERY STRONG SIGNAL" : SIGNAL_MAP[key] || ""].filter(Boolean); q = cut(q, signal); }

  out.name = q.replace(/^[\s,;-]+|[\s,;-]+$/g, "");
  return out;
}
