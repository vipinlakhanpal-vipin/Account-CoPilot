"use client";
import { logActivity } from "@/lib/activityClient";
import { useEffect, useMemo, useState } from "react";
import { REGIONS, rulesFor, describeRules, regionOf } from "@/lib/icpDefinition.mjs";
import { notify } from "@/components/Confirm";
import type { Row } from "@/lib/data";

const STATUSES = ["ICP — Verified", "ICP — Likely", "ICP — Needs check"] as const;
const PRESETS = [1, 5, 10, 25, 50, 100, 0]; // 0 = all
const PDF_MAX = 150;
type Format = "pdf" | "xlsx";

/** POSTs to a report API and saves the file. Shared by the region dialog and the single-company button in the account brief. */
export async function downloadReport(body: Record<string, unknown>, format: Format = "pdf"): Promise<boolean> {
  logActivity("report", `${format.toUpperCase()} report`);
  try {
    const res = await fetch(`/api/report/${format}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) { const j = await res.json().catch(() => ({})); notify(j.error || "Could not build the report. Try again.", "error"); return false; }
    const blob = await res.blob();
    const name = /filename="?([^";]+)"?/.exec(res.headers.get("content-disposition") || "")?.[1] || `Account_CoPilot_Report.${format}`;
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    const n = res.headers.get("X-Report-Count"), t = res.headers.get("X-Report-Total"), c = res.headers.get("X-Report-Companies");
    notify(format === "xlsx" ? `Contact list ready: ${n} contacts from ${c} of ${t} companies.`
      : Number(n) === 1 ? "Company report ready." : `Report ready: ${n} of ${t} companies.`, "ok");
    return true;
  } catch { notify("Could not build the report. Try again.", "error"); return false; }
}

// Accounts, Pipeline and Priority accounts → "Reports". Two formats: a full PDF brief per company, or an Excel contact list for campaigns.
// The region is always asked for explicitly, never assumed from the screen you opened this from.
// With `companyIds` (opened from a dashboard drill-down) the report covers exactly that list, whatever its statuses.
export default function ReportDialog({ accounts, icpDef, onClose, companyIds, listTitle }:
  { accounts: Row[]; icpDef: unknown; onClose: () => void; companyIds?: string[]; listTitle?: string }) {
  const listMode = !!companyIds;
  const idSet = useMemo(() => new Set(companyIds || []), [companyIds]);
  const [format, setFormat] = useState<Format>("pdf");
  const [region, setRegion] = useState("");
  const [picked, setPicked] = useState<string[]>([...STATUSES]);
  const [limit, setLimit] = useState(10); // 0 = all
  const [custom, setCustom] = useState("");
  const [rank, setRank] = useState<"fit" | "revenue" | "name">("fit");
  // The number actually used: a typed custom number wins; the PDF is capped at 150 companies (it is a long document).
  const asked = custom.trim() ? Math.max(1, Math.floor(Number(custom)) || 1) : limit;
  const eff = format === "pdf" ? (asked === 0 || asked > PDF_MAX ? PDF_MAX : asked) : asked; // 0 = every company with a contact
  const [emailOnly, setEmailOnly] = useState(true);
  const [busy, setBusy] = useState(false);

  const counts = useMemo(() => {
    const c: Record<string, Record<string, number>> = {};
    for (const a of accounts) {
      const r = regionOf(a.country), st = String(a.icp_status || "");
      if (listMode) { if (!idSet.has(a.id)) continue; (c[r] ||= {}).list = (c[r]?.list || 0) + 1; continue; }
      if (!(STATUSES as readonly string[]).includes(st)) continue;
      (c[r] ||= {})[st] = (c[r]?.[st] || 0) + 1;
    }
    return c;
  }, [accounts, listMode, idSet]);
  const regionKeys = REGIONS.map((r: { key: string }) => r.key).filter((k: string) => counts[k]);
  // A list that sits in one region (for example UAE's existing Coupa customers) has nothing to choose: that region is picked for you.
  useEffect(() => { if (listMode && !region && regionKeys.length === 1) setRegion(regionKeys[0]); }, [listMode, region, regionKeys.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  const inRegion = (st: string) => region === "All" ? regionKeys.reduce((n: number, k: string) => n + (counts[k]?.[st] || 0), 0) : counts[region]?.[st] || 0;
  const matching = !region ? 0 : listMode ? inRegion("list") : picked.reduce((n, st) => n + inRegion(st), 0);
  const rules = region && region !== "All" ? rulesFor(icpDef, region) : null;
  const ready = !!region && (listMode || picked.length > 0) && matching > 0 && !busy;

  async function generate() {
    if (!ready) return;
    setBusy(true);
    const scope = listMode ? { companyIds, title: listTitle } : { statuses: picked };
    const ok = format === "pdf" ? await downloadReport({ ...scope, region, limit: eff, rank })
      : await downloadReport({ ...scope, region, emailOnly, rank, ...(eff ? { limit: eff } : {}) }, "xlsx");
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <div className="wn-backdrop" onClick={onClose}>
      <div className="wn" role="dialog" aria-modal="true" aria-labelledby="rep-title" onClick={(e) => e.stopPropagation()}>
        <div className="wn-head">
          <div><p className="wn-kicker">Reports</p><h2 id="rep-title">{format === "pdf" ? "Full account report (PDF)" : "Contact list for campaigns (Excel)"}</h2></div>
          <button type="button" className="wn-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="wn-body pdf-body">
          <div className="seg-toggle-row">
            <div className="seg-toggle" role="group" aria-label="Report format">
              <button type="button" aria-pressed={format === "pdf"} onClick={() => setFormat("pdf")}>Full report · PDF</button>
              <button type="button" aria-pressed={format === "xlsx"} onClick={() => setFormat("xlsx")}>Contact list · Excel</button>
            </div>
          </div>

          {format === "pdf" ? (
            <>
              <h3>How Account CoPilot builds this</h3>
              <ol className="pdf-how">
                <li><b>ICP Profile decides who counts.</b> {rules ? <>{describeRules(region, rules)}.</> : "Each region uses its own rules from Setup → Define ICP."}</li>
                <li><b>Evidence decides the status.</b> Official filings and results make a company <i>Verified</i>; estimates or your own data make it <i>Likely</i>; conflicting sources make it <i>Needs check</i>. Every figure keeps its source.</li>
                <li><b>Scores are rule-based.</b> ICP Match, Opportunity and Coupa Fit are computed from that evidence with no API cost, and the report explains how every point is earned.</li>
                <li><b>Same content as the account brief:</b> facts, maturity, scores, signals, ERP and apps, stakeholders and evidence. This explanation is also page 1 of the PDF.</li>
              </ol>
            </>
          ) : (
            <>
              <h3>What you get</h3>
              <p className="note">A single Campaign List sheet for the region you choose: each company once, with its contacts beneath it and the number of companies at the top.</p>
              <p className="pdf-cols">Company Name · Contact Name (plus First and Last Name) · Contact Job Title · Email ID · Existing ERP · Existing S2P Platform · Net Revenue (USD, local currency in brackets) · Revenue Type · Total Employees · HQ Location</p>
              <p className="note">Official company emails only; generic mailboxes and personal domains are left out and emails are never guessed. Contacts exist only where your workbook or Seamless enrichment added them.</p>
            </>
          )}

          <h3>Which region is this for?</h3>
          <div className="pdf-opts">
            <label>Region
              <select value={region} onChange={(e) => setRegion(e.target.value)} aria-required="true">
                <option value="" disabled>Choose a region…</option>
                {format === "pdf" && (!listMode || regionKeys.length > 1) && <option value="All">All regions</option>}
                {regionKeys.map((k: string) => <option key={k} value={k}>{k}</option>)}
              </select></label>
            <div className="pdf-count" role="group" aria-label="How many companies">
              <span className="pdf-count-label">How many companies?</span>
              <span className="pdf-chips">
                {PRESETS.map((n) => (
                  <button type="button" key={n} className="pdf-chip" aria-pressed={!custom.trim() && limit === n}
                    onClick={() => { setLimit(n); setCustom(""); }}>{n === 0 ? (format === "pdf" ? `Up to ${PDF_MAX}` : "All") : n}</button>))}
                <input type="number" min={1} max={format === "pdf" ? PDF_MAX : 1000} className="pdf-custom" placeholder="Custom" aria-label="Custom number of companies"
                  value={custom} onChange={(e) => setCustom(e.target.value)} />
              </span>
            </div>
            <label>Pick them by
              <select value={rank} onChange={(e) => setRank(e.target.value as "fit" | "revenue" | "name")}>
                <option value="fit">Best ICP fit (ICP Match)</option>
                <option value="revenue">Largest revenue</option>
                <option value="name">Name, A to Z</option>
              </select></label>
          </div>
          {listMode && <p className="note">This covers the {idSet.size.toLocaleString()} companies in &quot;{listTitle}&quot; as shown on screen, whatever their ICP status. To narrow it, close this and set a search or filter on the table first.</p>}
          {!listMode && <div className="pdf-status">
            {STATUSES.map((st) => (
              <label key={st}><input type="checkbox" checked={picked.includes(st)}
                onChange={(e) => setPicked((p) => e.target.checked ? [...p, st] : p.filter((x) => x !== st))} />
                {st.replace("ICP — ", "")} {region && <span className="muted">({inRegion(st)})</span>}</label>
            ))}
          </div>}
          {format === "xlsx" && (
            <label className="pdf-check"><input type="checkbox" checked={emailOnly} onChange={(e) => setEmailOnly(e.target.checked)} /> Only people I can reach: an official email, a phone or a LinkedIn profile (recommended)</label>
          )}
          <p className="note">{!region ? "Choose a region to continue." : `${matching} companies match. ${format === "pdf" ? `The PDF covers ${Math.min(eff, matching)}` : eff ? `The Excel lists up to ${eff} that have a contact on file` : "The Excel lists every one that has a contact on file"}, picked by ${rank === "revenue" ? "largest revenue" : rank === "name" ? "name" : "best ICP fit"}. Free: built from data already in the app.`}</p>
        </div>
        <div className="wn-foot">
          <span className="wn-actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="button" className="btn btn-dl big" disabled={!ready} onClick={generate}>{busy ? "Building…" : format === "pdf" ? "Generate PDF" : "Generate Excel"}</button>
          </span>
        </div>
      </div>
    </div>
  );
}
