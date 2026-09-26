"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Entry = { at: string; summary: string; verified: number; new_companies: string[] };

// Bell in the top bar: notifications from the scheduled engine runs (6am daily). Unread = newer than the last time you opened it.
export default function EngineBell() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [seen, setSeen] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try { setSeen(localStorage.getItem("engine-seen") || ""); } catch {}
    fetch("/api/engine?only=log").then((r) => (r.ok ? r.json() : { entries: [] })).then((j) => setEntries(j.entries || [])).catch(() => {});
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);
  const unread = entries.filter((e) => e.at > seen).length;
  const toggle = () => {
    setOpen((o) => !o);
    if (!open && entries[0]) { try { localStorage.setItem("engine-seen", entries[0].at); } catch {} setTimeout(() => setSeen(entries[0].at), 1500); }
  };
  return (
    <div className="bell" ref={ref}>
      <button type="button" className="bell-btn" onClick={toggle} aria-label={`Engine notifications${unread ? `, ${unread} new` : ""}`} title="Scheduled engine runs">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.2a4 4 0 0 0-4 4v2.3L2.8 11h10.4L12 8.5V6.2a4 4 0 0 0-4-4ZM6.5 13a1.5 1.5 0 0 0 3 0" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>
        {unread > 0 && <span className="bell-dot">{unread}</span>}
      </button>
      {open && (
        <div className="bell-pop" role="dialog" aria-label="Engine notifications">
          <b>Scheduled runs</b>
          {entries.length === 0 ? <p className="note">No runs yet. The engine runs every day at 6am (Dubai) and posts a summary here.</p>
            : entries.slice(0, 8).map((e) => (
              <div key={e.at} className={`bell-item${e.at > seen ? " new" : ""}`}>
                <small>{new Date(e.at).toLocaleString()}</small>
                <p>{e.summary}</p>
                {e.new_companies.length > 0 && <p className="note">New companies: {e.new_companies.slice(0, 8).join(", ")}{e.new_companies.length > 8 ? ` +${e.new_companies.length - 8} more` : ""}</p>}
              </div>))}
          <Link href="/settings#engine" className="btn tiny" onClick={() => setOpen(false)}>Open engine settings</Link>
        </div>)}
    </div>
  );
}
