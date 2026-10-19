"use client";
import { useEffect, useMemo, useState } from "react";
import { fmtDate, fmtDateTime, fmtTimeShort } from "@/lib/dates";

type Row = { name: string; status: string; revenue?: string; entity_type?: string; isNew: boolean };
type Run = { at: string; region: string; source?: string; added: number; checked: number; summary: string; rows: Row[] };
type RegionInfo = { region: string; name: string; status: string; priority?: string; discover_per_day: number; verify_per_day: number; rules: string; accounts: number; by_status: Record<string, number> };
type Co = { slug: string; name: string; country: string | null; region: string; status: string | null; entity_type: string | null; added: string; revenue: string };
type Activity = { now: string; regions: RegionInfo[]; runs: Run[]; companies: Co[] };

const STATUS_LABEL: Record<string, string> = { active: "Active", paused: "Paused", next: "Next phase" };
const STATUS_ORDER = ["ICP — Verified", "ICP — Likely", "ICP — Needs check", "Unknown", "Not ICP"];
const statusClass = (s: string) => (/verified/i.test(s) ? "st-v" : /likely/i.test(s) ? "st-l" : /not icp/i.test(s) ? "st-n" : "st-u");
const compact = (s: string) => s.replace(/\s*—\s*/g, "-");
const entityShort = (t?: string | null) => t === "Regional HQ" ? "HQ" : t === "Branch" ? "Branch" : t === "Foreign Branch" ? "Foreign" : "—";
const dayKey = (iso: string | Date) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

// The scheduled routine fires at 02:00 UTC (6am Dubai). The most recent such moment is what "did this region run?" is measured
// against, so it reads correctly from any time zone and doesn't flag a region as missed before the day's run has even started.
function lastScheduled(now: Date) {
  const t = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 2, 0, 0);
  return new Date(t > now.getTime() ? t - 86400000 : t);
}

