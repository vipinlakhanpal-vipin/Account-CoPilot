"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { notify } from "@/components/Confirm";
import FindContactsButton from "@/components/FindContactsButton";
import { LANE_LABEL, STRENGTH_ORDER, daysLeft, type Signal, type SignalLane, type SignalStatus } from "@/lib/signals";

type Job = { mode: string; slug?: string; region: string; status: string; company_name?: string; result?: string; requested_at: string };
type Data = { items: Signal[]; regions: string[]; sweeps: Record<string, string>; jobs: Job[] };
const LANES: SignalLane[] = ["rfp", "erp", "ecc"];
const fmt = (d: string) => (d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "");
const ago = (iso?: string) => { if (!iso) return "never"; const h = Math.round((Date.now() - new Date(iso).getTime()) / 36e5); return h < 1 ? "just now" : h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`; };

export default function BuyingSignals() {
  const [data, setData] = useState<Data | null>(null);
  const [lane, setLane] = useState<"all" | SignalLane>("all");
  const [strengths, setStrengths] = useState<string[]>(["Hot", "Warm"]);
  const [factOnly, setFactOnly] = useState(false);
  const [regions, setRegions] = useState<string[]>([]);
  const [show, setShow] = useState<"open" | "done" | "dismissed">("open");
  const [busy, setBusy] = useState("");

  const load = useCallback(() => fetch("/api/signals", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j: Data | null) => { if (j) setData(j); }).catch(() => {}), []);
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);

  const mark = async (ids: string[], status: SignalStatus) => {
    const r = await fetch("/api/signals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "status", ids, status }) });
    if (r.ok) { setData((d) => d && { ...d, items: d.items.map((s) => (ids.includes(s.id) ? { ...s, status } : s)) }); window.dispatchEvent(new Event("signals-changed")); }
    else notify("Could not update that signal.", "error");
  };
  const scan = async (region: string, slug?: string, company?: string) => {
    const key = slug || region; setBusy(key);
    const r = await fetch("/api/engine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "queue", region, count: 10, mode: "signals", ...(slug ? { slug } : {}) }) });
    const j = await r.json().catch(() => ({}));
    setBusy("");
    if (r.ok || r.status === 409) { notify(r.ok ? `${company || region} scan queued. New signals appear here when it finishes.` : j.error, r.ok ? "ok" : "error"); load(); }
    else notify(j.error || "Could not start the scan.", "error");
  };

  const regionList = data?.regions || [];
  const active = regions.length ? regions : regionList;
  const base = useMemo(() => (data?.items || []).filter((s) => active.includes(s.region) || !regionList.length), [data, active, regionList.length]);
  const open = base.filter((s) => s.status === "new" || s.status === "seen");
  const count = (l: SignalLane | "all") => open.filter((s) => l === "all" || s.lane === l).length;
  const shown = useMemo(() => base.filter((s) => (show === "open" ? s.status === "new" || s.status === "seen" : s.status === show))
    .filter((s) => (lane === "all" || s.lane === lane) && strengths.includes(s.strength) && (!factOnly || s.label === "FACT"))
    .sort((a, b) => STRENGTH_ORDER[a.strength] - STRENGTH_ORDER[b.strength] || (a.closes && b.closes ? a.closes.localeCompare(b.closes) : a.closes ? -1 : b.closes ? 1 : 0) || b.detected_at.localeCompare(a.detected_at)), [base, show, lane, strengths, factOnly]);
  const pending = (data?.jobs || []).filter((j) => j.status === "queued" || j.status === "running");
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <div className="sig">
      <section className="hero sig-hero">
        <h1>Buying signals</h1>
        <p>Companies that look ready to buy: open tenders and RFPs, ERP and S2P intent, and SAP ECC owners who will need an S/4HANA partner. Every signal carries its source.</p>
      </section>

      <div className="sig-lanes" role="group" aria-label="Signal type">
        {([["all", "All signals"], ...LANES.map((l) => [l, LANE_LABEL[l]])] as [string, string][]).map(([k, label]) => (
          <button type="button" key={k} className="sig-lane" aria-pressed={lane === k} onClick={() => setLane(k as "all" | SignalLane)}><b>{count(k as "all" | SignalLane)}</b><span>{label}</span></button>))}
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
          {regionList.slice(0, 4).map((r) => <button type="button" key={r} className="btn tiny" disabled={busy === r} onClick={() => scan(r)}>Scan {r}</button>)}
          <p className="note">Free. Runs as a scheduled Claude session, usually a few minutes.</p>
        </aside>

        <section className="sig-main">
          {pending.length > 0 && (
            <div className="sig-pending" role="status"><span className="fcj-dot" aria-hidden="true" /> <b className="fcj-flash">Scanning {pending.map((j) => j.company_name || `${j.region} tenders and companies`).join(", ")}…</b> New signals appear here by themselves.</div>)}
          {!data && <p className="note">Loading…</p>}
          {data && shown.length === 0 && (
            <div className="sig-empty">
              <h3>{open.length === 0 && show === "open" ? "No signals yet" : "Nothing matches these filters"}</h3>
              <p>{open.length === 0 && show === "open" ? "The daily run scans UAE and KSA for tenders, ERP and S2P intent, and ECC owners. You can also scan a region now from the left panel." : "Widen the strength or type, or switch to Done or Dismissed."}</p>
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
                  {s.doc_url ? <a className="btn tiny primary" href={s.doc_url} target="_blank" rel="noopener noreferrer">Download tender documents</a>
                    : s.needs_login ? <span className="sig-login" title="The documents sit behind a registration or login, which Account CoPilot does not bypass. Open the notice and register yourself.">Documents need registration</span> : null}
                  <a className="btn tiny" href={s.source_url} target="_blank" rel="noopener noreferrer">Open source</a>
                  {s.slug && <FindContactsButton slug={s.slug} region={s.region} company={s.company_name} />}
                  {s.slug && <button type="button" className="btn tiny" disabled={busy === s.slug} onClick={() => scan(s.region, s.slug, s.company_name)}>Rescan company</button>}
                  {s.status !== "done" && <button type="button" className="btn tiny" onClick={() => mark([s.id], "done")}>Mark done</button>}
                  {s.status !== "dismissed" ? <button type="button" className="btn tiny ghost" onClick={() => mark([s.id], "dismissed")}>Dismiss</button> : <button type="button" className="btn tiny" onClick={() => mark([s.id], "seen")}>Restore</button>}
                </div>
              </article>);
          })}
        </section>
      </div>
    </div>
  );
}
