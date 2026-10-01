"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import DailyRunLocalTime from "@/components/DailyRunLocalTime";
import { fmtDateTime } from "@/lib/dates";

type Detail = { name: string; status: string; revenue?: string };
type Entry = { at: string; summary: string; verified: number; new_companies: string[]; details?: Detail[] };
const statusTag = (s: string) => (/verified/i.test(s) ? "fact" : /likely/i.test(s) ? "likely" : /not icp/i.test(s) ? "conflict" : "unv");

// Bell in the top bar: notifications from the scheduled engine runs (6am daily). Unread = newer than the last time you opened it.
export default function EngineBell() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [seen, setSeen] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try { setSeen(localStorage.getItem("engine-seen") || ""); } catch {}
    // Check now, every minute, and whenever the tab regains focus, so a run that finishes while the page is open still shows the red badge.
    const load = () => fetch("/api/engine?only=log", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => j && setEntries(j.entries || [])).catch(() => {});
    load();
    const t = setInterval(load, 60000);
    const onFocus = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    // mousedown (not click) — a resize-corner drag reliably starts with mousedown on the element itself, so this
    // doesn't misfire the way "click" can once a native CSS resize drag changes what ends up under the cursor.
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onFocus); window.removeEventListener("focus", onFocus); document.removeEventListener("mousedown", close); };
  }, []);
  const unread = entries.filter((e) => e.at > seen).length;
  const toggle = () => {
    setOpen((o) => !o);
    if (!open && entries[0]) { try { localStorage.setItem("engine-seen", entries[0].at); } catch {} setTimeout(() => setSeen(entries[0].at), 1500); }
  };
  return (
    <div className="bell" ref={ref}>
      <button type="button" className="bell-btn notif-btn" onClick={toggle} aria-label={`Engine notifications${unread ? `, ${unread} new` : ""}`} title="Scheduled engine runs">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.2a4 4 0 0 0-4 4v2.3L2.8 11h10.4L12 8.5V6.2a4 4 0 0 0-4-4ZM6.5 13a1.5 1.5 0 0 0 3 0" fill="none" stroke="var(--teal)" strokeWidth="1.4" strokeLinejoin="round" /></svg>
        {unread > 0 && <span className="bell-dot">{unread}</span>}
      </button>
      {open && (
        <div className="bell-pop" role="dialog" aria-label="Engine notifications">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <b>Scheduled runs</b>
            <button type="button" className="btn tiny" onClick={() => setOpen(false)}>Close</button>
          </div>
          <p className="bell-resize-hint">Drag the bottom-right corner to expand ↘</p>
          {entries.length === 0 ? <p className="note">No runs yet. The engine runs every day at <DailyRunLocalTime /> and posts a summary here.</p>
            : entries.slice(0, 8).map((e) => (
              <div key={e.at} className={`bell-item${e.at > seen ? " new" : ""}`}>
                <small>{fmtDateTime(e.at)}</small>
                {e.details && e.details.length > 0 ? (<>
                  <table className="bell-table"><thead><tr><th>Company</th><th>Status</th><th>Revenue</th><th></th></tr></thead>
                    <tbody>{e.details.slice(0, 12).map((d, i) => <tr key={i}><td>{d.name}</td><td><span className={`tag ${statusTag(d.status)}`}>{d.status}</span></td><td className="muted">{d.revenue || "—"}</td>
                      <td>{/^held/i.test(d.status) && <a className="job-link" href="/settings#engine-pending" onClick={() => setOpen(false)}>Activate →</a>}</td></tr>)}</tbody></table>
                  <p className="note bell-note">{e.summary}</p></>
                ) : (<>
                  <p>{e.summary}</p>
                  {e.new_companies.length > 0 && <p className="note">New companies: {e.new_companies.slice(0, 8).join(", ")}{e.new_companies.length > 8 ? ` +${e.new_companies.length - 8} more` : ""}</p>}
                </>)}
              </div>))}
          <Link href="/settings#engine" className="btn tiny" onClick={() => setOpen(false)}>Open engine settings</Link>
        </div>)}
    </div>
  );
}
