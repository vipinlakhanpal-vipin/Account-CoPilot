"use client";
import { useEffect, useState } from "react";
import { fmtDate, fmtTimeShort } from "@/lib/dates";

type LogDetail = { name: string; status: string; revenue?: string; entity_type?: "Regional HQ" | "Branch" | "Unknown" };
type LogEntry = { at: string; summary: string; verified: number; new_companies: string[]; details?: LogDetail[]; source?: "daily" | "instant"; region?: string };
/** Plain-text status color for the compact run-history table (no pill/box). */
const statusColor = (s: string) => (/verified/i.test(s) ? "st-v" : /likely/i.test(s) ? "st-l" : /not icp/i.test(s) ? "st-n" : "st-u");
/** "ICP — Verified" -> "ICP-Verified": compact, no spaces around the dash. */
const compactStatus = (s: string) => s.replace(/\s*—\s*/g, "-");
// Short label for this table — a row without entity_type is a revenue re-check, not a new find, so it never had one determined.
const entityShort = (t?: string) => t === "Regional HQ" ? "HQ" : t === "Branch" ? "Branch" : "—";

// Mission Control: the engine's own run history, same data the bell shows, as a standing table instead of a popup
// you have to keep open. Fetches independently (?only=log) so it doesn't need the rest of Settings' engine state.
export default function ScheduledRunHistory() {
  const [log, setLog] = useState<LogEntry[]>([]);
  useEffect(() => {
    const load = () => fetch("/api/engine?only=log", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => j && setLog(j.entries || [])).catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);
  if (log.length === 0) return null;
  const latest = log[0];
  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <h2>Scheduled run history</h2>
      <p className="note">Every run from here on tags itself automatically — Run status shows a badge with no extra step. Older runs, from before this existed, show &quot;—&quot;.</p>
      <div className="run-summary-box">
        <div className="run-summary-box-label">Summary</div>
        <div className="run-summary-box-body"><b>{latest.verified}</b> verified{latest.new_companies.length > 0 && <> · {latest.new_companies.length} new: {latest.new_companies.join(", ")}</>}</div>
      </div>
      <div className="tablewrap"><table className="run-history-table"><thead><tr><th>Date</th><th>Company</th><th>Entity</th><th>Status</th><th>Revenue</th><th>Region</th><th>Run Status</th><th>Activate Region</th></tr></thead>
        <tbody>{log.slice(0, 10).flatMap((e) => {
          // Older runs, from before per-company detail tracking existed, only have a free-text summary and a
          // new-companies list — fall back to one row per named company (status/revenue unknown) instead of
          // dumping the whole sentence into the Company cell.
          const rows = e.details && e.details.length > 0 ? e.details.slice(0, 30)
            : e.new_companies && e.new_companies.length > 0 ? e.new_companies.map((name) => ({ name, status: "", revenue: "" }))
            : [{ name: e.summary, status: "", revenue: "" }];
          const held = e.details?.filter((d) => /^held/i.test(d.status)) || [];
          const n = rows.length;
          return rows.map((d, i) => (
            <tr key={`${e.at}-${i}`} className={i === 0 ? "run-group-top" : undefined}>
              {i === 0 && <td className="muted run-date" rowSpan={n}>{fmtDate(e.at)}<br />{fmtTimeShort(e.at)}</td>}
              <td className="wrap">{d.name}</td>
              <td className="muted" title={(d as LogDetail).entity_type === "Branch" ? "Local branch or subsidiary of a company headquartered elsewhere" : (d as LogDetail).entity_type === "Regional HQ" ? "Headquartered in the Middle East" : "Not determined (revenue re-check, not a new find)"}>{entityShort((d as LogDetail).entity_type)}</td>
              <td>{d.status ? <span className={`status-plain ${statusColor(d.status)}`}>{compactStatus(d.status)}</span> : <span className="muted">—</span>}</td>
              <td className="muted">{d.revenue || "—"}</td>
              {i === 0 && <td rowSpan={n}>{e.region || <span className="muted">—</span>}</td>}
              {i === 0 && <td rowSpan={n}>{e.source === "instant" ? <span className="run-badge instant">Instant Run</span> : e.source === "daily" ? <span className="run-badge daily">Daily Run 6am GST</span> : <span className="muted">—</span>}</td>}
              {i === 0 && <td rowSpan={n}>{held.length > 0 ? held.map((h, hi) => <div key={hi}><a className="job-link" href="/settings#engine-pending">Activate {h.status.replace(/^held \(|\)$/gi, "")} →</a></div>) : <span className="muted">—</span>}</td>}
            </tr>
          ));
        })}</tbody></table></div>
    </div>
  );
}
