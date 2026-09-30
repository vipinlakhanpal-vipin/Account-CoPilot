// Header's global search bar: a single free-text box that either searches by name/location, or — when it
// recognizes a "revenue"/"employees" keyword with an operator and a number — translates that into the matching
// band(s) already used by the Discovery panel's own filters (both fields are band-based, not raw numbers).
export type ParsedQuery = { name: string; revenue: string[]; employees: string[] };

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

export function parseGlobalQuery(raw: string): ParsedQuery {
  let q = raw.trim();
  const out: ParsedQuery = { name: "", revenue: [], employees: [] };

  const rev = q.match(REV_RE);
  if (rev) {
    out.revenue = bandsFor(REVENUE_BANDS, rev[1] || ">=", num(rev[2], rev[3]));
    q = (q.slice(0, rev.index) + q.slice((rev.index || 0) + rev[0].length)).trim();
  }
  const emp = q.match(EMP_RE);
  if (emp) {
    out.employees = bandsFor(EMPLOYEE_BANDS, emp[1] || ">=", num(emp[2]));
    q = (q.slice(0, emp.index) + q.slice((emp.index || 0) + emp[0].length)).trim();
  }
  out.name = q.replace(/^[\s,;-]+|[\s,;-]+$/g, "");
  return out;
}
