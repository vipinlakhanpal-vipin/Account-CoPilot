"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import DailyRunLocalTime from "@/components/DailyRunLocalTime";
import { fmtDateTime } from "@/lib/dates";

type Detail = { name: string; status: string; revenue?: string };
type Entry = { at: string; summary: string; verified: number; new_companies: string[]; details?: Detail[]; region?: string };
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
            : (() => {
              // Every active region logs its own entry for the same run (same day, often the same minute). Group
              // them by day so all regions that ran together show as one Region | Company | New | Verified |
              // Status | Revenue table, instead of a separate table per region repeating the same columns.
              const shown = entries.slice(0, 8);
              const days = new Map<string, Entry[]>();
              for (const e of shown) { const d = new Date(e.at).toDateString(); (days.get(d) || days.set(d, []).get(d)!).push(e); }
              return [...days.entries()].map(([day, group]) => {
                const anyNew = group.some((e) => e.at > seen);
                const rows = group.flatMap((e) => {
                  const region = e.region || e.summary.match(/^([^—]+)—/)?.[1]?.trim() || "—";
                  const newSet = new Set(e.new_companies);
                  return (e.details || []).map((d) => ({ region, ...d, isNew: newSet.has(d.name), isVerified: !/unknown/i.test(d.status) }));
                });
                return (
                  <div key={day} className={`bell-item${anyNew ? " new" : ""}`}>
                    <small>{fmtDateTime(group[0].at)}</small>
                    {rows.length > 0 ? (
                      <table className="bell-table"><thead><tr><th>Region</th><th>Company</th><th>New</th><th>Verified</th><th>Status</th><th>Revenue</th><th></th></tr></thead>
                        <tbody>{rows.slice(0, 24).map((d, i) => (
                          <tr key={i}><td className="muted">{d.region}</td><td>{d.name}</td><td>{d.isNew ? "✓" : ""}</td><td>{d.isVerified ? "✓" : ""}</td>
                            <td><span className={`tag ${statusTag(d.status)}`}>{d.status}</span></td><td className="muted">{d.revenue || "—"}</td>
                            <td>{/^held/i.test(d.status) && <a className="job-link" href="/settings#engine-pending" onClick={() => setOpen(false)}>Activate →</a>}</td></tr>
                        ))}</tbody></table>
                    ) : null}
                    {group.map((e) => <p key={e.at + (e.region || "")} className="note bell-note">{e.summary}</p>)}
                  </div>
                );
              });
            })()}
          <Link href="/settings#engine" className="btn tiny" onClick={() => setOpen(false)}>Open engine settings</Link>
        </div>)}
    </div>
  );
}
