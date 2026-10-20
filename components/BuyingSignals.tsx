"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ask, notify } from "@/components/Confirm";
import { ScanGauge, DoneTick } from "@/components/ScanGauge";
import { expectedSecs, clock } from "@/lib/scanTime";
import { logActivity } from "@/lib/activityClient";
import FindContactsButton from "@/components/FindContactsButton";
import { LANE_LABEL, STRENGTH_ORDER, daysLeft, type Signal, type SignalLane, type SignalStatus } from "@/lib/signals";

type Job = { mode: string; slug?: string; region: string; status: string; company_name?: string; result?: string; requested_at: string; started_at?: string; done_at?: string; seamless?: boolean };
type Data = { items: Signal[]; regions: string[]; sweeps: Record<string, string>; jobs: Job[] };
const LANES: SignalLane[] = ["rfp", "erp", "ecc"];
const fmt = (d: string) => (d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "");
const ago = (iso?: string) => { if (!iso) return "never"; const h = Math.round((Date.now() - new Date(iso).getTime()) / 36e5); return h < 1 ? "just now" : h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`; };

export default function BuyingSignals({ embedded = false }: { embedded?: boolean }) {
  const [data, setData] = useState<Data | null>(null);
  const [lane, setLane] = useState<"all" | SignalLane>("all");
  const [strengths, setStrengths] = useState<string[]>(["Hot", "Warm"]);
  const [factOnly, setFactOnly] = useState(false);
  const [regions, setRegions] = useState<string[] | null>(null); // null = not chosen yet: UAE is ticked by default
  const [show, setShow] = useState<"open" | "done" | "dismissed">("open");
  const [busy, setBusy] = useState("");

  const load = useCallback(() => fetch("/api/signals", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j: Data | null) => { if (j) setData(j); }).catch(() => {}), []);
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);

  const mark = async (ids: string[], status: SignalStatus) => {
    const r = await fetch("/api/signals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "status", ids, status }) });
    if (r.ok) { setData((d) => d && { ...d, items: d.items.map((s) => (ids.includes(s.id) ? { ...s, status } : s)) }); window.dispatchEvent(new Event("signals-changed")); }
    else notify("Could not update that signal.", "error");
  };
  const scan = async (region: string, slug?: string, company?: string, quiet = false) => {
    const key = slug || region; setBusy(key); logActivity("scan", `Buying signals: ${company || region}`);
    const r = await fetch("/api/engine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "queue", region, count: 10, mode: "signals", ...(lane !== "all" && !slug ? { lane } : {}), ...(slug ? { slug } : {}) }) });
    const j = await r.json().catch(() => ({}));
    setBusy("");
    if (r.ok || r.status === 409) { if (!quiet) notify(r.ok ? `${company || region} scan queued. New signals appear here when it finishes.` : j.error, r.ok ? "ok" : "error"); load(); }
    else notify(j.error || "Could not start the scan.", "error");
  };

  const stopScans = async () => {
    if (!(await ask({ title: "Stop scanning?", body: "Waiting scans are removed and running ones are marked stopped. Signals already found stay saved.", confirm: "Stop scanning", tone: "danger" }))) return;
    const r = await fetch("/api/engine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "stop_scans", mode: "signals" }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok) { notify(`Stopped: ${j.removed || 0} waiting removed, ${j.stopped || 0} running marked stopped.`, "ok"); load(); } else notify(j.error || "Could not stop the scans.", "error");
  };
  const regionList = data?.regions || [];
  // "Scan now": the ticked regions and the lane you have selected (All signals = every lane), one after another, after a confirmation
  const laneName = lane === "all" ? "all signals" : LANE_LABEL[lane];
  const scanAllRef = { current: async () => {} };
  scanAllRef.current = async () => {
    if (!active.length) { notify("Tick a region first.", "error"); return; }
    if (!(await ask({ title: "Scan now?", body: `This queues ${active.length} free scan${active.length === 1 ? "" : "s"} for ${laneName} in ${active.join(", ")}. Each takes a few minutes and they run one after another. Tick fewer regions or pick a lane first to scan less.`, confirm: "Queue them" }))) return;
    for (const r of active) await scan(r, undefined, undefined, true);
    notify(`${active.length} scan${active.length === 1 ? "" : "s"} queued for ${laneName}. New signals appear here when they finish.`, "ok");
  };
  useEffect(() => {
    if (!embedded) return;
    const on = (e: Event) => { if ((e as CustomEvent<string>).detail === "signals") scanAllRef.current(); };
    window.addEventListener("appwin-scan", on);
    return () => window.removeEventListener("appwin-scan", on);
  });
  const active = regions ?? (regionList.includes("UAE") ? ["UAE"] : regionList.slice(0, 1));
  const base = useMemo(() => (data?.items || []).filter((s) => active.includes(s.region) || !regionList.length), [data, active, regionList.length]);
  const open = base.filter((s) => s.status === "new" || s.status === "seen");
  const count = (l: SignalLane | "all") => open.filter((s) => l === "all" || s.lane === l).length;
  const shown = useMemo(() => base.filter((s) => (show === "open" ? s.status === "new" || s.status === "seen" : s.status === show))
    .filter((s) => (lane === "all" || s.lane === lane) && strengths.includes(s.strength) && (!factOnly || s.label === "FACT"))
    .sort((a, b) => STRENGTH_ORDER[a.strength] - STRENGTH_ORDER[b.strength] || (a.closes && b.closes ? a.closes.localeCompare(b.closes) : a.closes ? -1 : b.closes ? 1 : 0) || b.detected_at.localeCompare(a.detected_at)), [base, show, lane, strengths, factOnly]);
  const pending = (data?.jobs || []).filter((j) => j.mode === "signals" && (j.status === "queued" || j.status === "running"));
  // Find contacts started from a card shows inside that card
  const contactJob = (slug: string) => (data?.jobs || []).find((j) => j.mode === "contacts" && j.slug === slug);
  const [hideContacts, setHideContacts] = useState<string[]>([]);
  const [finished, setFinished] = useState("");
  const hadPending = useRef(false);
  useEffect(() => {
    if (hadPending.current && pending.length === 0) { setFinished("Scan finished. New signals are listed below."); const t = setTimeout(() => setFinished(""), 12000); hadPending.current = false; return () => clearTimeout(t); }
    hadPending.current = pending.length > 0;
  });
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <div className="sig">
      {!embedded && <section className="hero sig-hero">
        <h1>Buying signals</h1>
        <p>Companies that look ready to buy: open tenders and RFPs, ERP and S2P intent, and SAP ECC owners who will need an S/4HANA partner. Every signal carries its source.</p>
      </section>}

      <section className="sig-about" aria-label="About buying signals">
        <p><b>What it does.</b> Spots companies that look ready to buy: open tenders and RFPs, ERP, source-to-pay and sourcing-to-contract intent, support and upgrade deals, contract awards, upsell and cross-sell openings at accounts you already track, and SAP ECC owners who will need an S/4HANA partner. <b>How.</b> It reads public pages only (tender portals and notices, company sites, annual reports, press, job posts), never logs in or registers. Each signal is rated Hot, Warm or Watch, labelled Fact, Likely or Unverified, and keeps its source link; Hot is reserved for documented facts, and tender documents behind a login are marked as such. <b>In the daily run.</b> After the main work each morning, the engine sweeps every active Middle East region (UAE, KSA, Qatar, Kuwait, Oman, Bahrain, Egypt): High-priority regions every day, Medium every 3 days, Low weekly, then scans up to 10 companies per region. Scan now queues the same job on demand, and new Hot and Warm signals raise the alert badge in the top bar.</p>
      </section>

      <div className="sig-lanes" role="group" aria-label="Signal type">
        {([["all", "All signals"], ...LANES.map((l) => [l, LANE_LABEL[l]])] as [string, string][]).map(([k, label]) => (
          <button type="button" key={k} className={`sig-lane ${({ all: "c1", rfp: "c4", erp: "c2", ecc: "c3" } as Record<string, string>)[k]}`} aria-pressed={lane === k} onClick={() => setLane(k as "all" | SignalLane)}><b>{count(k as "all" | SignalLane)}</b><span>{label}</span></button>))}
      </div>

      <div className="sig-body">
        <aside className="sig-side">
          <h3>Regions</h3>
          {regionList.length === 0 ? <p className="note">No active region.</p> : regionList.map((r) => (
            <label key={r}><input type="checkbox" checked={active.includes(r)} onChange={() => setRegions(toggle(active, r))} /> {r} <small>{ago(data?.sweeps[r])}</small></label>))}
          <h3>Strength</h3>
          {["Hot", "Warm", "Watch"].map((s) => <label key={s}><input type="checkbox" checked={strengths.includes(s)} onChange={() => setStrengths(toggle(strengths, s))} /> {s}</label>)}
          <h3>Evidence</h3>
          <label><input type="checkbox" checked={factOnly} onChange={() => setFactOnly(!factOnly)} /> Fact only</label>
          <h3>Show</h3>
          {([["open", "Open"], ["done", "Done"], ["dismissed", "Dismissed"]] as const).map(([k, l]) => (
            <label key={k}><input type="radio" name="sigshow" checked={show === k} onChange={() => setShow(k)} /> {l}</label>))}
          <h3>Scan now</h3>
          {active.map((r) => <button type="button" key={r} className="btn tiny" disabled={busy === r} onClick={() => scan(r)} title={`Scan ${r} for ${laneName}`}>Scan {r}</button>)}
          <p className="note">Free. Runs as a scheduled Claude session, usually a few minutes.</p>
        </aside>

        <section className="sig-main">
          {pending.length > 0 && (
            <div className="sig-pending sig-pend-list" role="status">
              {pending.map((j, i) => <div key={i} className="sig-pend-row"><ScanGauge label={`Scanning ${j.company_name || `${j.region} tenders and companies`}`} requestedAt={j.requested_at} startedAt={j.started_at} expectedSecs={expectedSecs(j)} /></div>)}
              <button type="button" className="btn tiny danger" onClick={stopScans}>■ Stop scanning</button>
            </div>)}
          {finished && pending.length === 0 && <div className="sig-pending done" role="status"><DoneTick text={finished} /></div>}
          {!data && <p className="note">Loading…</p>}
          {data && shown.length === 0 && (
            <div className="sig-empty">
              <h3>{open.length === 0 && show === "open" ? "No signals yet" : "Nothing matches these filters"}</h3>
              <p>{open.length === 0 && show === "open" ? "Nothing has been scanned yet. The daily 6am run scans every active Middle East region for tenders, ERP, S2P and S2C intent, support and upgrade deals, upsell and cross-sell, and ECC owners. You do not have to wait: scan now (free, usually a few minutes)." : "Widen the strength or type, or switch to Done or Dismissed."}</p>
              {open.length === 0 && show === "open" && <div className="sig-scanbar">{regionList.map((r) => <button type="button" key={r} className="btn primary" disabled={busy === r} onClick={() => scan(r)}>{busy === r ? "Queuing…" : `Scan ${r} now`}</button>)}</div>}
            </div>)}
          {shown.map((s) => {
            const left = daysLeft(s.closes);
            return (
              <article key={s.id} className={`sig-card ${s.strength.toLowerCase()}${s.status === "new" ? " fresh" : ""}`} onMouseEnter={() => s.status === "new" && mark([s.id], "seen")}>
                <div className="sig-row">
                  {s.slug ? <Link className="sig-co" href={`/?open=${encodeURIComponent(s.slug)}&country=${encodeURIComponent(s.region)}`}>{s.company_name}</Link> : <b className="sig-co">{s.company_name}</b>}
                  <span className="sig-meta">{s.region}{s.slug ? "" : " · not in your accounts"}</span>
                  <span className={`sig-pill str-${s.strength.toLowerCase()}`}>{s.strength}</span>
                  <span className={`sig-pill lab-${s.label.toLowerCase()}`}>{s.label}</span>
                  <span className="sig-pill lane">{LANE_LABEL[s.lane]}</span>
                  {s.status === "new" && <span className="new-tag">NEW</span>}
                </div>
                <h4>{s.title}</h4>
                <p className="sig-ev">{s.evidence}</p>
                <p className="sig-src">
                  {s.published && <>Published {fmt(s.published)} · </>}{s.closes && <b className={left !== null && left <= 7 ? "sig-soon" : ""}>Closes {fmt(s.closes)}{left !== null ? ` (${left} day${left === 1 ? "" : "s"} left)` : ""} · </b>}
                  Source: <a href={s.source_url} target="_blank" rel="noopener noreferrer">{s.source_name || "open"}</a>
                </p>
                {s.why && <p className="sig-why"><b>Why it matters:</b> {s.why}</p>}
                <div className="sig-acts">
                  {s.doc_url ? <a className="btn btn-dl keep tiny" href={s.doc_url} target="_blank" rel="noopener noreferrer">Download tender documents</a>
                    : s.needs_login ? <span className="sig-login" title="The documents sit behind a registration or login, which Account CoPilot does not bypass. Open the notice and register yourself.">Documents need registration</span> : null}
                  <a className="btn tiny" href={s.source_url} target="_blank" rel="noopener noreferrer">Open source</a>
                  {s.slug && (() => { const cj = contactJob(s.slug); return cj && (cj.status === "queued" || cj.status === "running") ? <ScanGauge compact label="Searching contacts" requestedAt={cj.requested_at} startedAt={cj.started_at} expectedSecs={expectedSecs(cj)} /> : <FindContactsButton slug={s.slug} region={s.region} company={s.company_name} quiet onQueued={load} />; })()}
                  {s.slug && <button type="button" className="btn tiny" disabled={busy === s.slug} onClick={() => scan(s.region, s.slug, s.company_name)}>Rescan company</button>}
                  {s.status !== "done" && <button type="button" className="btn tiny" onClick={() => mark([s.id], "done")}>Mark done</button>}
                  {s.status !== "dismissed" ? <button type="button" className="btn tiny ghost" onClick={() => mark([s.id], "dismissed")}>Dismiss</button> : <button type="button" className="btn tiny" onClick={() => mark([s.id], "seen")}>Restore</button>}
                </div>
                {s.slug && (() => { const cj = contactJob(s.slug); if (!cj || hideContacts.includes(cj.slug || "")) return null;
                  const run = cj.status === "queued" || cj.status === "running";
                  const took = cj.started_at && cj.done_at ? Math.round((new Date(cj.done_at).getTime() - new Date(cj.started_at).getTime()) / 1000) : 0;
                  const added = Number(cj.result?.match(/(\d+)\s+contacts?\s+added/i)?.[1] || 0), updated = Number(cj.result?.match(/(\d+)\s+updated/i)?.[1] || 0);
                  return (
                    <div className={`sig-cmsg${run ? " run" : cj.status === "done" ? " ok" : " bad"}`} role="status">
                      {run ? <>Reading public web pages{cj.seamless ? " and Seamless records" : ""} for named people with an email, phone or LinkedIn link. Usually a few minutes; this card updates by itself.</>
                        : cj.status === "done" ? (added + updated > 0 ? <><b>Done{took ? ` in ${clock(took)}` : ""}:</b> {added} new contact{added === 1 ? "" : "s"} added{updated ? `, ${updated} updated` : ""}. Open the account's Stakeholders list (look for the green NEW badge).</> : <><b>Done{took ? ` in ${clock(took)}` : ""}:</b> no new public email, phone or LinkedIn was found, so nothing was added.</>)
                        : <>The contact search did not finish. Try Find contacts again in a few minutes.</>}
                      {!run && <button type="button" className="fcj-x" aria-label="Dismiss" onClick={() => setHideContacts((h) => [...h, cj.slug || ""])}>×</button>}
                    </div>); })()}
              </article>);
          })}
        </section>
      </div>
    </div>
  );
}
