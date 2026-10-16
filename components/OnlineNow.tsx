"use client";
import { useEffect, useRef, useState } from "react";

type Who = { email: string; name: string; page: string; seconds: number };
// Super Admins only: a green dot and a count of people active in the last two minutes, with who and where.
export default function OnlineNow() {
  const [active, setActive] = useState<Who[] | null>(null);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let off = false;
    const load = () => fetch("/api/activity?view=active", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (!off) setActive(j?.ready ? j.active : null); }).catch(() => {});
    load(); const t = setInterval(load, 30000);
    return () => { off = true; clearInterval(t); };
  }, []);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);
  if (!active) return null;
  const ago = (s: number) => (s < 60 ? "just now" : `${Math.round(s / 60)} min ago`);
  return (
    <span className="online-wrap" ref={box}>
      <button type="button" className="online-chip" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={`${active.length} people online`}>
        <i className="online-dot" aria-hidden="true" />{active.length} online
      </button>
      {open && (
        <div className="online-pop" role="dialog" aria-label="People online now">
          <b>Online now</b>
          {active.length === 0 ? <p className="note">No one is active right now.</p> : active.map((a) => (
            <div key={a.email} className="online-row"><i className="online-dot" aria-hidden="true" /><span><b>{a.name || a.email.split("@")[0]}</b><small>{a.email}</small></span><em>{a.page}<small>{ago(a.seconds)}</small></em></div>))}
          <p className="note">Active in the last 2 minutes. Only Super Admins see this.</p>
        </div>)}
    </span>
  );
}
