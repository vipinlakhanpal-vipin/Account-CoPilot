// Plain-language explanation of the three scores (ICP Match, Opportunity, Coupa Fit) for one account, shown beside the points in the PDF
// and on the account page. Every sentence is built from that account's own points, so a reader sees how the percentage came about.
import type { Score } from "@/lib/icp";

export type ScoreName = "ICP Match" | "Opportunity" | "Coupa Fit";
export type Explained = { name: ScoreName; pct: number; question: string; sum: string; extremes: string; reading: string };

const QUESTION: Record<ScoreName, string> = {
  "ICP Match": "Does this company look like the customer you want? It is checked against your ICP rules (size, location, procurement maturity).",
  Opportunity: "Is this company likely to buy soon? Buying signals count most, then transformation programmes, ERP changes, cost cutting, new leaders and growth.",
  "Coupa Fit": "How well does Coupa suit this company? Five areas are checked: source-to-pay, suppliers, contracts, spend analytics and invoices.",
};

export function explainScore(name: ScoreName, sc: Score): Explained {
  const parts = sc.parts.filter((p) => p.max > 0);
  const earned = parts.reduce((t, p) => t + p.score, 0), max = parts.reduce((t, p) => t + p.max, 0);
  const ratio = (p: { score: number; max: number }) => p.score / p.max;
  const best = [...parts].sort((a, b) => ratio(b) - ratio(a) || b.score - a.score)[0];
  const worst = [...parts].sort((a, b) => ratio(a) - ratio(b) || (b.max - b.score) - (a.max - a.score))[0];
  const extremes = !parts.length ? "" : earned === 0 ? "No points earned in any area yet."
    : earned === max ? "Every area has full points."
    : `Most points: ${best.label} (${best.score} of ${best.max}). Fewest: ${worst.label} (${worst.score} of ${worst.max}).`;
  const reading = name === "Opportunity" && sc.total === 0
    ? "0% means no buying signs have been seen yet. It does not mean the company will never buy."
    : "70% or more is strong, 45 to 69% is partial, under 45% is weak.";
  return { name, pct: sc.total, question: QUESTION[name], sum: `${earned} of ${max} points earned = ${sc.total}%.`, extremes, reading };
}
