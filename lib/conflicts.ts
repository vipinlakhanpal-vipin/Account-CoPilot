import type { Row } from "@/lib/data";

// Groups the flat conflicts table (one row per disagreement found, possibly several per person/field over time)
// into one card per company > person > field, merging every value ever seen for that pair and ranking the
// candidates so the UI can suggest one. This is a transparent, source-strength suggestion — never a claimed
// fact-check — so the ranking is: (1) how many independent sources agree on a value, then (2) tier as a tiebreak.
export type Candidate = { value: string; sources: string[]; tier: number };
export type ConflictGroup = {
  key: string; company_id: string; company: string; entity: string; field: string;
  candidates: Candidate[]; suggestedIndex: number; rowIds: string[]; resolved: boolean; resolution?: string;
};

// A pick is only shown as "Suggested" when the top candidate actually beats the runner-up on the stated
// criteria (strictly more agreeing sources, or a strictly stronger source tier). Two single-source candidates
// tied on both — even if both happen to cite the same provider (e.g. two different Seamless lookups) — are
// a real, unresolved disagreement: no suggestion, left for a person to judge.
function pickSuggested(candidates: Candidate[]): number {
  if (candidates.length < 2) return -1;
  const [top, second] = candidates;
  return (top.sources.length > second.sources.length || top.tier < second.tier) ? 0 : -1;
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
      let c = g.candidates.find((x) => x.value.trim().toLowerCase() === value.trim().toLowerCase());
      if (!c) { c = { value, sources: [], tier: tierOf(source) }; g.candidates.push(c); }
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
