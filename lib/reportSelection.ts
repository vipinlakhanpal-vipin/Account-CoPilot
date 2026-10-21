import type { Row } from "@/lib/data";
import { revenueOf, icpMatch, withDefaults, type Criteria } from "@/lib/icp";
import { regionOf } from "@/lib/icpDefinition.mjs";

// The one place that decides WHICH companies a report covers, so the Excel and the PDF can never differ.
// Both builders call selectReportAccounts() with the same inputs and get the same companies in the same order.
export const REPORT_CAP = 150; // the PDF's practical maximum; the Excel follows it so the two files always match
export const REPORT_STATUS_ORDER = ["ICP — Verified", "ICP — Likely", "ICP — Needs check"] as const;

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

export type SelectOptions = {
  region: string; // a region key, or "All"
  ids?: string[]; // an exact list of companies (a tile, a saved report, Aria's filters); otherwise statuses decide
  statuses?: string[];
  rank?: "fit" | "revenue" | "name";
  limit?: number; // "top N"; missing means as many as the cap allows
  criteria?: Partial<Criteria> | null;
};

/** The criteria used to score one account: the saved Discovery criteria with the account's own country as the target. */
export function criteriaFor(base: Criteria, a: Row): Criteria {
  return { ...base, company: { ...base.company, countries: [s(a.country) || "UAE"], regions: [] } };
}

export function selectReportAccounts(accounts: Row[], o: SelectOptions): { selected: Row[]; total: number; capped: boolean } {
  const inRegion = (a: Row) => o.region === "All" || regionOf(a.country) === o.region;
  const idSet = o.ids?.length ? new Set(o.ids) : null;
  const single = idSet?.size === 1;
  const statuses = o.statuses?.length ? o.statuses : [...REPORT_STATUS_ORDER];
  const pool = accounts.filter((a) => (idSet ? idSet.has(a.id) && (single || inRegion(a)) : statuses.includes(s(a.icp_status)) && inRegion(a)));

  const rank = o.rank || "fit";
  const name = (a: Row) => s(a.company_name);
  const statusOrder = (a: Row) => Math.max(0, REPORT_STATUS_ORDER.indexOf(s(a.icp_status) as typeof REPORT_STATUS_ORDER[number]));
  if (rank === "revenue") pool.sort((x, y) => (revenueOf(y) || 0) - (revenueOf(x) || 0) || name(x).localeCompare(name(y)));
  else if (rank === "name") pool.sort((x, y) => name(x).localeCompare(name(y)));
  else {
    const base = withDefaults(o.criteria), score = new Map<string, number>();
    pool.forEach((a) => score.set(a.id, icpMatch(a, criteriaFor(base, a)).total));
    pool.sort((x, y) => (score.get(y.id) || 0) - (score.get(x.id) || 0) || statusOrder(x) - statusOrder(y) || name(x).localeCompare(name(y)));
  }
  const want = o.limit && o.limit > 0 ? o.limit : REPORT_CAP;
  const n = Math.min(want, REPORT_CAP);
  return { selected: pool.slice(0, n), total: pool.length, capped: want > REPORT_CAP && pool.length > REPORT_CAP };
}