export default function EngineActivity() {
  const [data, setData] = useState<Activity | null>(null);
  const [err, setErr] = useState("");
  const [region, setRegion] = useState("All");
  const [q, setQ] = useState("");
  const [all, setAll] = useState(false);
  useEffect(() => {
    const load = () => fetch("/api/engine?only=activity", { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((j) => { setData(j); setErr(""); }).catch(() => setErr("Could not load engine activity — try again in a moment."));
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);

  const view = useMemo(() => {
    if (!data) return null;
    const now = new Date(data.now), due = lastScheduled(now), dueMs = due.getTime();
    const justStarted = now.getTime() < dueMs + 2 * 3600 * 1000; // a full run takes up to ~70 min
    const days: string[] = [];
    for (let i = 6; i >= 0; i--) days.push(dayKey(new Date(now.getTime() - i * 86400000)));
    const rows = data.regions.map((r) => {
      const runs = data.runs.filter((x) => x.region === r.region);
      const latest = runs[0];
      const byDay: Record<string, { added: number; checked: number } | undefined> = {};
      for (const x of runs) { const k = dayKey(x.at); const c = byDay[k] || (byDay[k] = { added: 0, checked: 0 }); c.added += x.added; c.checked += x.checked; }
      const sinceDue = runs.filter((x) => new Date(x.at).getTime() >= dueMs);
      const added7 = days.reduce((n, k) => n + (byDay[k]?.added || 0), 0);
      return { ...r, runs, latest, byDay, ranLatest: sinceDue.length > 0, latestAdded: sinceDue.reduce((n, x) => n + x.added, 0), added7 };
    });
    return { rows, days, due, justStarted };
  }, [data]);

  if (err && !data) return <div className="panel"><p className="note">{err}</p></div>;
  if (!data || !view) return <div className="panel"><p className="note">Loading engine activity…</p></div>;

  const selected = view.rows.find((r) => r.region === region);
  const shownRows = view.rows.filter((r) => r.status === "active" || r.accounts > 0 || r.runs.length > 0);
  const missed = shownRows.filter((r) => r.status === "active" && !r.ranLatest && !view.justStarted);

  const detail = selected && (() => {
    const cos = data.companies.filter((c) => c.region === selected.region);
    const needle = q.trim().toLowerCase();
    const list = needle ? cos.filter((c) => `${c.name} ${c.status} ${c.entity_type}`.toLowerCase().includes(needle)) : cos;
    const shown = all ? list : list.slice(0, 40);
    const run14 = selected.runs.filter((x) => Date.now() - new Date(x.at).getTime() < 14 * 86400000);
    return (
      <>
        <h3 className="act-region">{selected.name}</h3>
        <p className="note"><span className={`act-pill ${selected.status}`}>{STATUS_LABEL[selected.status] || selected.status}</span> {selected.rules}</p>
        <div className="act-tiles">
          <div><b>{selected.accounts}</b><span>accounts</span></div>
          {STATUS_ORDER.map((s) => <div key={s}><b>{selected.by_status[s] || 0}</b><span>{compact(s).replace("ICP-", "")}</span></div>)}
          <div><b>{selected.added7}</b><span>added, last 7 days</span></div>
        </div>
        <h4 className="act-sub">Runs, last 14 days</h4>
        {run14.length === 0 ? <p className="note">{selected.status === "active" ? "No run recorded for this region in the last 14 days." : "This region is not active, so the engine doesn't run it."}</p> : (
          <div className="tablewrap"><table className="run-history-table"><thead><tr><th>Date</th><th>Run</th><th>New</th><th>Checked</th><th>Summary</th></tr></thead>
            <tbody>{run14.map((x, i) => (
              <tr key={i}><td className="muted run-date">{fmtDate(x.at)}<br />{fmtTimeShort(x.at)}</td>
                <td>{x.source === "instant" ? <span className="run-badge instant">Instant</span> : <span className="run-badge daily">Daily</span>}</td>
                <td>{x.added}</td><td>{x.checked}</td><td className="wrap act-sum">{x.summary}</td></tr>))}</tbody></table></div>
        )}
        <h4 className="act-sub">Companies in {selected.name} <span className="muted">({list.length})</span></h4>
        <div className="act-search"><input type="search" placeholder="Search this region's companies" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search companies" /></div>
        <div className="tablewrap"><table className="run-history-table"><thead><tr><th>Company</th><th>Entity</th><th>Status</th><th>Revenue</th><th>Added</th></tr></thead>
          <tbody>{shown.map((c) => (
            <tr key={c.slug}><td className="wrap"><a href={`/?open=${encodeURIComponent(c.slug)}`}>{c.name}</a></td>
              <td className="muted">{entityShort(c.entity_type)}</td>
              <td>{c.status ? <span className={`status-plain ${statusClass(c.status)}`}>{compact(c.status)}</span> : <span className="muted">—</span>}</td>
              <td className="muted">{c.revenue || "—"}</td><td className="muted">{fmtDateTime(c.added)}</td></tr>))}</tbody></table></div>
        {list.length > shown.length && <button type="button" className="btn tiny" onClick={() => setAll(true)}>Show all {list.length}</button>}
      </>
    );
  })();

  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <div className="act-head">
        <h2>Engine activity</h2>
        <label className="act-select">Region
          <select value={region} onChange={(e) => { setRegion(e.target.value); setQ(""); setAll(false); }}>
            <option value="All">All regions — overview</option>
            {shownRows.map((r) => <option key={r.region} value={r.region}>{r.name}{r.status === "active" ? "" : ` (${(STATUS_LABEL[r.status] || r.status).toLowerCase()})`}</option>)}
          </select>
        </label>
      </div>
      <p className="note">Built from the regions that <b>should</b> run each morning (Active in Define ICP), so a region the engine skipped shows up as a gap instead of simply not appearing. The latest scheduled run was {fmtDateTime(view.due.toISOString())}.</p>
      {missed.length > 0 && <p className="act-alert" role="alert">⚠ No run recorded since the latest scheduled run for: <b>{missed.map((m) => m.name).join(", ")}</b>.</p>}
      {!selected ? (
        <div className="tablewrap"><table className="run-history-table act-table"><thead><tr><th>Region</th><th>State</th><th>Priority</th><th>Today's plan (new / checks)</th><th>Accounts</th><th>Verified</th><th>Likely</th><th>Latest run</th>
          {view.days.map((d) => <th key={d} className="act-day">{d.slice(5)}</th>)}<th>New, 7 days</th></tr></thead>
          <tbody>{shownRows.map((r) => {
            const active = r.status === "active";
            const flag = !active ? <span className="muted">—</span>
              : r.ranLatest ? <span className="act-ok">Ran · +{r.latestAdded} new</span>
              : view.justStarted ? <span className="act-wait">Run due</span> : <span className="act-miss">Not run</span>;
            return (
              <tr key={r.region} className="act-row" onClick={() => setRegion(r.region)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setRegion(r.region)}>
                <td><b>{r.name}</b></td>
                <td><span className={`act-pill ${r.status}`}>{STATUS_LABEL[r.status] || r.status}</span></td>
                <td>{active && r.priority ? <span className={`bell-prio p-${r.priority}`}>{r.priority === "high" ? "High" : r.priority === "low" ? "Low" : "Medium"}</span> : <span className="muted">—</span>}</td>
                <td className="muted">{active ? `${r.discover_per_day} / ${r.verify_per_day}` : "—"}</td>
                <td>{r.accounts}</td><td>{r.by_status["ICP — Verified"] || 0}</td><td>{r.by_status["ICP — Likely"] || 0}</td>
                <td>{flag}{r.latest && <div className="muted act-last">{fmtDate(r.latest.at)}</div>}</td>
                {view.days.map((d) => { const c = r.byDay[d];
                  return <td key={d} className={`act-day ${c ? "ran" : active ? "gap" : ""}`} title={c ? `${c.added} new, ${c.checked} checked` : active ? "No run recorded" : "Not active"}>{c ? `+${c.added}` : active ? "—" : ""}</td>; })}
                <td><b>{r.added7}</b></td>
              </tr>);
          })}</tbody></table></div>
      ) : <>{detail}</>}
    </div>
  );
}
