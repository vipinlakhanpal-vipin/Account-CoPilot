"use client";
import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import SecretInput from "@/components/SecretInput";

type Me = { email: string; name: string; joined_from: string; joined_at: string; last_sign_in: string };

export default function ProfileMenu() {
  const [me, setMe] = useState<Me | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saved, setSaved] = useState("");
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
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
  async function changePassword() {
    if (pw1.length < 8) { setPwMsg("Use at least 8 characters."); return; }
    if (pw1 !== pw2) { setPwMsg("Passwords don't match."); return; }
    setPwBusy(true); setPwMsg("");
    const { error } = await supabaseBrowser().auth.updateUser({ password: pw1 });
    setPwBusy(false);
    setPwMsg(error ? error.message : "Password changed.");
    if (!error) { setPw1(""); setPw2(""); }
  }
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
            <dt>Joined</dt><dd>{me?.joined_at ? fmtDate(me.joined_at) : ""}</dd>
            <dt>Last sign-in</dt><dd>{me?.last_sign_in ? fmtDateTime(me.last_sign_in) : ""}</dd>
          </dl>
          <label htmlFor="pm-pw1">Change password</label>
          <div className="pm-row"><SecretInput id="pm-pw1" value={pw1} onChange={(v) => { setPw1(v); setPwMsg(""); }} placeholder="New password" autoComplete="new-password" /></div>
          <div className="pm-row"><SecretInput value={pw2} onChange={(v) => { setPw2(v); setPwMsg(""); }} placeholder="Confirm new password" autoComplete="new-password" />
            <button type="button" className="btn" disabled={pwBusy || !pw1 || !pw2} onClick={changePassword}>{pwBusy ? "Saving…" : "Save"}</button></div>
          {pwMsg && <p className="note">{pwMsg}</p>}
          <a className="btn" href="/settings#team">Invite a colleague</a>
          <button type="button" className="btn logout" onClick={logout}>Log out</button>
        </div>
      )}
    </div>
  );
}
