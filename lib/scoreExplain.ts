// Plain-language explanation of the three scores (ICP Match, Opportunity, Coupa Fit) for one account, shown beside the points in the PDF
// and on the account page. Every sentence is built from that account's own points, so a reader sees how the percentage came about.
import type { Score } from "@/lib/icp";

export type ScoreName = "ICP Match" | "Opportunity" | "Coupa Fit";
export type Explained = { name: ScoreName; pct: number; question: string; total: string; formula: string; extremes: string; reading: string };

const QUESTION: Record<ScoreName, string> = {
  "ICP Match": "Does it look like your ideal customer? Checked against your ICP rules.",
  Opportunity: "Is it likely to buy soon? Buying signals count most.",
  "Coupa Fit": "How well does Coupa suit it? Five areas, plus your platform focus.",
};

export function explainScore(name: ScoreName, sc: Score): Explained {
  const parts = sc.parts.filter((p) => p.max > 0);
  const earned = parts.reduce((t, p) => t + p.score, 0), max = parts.reduce((t, p) => t + p.max, 0);
  const ratio = (p: { score: number; max: number }) => p.score / p.max;
  const best = [...parts].sort((a, b) => ratio(b) - ratio(a) || b.score - a.score)[0];
  const worst = [...parts].sort((a, b) => ratio(a) - ratio(b) || (b.max - b.score) - (a.max - a.score))[0];
  const extremes = !parts.length ? "" : earned === 0 ? "No points earned in any area yet."
    : earned === max ? "Every area has full points."
    : `Best: ${best.label}. Weakest: ${worst.label}.`;
  const reading = name === "Opportunity" && sc.total === 0
    ? "0% means no buying signs seen yet. It may still buy one day."
    : "70 and above is strong. 45 to 69 is so-so. Below 45 is weak.";
  return { name, pct: sc.total, question: QUESTION[name], total: `Total: ${earned} out of ${max} points = ${sc.total}%`, formula: `(${earned} ÷ ${max}) × 100 = ${sc.total}%`, extremes, reading };
}
