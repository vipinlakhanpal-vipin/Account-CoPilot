// Plain-language explanation of the three scores (ICP Match, Opportunity, Coupa Fit) for one account, shown beside the points in the PDF
// and on the account page. Every sentence is built from that account's own points, so a reader sees how the percentage came about.
import type { Score } from "@/lib/icp";

export type ScoreName = "ICP Match" | "Opportunity" | "Coupa Fit";
export type Explained = { name: ScoreName; pct: number; question: string; total: string; formula: string; count: string; extremes: string; reading: string };

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
  // The lines are numbered 1, 2, 3 ... in the list beside this note, so the note can point at them.
  const num = new Map(sc.parts.map((p, i) => [p, i + 1]));
  const zero = parts.filter((p) => p.score === 0);
  const count = !parts.length ? "" : earned === 0 ? `All ${parts.length} numbered lines scored 0, so the total is 0 and the score is 0%.`
    : zero.length === 0 ? `All ${parts.length} numbered lines earned points.`
    : `${parts.length - zero.length} of ${parts.length} numbered lines earned points. Line${zero.length > 1 ? "s" : ""} ${zero.map((p) => num.get(p)).join(", ")} scored 0.`;
  const extremes = !parts.length || earned === 0 ? ""
    : earned === max ? "Every area has full points."
    : `Best: ${best.label}. Weakest: ${worst.label}.`;
  const reading = name === "Opportunity" && sc.total === 0
    ? "0% means no buying signs seen yet. It may still buy one day."
    : "70 and above is strong. 45 to 69 is so-so. Below 45 is weak.";
  return { name, pct: sc.total, question: QUESTION[name], total: `Total: ${earned} out of ${max} points = ${sc.total}%`, formula: `(${earned} ÷ ${max}) × 100 = ${sc.total}%`, count, extremes, reading };
}
