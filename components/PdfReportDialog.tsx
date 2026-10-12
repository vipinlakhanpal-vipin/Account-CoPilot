"use client";
import { useMemo, useState } from "react";
import { REGIONS, rulesFor, summarizeRules, regionOf } from "@/lib/icpDefinition.mjs";
import { notify } from "@/components/Confirm";
import type { Row } from "@/lib/data";

const STATUSES = ["ICP — Verified", "ICP — Likely", "ICP — Needs check"] as const;
const LIMITS = [25, 50, 100, 150];

/** POSTs to the report API and saves the PDF. Shared by the region dialog and the single-company button in the account brief. */
export async function downloadReport(body: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch("/api/report/pdf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) { const j = await res.json().catch(() => ({})); notify(j.error || "Could not build the report. Try again.", "error"); return false; }
    const blob = await res.blob();
    const name = /filename="?([^";]+)"?/.exec(res.headers.get("content-disposition") || "")?.[1] || "Account_CoPilot_ICP_Report.pdf";
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    const n = res.headers.get("X-Report-Count"), t = res.headers.get("X-Report-Total");
    notify(Number(n) === 1 ? "Company report ready." : `Report ready: ${n} of ${t} companies.`, "ok");
    return true;
  } catch { notify("Could not build the report. Try again.", "error"); return false; }
}

// Accounts → "PDF report". Explains how the report is produced from the saved ICP first, then lets the user pick what goes in.
export default function PdfReportDialog({ accounts, icpDef, defaultRegion, onClose }:
  { accounts: Row[]; icpDef: unknown; defaultRegion: string; onClose: () => void }) {
  const [region, setRegion] = useState(defaultRegion);
  const [picked, setPicked] = useState<string[]>([...STATUSES]);
  const [limit, setLimit] = useState(50);
  const [busy, setBusy] = useState(false);

  const counts = useMemo(() => {
    const c: Record<string, Record<string, number>> = {};
    for (const a of accounts) {
      const r = regionOf(a.country), st = String(a.icp_status || "");
      if (!(STATUSES as readonly string[]).includes(st)) continue;
      (c[r] ||= {})[st] = (c[r]?.[st] || 0) + 1;
    }
    return c;
  }, [accounts]);
  const regionKeys = REGIONS.map((r: { key: string }) => r.key).filter((k: string) => counts[k]);
  const inRegion = (st: string) => region === "All" ? regionKeys.reduce((n: number, k: string) => n + (counts[k]?.[st] || 0), 0) : counts[region]?.[st] || 0;
  const matching = picked.reduce((n, st) => n + inRegion(st), 0);
  const rules = region === "All" ? null : rulesFor(icpDef, region);

  async function generate() {
    if (!picked.length || busy) return;
    setBusy(true);
    const ok = await downloadReport({ statuses: picked, region, limit });
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <div className="wn-backdrop" onClick={onClose}>
      <div className="wn" role="dialog" aria-modal="true" aria-labelledby="pdf-title" onClick={(e) => e.stopPropagation()}>
        <div className="wn-head">
          <div><p className="wn-kicker">PDF report</p><h2 id="pdf-title">ICP account report</h2></div>
          <button type="button" className="wn-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="wn-body pdf-body">
          <h3>How Account CoPilot builds this</h3>
          <ol className="pdf-how">
            <li><b>Your ICP decides who counts.</b> {rules ? <>For {region}: {summarizeRules(region, rules)}.</> : "Each region uses its own rules from Setup → Define ICP."} Changing the ICP changes this report.</li>
            <li><b>Evidence decides the status.</b> Official filings and results make a company <i>Verified</i>; estimates or your own data make it <i>Likely</i>; conflicting sources make it <i>Needs check</i>. Every figure keeps its source.</li>
            <li><b>Scores are rule-based.</b> ICP Match, Opportunity and Coupa Fit are computed from that evidence with no API cost; spend figures are labelled estimates.</li>
            <li><b>Same content as the account brief.</b> Facts, maturity, scores, signals, ERP and apps, stakeholders and evidence, for the companies you pick below. This explanation is also page 1 of the PDF.</li>
          </ol>
          <h3>What to include</h3>
          <div className="pdf-opts">
            <label>Region
              <select value={region} onChange={(e) => setRegion(e.target.value)}>
                <option value="All">All regions</option>
                {regionKeys.map((k: string) => <option key={k} value={k}>{k}</option>)}
              </select></label>
            <label>Most promising first, up to
              <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
                {LIMITS.map((n) => <option key={n} value={n}>{n} companies</option>)}
              </select></label>
          </div>
          <div className="pdf-status">
            {STATUSES.map((st) => (
              <label key={st}><input type="checkbox" checked={picked.includes(st)}
                onChange={(e) => setPicked((p) => e.target.checked ? [...p, st] : p.filter((x) => x !== st))} />
                {st.replace("ICP — ", "")} <span className="muted">({inRegion(st)})</span></label>
            ))}
          </div>
          <p className="note">{matching} companies match; the PDF includes the top {Math.min(limit, matching)}. Free: built from data already in the app.</p>
        </div>
        <div className="wn-foot">
          <span className="wn-actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="button" className="btn primary" disabled={busy || !picked.length || matching === 0} onClick={generate}>{busy ? "Building PDF…" : "Generate PDF"}</button>
          </span>
        </div>
      </div>
    </div>
  );
}
