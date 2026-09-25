"use client";
import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

type Me = { email: string; name: string; joined_from: string; joined_at: string; last_sign_in: string };

export default function ProfileMenu() {
  const [me, setMe] = useState<Me | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saved, setSaved] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { fetch("/api/me").then((r) => (r.ok ? r.json() : null)).then((j) => { if (j) { setMe(j); setName(j.name); } }).catch(() => {}); }, []);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const initials = (me?.name || me?.email || "?").split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
  async function saveName() {
    const r = await fetch("/api/me", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    setSaved(r.ok ? "Saved" : "Could not save"); if (r.ok && me) setMe({ ...me, name });
  }
  async function logout() { await supabaseBrowser().auth.signOut(); window.location.href = "/login"; }
  return (
    <div className="profile" ref={ref}>
      <button type="button" className="avatar" aria-label="Your profile" aria-expanded={open} onClick={() => setOpen(!open)}>{initials}</button>
      {open && (
        <div className="profile-menu" role="dialog" aria-label="Profile">
          <div className="pm-head"><span className="avatar lg">{initials}</span><div><b>{me?.name || "Add your name"}</b><div className="note">{me?.email}</div></div></div>
          <label htmlFor="pm-name">Name</label>
          <div className="pm-row"><input id="pm-name" type="text" className="input-frame" value={name} onChange={(e) => { setName(e.target.value); setSaved(""); }} placeholder="Your full name" />
            <button type="button" className="btn" onClick={saveName}>Save</button></div>
          {saved && <p className="note">{saved}</p>}
          <dl className="pm-facts">
            <dt>Email</dt><dd>{me?.email}</dd>
            <dt>Joined from</dt><dd>{me?.joined_from}</dd>
            <dt>Joined</dt><dd>{me?.joined_at ? new Date(me.joined_at).toLocaleDateString() : ""}</dd>
            <dt>Last sign-in</dt><dd>{me?.last_sign_in ? new Date(me.last_sign_in).toLocaleString() : ""}</dd>
          </dl>
          <a className="btn" href="/settings#team">Invite a colleague</a>
          <button type="button" className="btn logout" onClick={logout}>Log out</button>
        </div>
      )}
    </div>
  );
}
