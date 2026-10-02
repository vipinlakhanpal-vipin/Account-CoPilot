"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";

// ⓘ button: a short explanation in plain words, with a link to the matching Learn Me section for the full story.
export type Help = { title: string; text: React.ReactNode; section: string };
export type Weights = { w_match: number; w_opportunity: number; w_fit: number; min_match: number };

export const HELP = (w: Weights = { w_match: 50, w_opportunity: 30, w_fit: 20, min_match: 70 }): Record<string, Help> => ({
  rank: { title: "Rank", section: "pipeline", text: <>One number (0–100%) that says which account to work first, combining three scores:
      <ul className="infotip-list">
        <li><b>ICP Match</b> — how well it fits your target profile (revenue, size, industry, geography, ownership…)</li>
        <li><b>Opportunity</b> — how likely it is to buy soon (S2P signal, triggers, cost programmes, growth)</li>
        <li><b>Coupa Fit</b> — how well Coupa&apos;s product set matches what it needs</li>
      </ul>
      <b>Rank = {w.w_match}% × ICP Match + {w.w_opportunity}% × Opportunity + {w.w_fit}% × Coupa Fit</b> (weights set per region in Define ICP). Example: ICP Match 100%, Opportunity 75%, Coupa Fit 90% → {Math.round(w.w_match)} + {Math.round(0.75 * w.w_opportunity * 10) / 10} + {Math.round(0.9 * w.w_fit * 10) / 10} = {Math.round(w.w_match + 0.75 * w.w_opportunity + 0.9 * w.w_fit)}%.</> },
  icpMatch: { title: "ICP Match", section: "scores", text: <>How well the account fits your ICP: <b>points earned ÷ points available</b>. Parts: revenue (full points only for an official figure), employees, industry, geography, ownership, technology, triggers and procurement maturity; only the criteria you set count. The Pipeline needs {w.min_match}% or more.</> },
  opportunity: { title: "Opportunity", section: "scores", text: <>How likely the account is to buy soon: <b>S2P signal strength</b> (up to 40 points), procurement / ERP / digital transformation, cost programmes, executive moves and growth, plus <b>your buying triggers and ERP of interest</b> from Define ICP.</> },
  coupaFit: { title: "Coupa Fit", section: "scores", text: <>How well Coupa fits the account across five value areas (source-to-pay, supplier management, contracts, spend analytics, invoice automation), from its size, sector, ERP and current platform, plus <b>your focus platforms</b> from Define ICP.</> },
  percent: { title: "What the % means", section: "scores", text: <>Every score is <b>points earned ÷ points available × 100</b>. Green = 70% or more, amber = 45–69%, red = below 45%. Hover a score to see each part, e.g. &quot;S2P signal strength: 30 of 40 pts&quot;.</> },
  icpStatus: { title: "ICP status", section: "icp", text: <><b>Verified</b>: revenue at or above your minimum from an official source · <b>Likely</b>: at or above it on your data, Seamless or estimates · <b>Needs check</b>: sources disagree about the line · <b>Not ICP</b>: below it (or outside a hard rule) · <b>Unknown</b>: no figure yet. Thresholds come from Define ICP.</> },
  personaFit: { title: "Persona fit", section: "scores", text: <>How well a contact matches your buyer personas in Define ICP: <b>department 35 + seniority 35 + priority role 30 points</b> (only what you set counts). 100% = matches all; 50–99% = partly.</> },
  companyName: { title: "Company name (optional)", section: "engineset", text: <><b>Leave it blank</b> to find new companies in general (up to &quot;How many&quot;). <b>Type a name</b> (e.g. Almarai) to search for that one company: the next scheduled session checks it isn&apos;t already in the app, researches it, adds it to the region and verifies it at no API cost, then re-checks it weekly until an official revenue figure is found.</> },
  trust: { title: "Trust", section: "sources", text: <><b>Confirmed by 2+ sources</b>: two independent sources agree (or Claude verified it) · <b>Single source</b>: one source only · <b>Conflicting</b>: sources disagree or the person may have moved.</> },
  source: { title: "Source", section: "sources", text: <>Where this company&apos;s data came from — every company has exactly one:
      <ul className="infotip-list">
        <li><b>Vipin&apos;s XL – Stakeholders</b> — your workbook, plus anything you&apos;ve personally confirmed (e.g. a named Coupa customer)</li>
        <li><b>Claude Sources</b> — Claude found or researched it on its own, free session or paid</li>
        <li><b>Claude + Seamless</b> — found via the free Seamless search, cleaned and deduped before import</li>
      </ul>
      The Sources tab has the full breakdown (who contributed, what evidence backs each fact, reliability and cost).</> },
  exchange: { title: "Exchange", section: "icp", text: <>Which stock exchange the company is listed on (ADX, DFM, Nasdaq Dubai, a foreign exchange…), if any — most accounts are private and have no exchange. This is a listing fact about the company, separate from Source (where its data came from): a company can be both e.g. &quot;Vipin&apos;s XL&quot; and listed on DFM at the same time.</> },
  stakeholderView: { title: "One row per person vs. All source rows", section: "stakeholders", text: <>
      <ul className="infotip-list">
        <li><b>One row per person</b> — every distinct stakeholder, counted once, merged from every row that mentions them (your sheet&apos;s CoPilot/Claude in Copilot/Claude-Seamless rows, plus Claude checks). Ranked by Persona fit, then Trust.</li>
        <li><b>All source rows</b> — every row exactly as it was imported or added, before merging. If 2 different sources each found the same person, that&apos;s 2 rows here — which is why this number is higher.</li>
      </ul>
      Nothing is ever deleted when rows are merged into one person — switch views any time to see the raw rows behind a merged record.</> },
});

// Popup renders through a portal at a viewport-computed position, so it always stays fully visible —
// a table header's own overflow-x:auto scroll box would otherwise clip an absolutely-positioned popup
// that extends past its edge (common for the leftmost columns, e.g. Rank).
export default function InfoTip({ k, w }: { k: string; w?: Weights }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const h = HELP(w)[k];
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      const width = Math.min(340, window.innerWidth * 0.8 - 16);
      const left = Math.max(8, Math.min(r.left + r.width / 2 - width / 2, window.innerWidth - width - 8));
      setPos({ top: r.bottom + 8, left, width });
    };
    place();
    const close = (e: MouseEvent | KeyboardEvent) => { if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false); };
    const closeAlways = () => setOpen(false);
    document.addEventListener("mousedown", close); document.addEventListener("keydown", close);
    window.addEventListener("scroll", closeAlways, true); window.addEventListener("resize", closeAlways);
    return () => {
      document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close);
      window.removeEventListener("scroll", closeAlways, true); window.removeEventListener("resize", closeAlways);
    };
  }, [open]);
  if (!h) return null;
  return (
    <span className="infotip" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button type="button" ref={btnRef} className="infotip-btn" aria-label={`What is ${h.title}?`} aria-expanded={open} onClick={() => setOpen((x) => !x)}>i</button>
      {open && pos && typeof document !== "undefined" && createPortal(
        <span className="infotip-pop" role="dialog" aria-label={h.title} style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width }}>
          <b className="t">{h.title}</b>
          <div className="x">{h.text}</div>
          <Link className="more" href={`/guide#${h.section}`}>Read more in Setup → Learn Me →</Link>
        </span>, document.body)}
    </span>
  );
}
