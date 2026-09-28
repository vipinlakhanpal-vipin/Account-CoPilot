"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// ⓘ button: a short explanation in plain words, with a link to the matching Learn Me section for the full story.
export type Help = { title: string; text: React.ReactNode; section: string };
export type Weights = { w_match: number; w_opportunity: number; w_fit: number; min_match: number };

export const HELP = (w: Weights = { w_match: 50, w_opportunity: 30, w_fit: 20, min_match: 70 }): Record<string, Help> => ({
  rank: { title: "Rank", section: "pipeline", text: <>One number (0–100%) that says which account to work first. <b>Rank = {w.w_match}% × ICP Match + {w.w_opportunity}% × Opportunity + {w.w_fit}% × Coupa Fit</b> (weights set per region in Define ICP). Example: ICP Match 100%, Opportunity 75%, Coupa Fit 90% → {Math.round(w.w_match)} + {Math.round(0.75 * w.w_opportunity * 10) / 10} + {Math.round(0.9 * w.w_fit * 10) / 10} = {Math.round(w.w_match + 0.75 * w.w_opportunity + 0.9 * w.w_fit)}%.</> },
  icpMatch: { title: "ICP Match", section: "scores", text: <>How well the account fits your ICP: <b>points earned ÷ points available</b>. Parts: revenue (full points only for an official figure), employees, industry, geography, ownership, technology, triggers and procurement maturity; only the criteria you set count. The Pipeline needs {w.min_match}% or more.</> },
  opportunity: { title: "Opportunity", section: "scores", text: <>How likely the account is to buy soon: <b>S2P signal strength</b> (up to 40 points), procurement / ERP / digital transformation, cost programmes, executive moves and growth, plus <b>your buying triggers and ERP of interest</b> from Define ICP.</> },
  coupaFit: { title: "Coupa Fit", section: "scores", text: <>How well Coupa fits the account across five value areas (source-to-pay, supplier management, contracts, spend analytics, invoice automation), from its size, sector, ERP and current platform, plus <b>your focus platforms</b> from Define ICP.</> },
  percent: { title: "What the % means", section: "scores", text: <>Every score is <b>points earned ÷ points available × 100</b>. Green = 70% or more, amber = 45–69%, red = below 45%. Hover a score to see each part, e.g. &quot;S2P signal strength: 30 of 40 pts&quot;.</> },
  icpStatus: { title: "ICP status", section: "icp", text: <><b>Verified</b>: revenue at or above your minimum from an official source · <b>Likely</b>: at or above it on your data, Seamless or estimates · <b>Needs check</b>: sources disagree about the line · <b>Not ICP</b>: below it (or outside a hard rule) · <b>Unknown</b>: no figure yet. Thresholds come from Define ICP.</> },
  personaFit: { title: "Persona fit", section: "scores", text: <>How well a contact matches your buyer personas in Define ICP: <b>department 35 + seniority 35 + priority role 30 points</b> (only what you set counts). 100% = matches all; 50–99% = partly.</> },
  trust: { title: "Trust", section: "sources", text: <><b>Confirmed by 2+ sources</b>: two independent sources agree (or Claude verified it) · <b>Single source</b>: one source only · <b>Conflicting</b>: sources disagree or the person may have moved.</> },
});

export default function InfoTip({ k, w }: { k: string; w?: Weights }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const h = HELP(w)[k];
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => { if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);
  if (!h) return null;
  return (
    <span className="infotip" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button type="button" className="infotip-btn" aria-label={`What is ${h.title}?`} aria-expanded={open} onClick={() => setOpen((x) => !x)}>i</button>
      {open && (
        <span className="infotip-pop" role="dialog" aria-label={h.title}>
          <b className="t">{h.title}</b>
          <span className="x">{h.text}</span>
          <Link className="more" href={`/guide#${h.section}`}>Read more in Setup → Learn Me →</Link>
        </span>
      )}
    </span>
  );
}
