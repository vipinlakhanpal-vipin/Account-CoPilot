"use client";
import { useEffect, useState } from "react";
import { REGIONS } from "@/lib/icpDefinition.mjs";
import { fmtDate } from "@/lib/dates";
import { ask, notify } from "@/components/Confirm";

type DraftEmail = { subject: string; body: string };

type Role = "super_admin" | "standard";
type U = { id: string; email: string; name: string; invited_by: string; joined_from: string; created_at: string; last_sign_in: string | null; role: Role; regions: string[] };
const ROLE: Record<Role, string> = { super_admin: "Super Admin", standard: "Standard User" };
const ROLE_HELP: Record<Role, string> = {
  super_admin: "Sees every region with a consolidated view, manages the team, the engine and every region's ICP.",
  standard: "Sees only their region(s)' accounts, contacts and Master Book, and controls only those regions' ICP. One person can be given several regions.",
};

function AccessPicker({ role, regions, onChange }: { role: Role; regions: string[]; onChange: (role: Role, regions: string[]) => void }) {
  return (
    <div className="team-access">
      <label className="f-role">Role
        <select className="input-frame" value={role} onChange={(e) => onChange(e.target.value as Role, regions)}>
          <option value="standard">Standard User</option><option value="super_admin">Super Admin</option>
        </select></label>
      {role === "standard" ? (
        // Several regions can be ticked: one colleague may cover more than one market. (Only Super Admins can open this page.)
        <div className="f-region"><span className="lbl">Region(s)</span>
          <details className="region-multi">
            <summary className="input-frame">{regions.length ? regions.join(", ") : "Choose region(s)…"}</summary>
            <div className="region-menu">
              {REGIONS.map((r) => (
                <label key={r.key}><input type="checkbox" checked={regions.includes(r.key)}
                  onChange={(e) => onChange(role, e.target.checked ? [...regions, r.key] : regions.filter((x) => x !== r.key))} />{r.name}</label>
              ))}
            </div>
          </details>
        </div>
      ) : <label className="f-region">Region<span className="input-frame team-all">All regions</span></label>}
    </div>
  );
}

export default function TeamSettings() {
  const [users, setUsers] = useState<U[]>([]);
  const [ready, setReady] = useState(true);
  const [denied, setDenied] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"password" | "email">("password");
  const [role, setRole] = useState<Role>("standard");
  const [regions, setRegions] = useState<string[]>([]);
  const [msg, setMsg] = useState("");
  const [temp, setTemp] = useState("");
  const [draft, setDraft] = useState<DraftEmail | null>(null);
  const [myEmail, setMyEmail] = useState("");
  const [edit, setEdit] = useState<Record<string, { role: Role; regions: string[] }>>({});
  const load = () => fetch("/api/team").then(async (r) => {
    if (r.status === 403) { setDenied(true); return; }
    const j = r.ok ? await r.json() : { users: [] }; setUsers(j.users || []); setReady(j.ready !== false);
  });
  useEffect(() => {
    load();
    fetch("/api/me").then((r) => (r.ok ? r.json() : null)).then((j) => j?.email && setMyEmail(j.email)).catch(() => {});
  }, []);
  function copyDraft() {
    if (!draft) return;
    navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`).then(
      () => notify("Copied — paste it into an email and send.", "ok"),
      () => notify("Could not copy. Select the text and copy it manually.", "error"));
  }
  function copyPassword() {
    if (!temp) return;
    navigator.clipboard.writeText(temp).then(
      () => notify("Password copied.", "ok"),
      () => notify("Could not copy. Select it and copy manually.", "error"));
  }
  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (role === "standard" && !regions.length) { setMsg("Choose at least one region for this Standard User."); return; }
    setMsg("Working…"); setTemp(""); setDraft(null);
    const r = await fetch("/api/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, name, mode, role, regions }) });
    const j = await r.json();
    setMsg(j.message || j.error || ""); if (j.tempPassword) setTemp(j.tempPassword); if (j.draftEmail) setDraft(j.draftEmail);
    if (r.ok) { setEmail(""); setName(""); setRegions([]); load(); }
  }
  async function resetPassword(u: U) {
    if (!(await ask({ title: "Set a new temporary password?", body: u.email,
      points: ["Their old password (if they never got it, or it was lost) stops working.", "You'll see the new one-time password — and a ready email to send — here afterward."],
      confirm: "Set new password", tone: "primary" }))) return;
    setMsg("Working…"); setTemp(""); setDraft(null);
    const r = await fetch("/api/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reset_password", id: u.id }) });
    const j = await r.json();
    setMsg(j.message || j.error || ""); if (j.tempPassword) setTemp(j.tempPassword); if (j.draftEmail) setDraft(j.draftEmail);
  }
  async function deleteUser(u: U) {
    if (!(await ask({ title: "Delete this user completely?", body: u.email,
      points: ["Removes their Supabase Auth account and their role/region record — permanent, cannot be undone.",
        "They lose access immediately. You can invite them again from scratch afterward."],
      confirm: "Delete permanently", tone: "danger" }))) return;
    setMsg("Working…"); setTemp(""); setDraft(null);
    const r = await fetch("/api/team", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: u.id }) });
    const j = await r.json();
    setMsg(j.message || j.error || "");
    if (r.ok) load();
  }
  async function saveAccess(u: U) {
    const x = edit[u.id]; if (!x) return;
    const r = await fetch("/api/team", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: u.id, ...x }) });
    const j = await r.json();
    setMsg(r.ok ? `Access updated for ${u.email}: ${x.role === "super_admin" ? "Super Admin (all regions)" : `Standard User for ${x.regions.join(", ")}`}.` : j.error || "Could not update.");
    if (r.ok) { setEdit((m) => { const n = { ...m }; delete n[u.id]; return n; }); load(); }
  }
  if (denied) return (
    <div className="panel" id="team" style={{ marginTop: 16 }}><h2>Team</h2><p className="note">Your Super Admin manages the team, roles and regions.</p></div>);
  return (
    <div className="panel" id="team" style={{ marginTop: 16 }}>
      <h2 className="with-count">Team <span className="count">{users.length} {users.length === 1 ? "user" : "users"}</span></h2>
      <div className="team-roles">
        <div><b>Super Admin</b><span>{ROLE_HELP.super_admin}</span></div>
        <div><b>Standard User</b><span>{ROLE_HELP.standard} The whole app — dashboard, accounts, pipeline, research, the daily engine and exports — works only on that region, by that region&apos;s ICP.</span></div>
      </div>
      {!ready && <p className="team-warn">Roles and regions are saved, but they take effect only after the one-time region-access database update has been run in Supabase (see the release notes). Until then everyone sees every region.</p>}
      <p className="note">Invite colleagues from an allowed email domain and choose what they can see. Both options create the account immediately with a one-time password — <b>Temporary password</b> just shows it to copy; <b>Email invitation</b> also drafts a ready-to-send email with it built in (until Resend is connected, nothing is sent automatically — copy the draft into your own mail client).</p>
      <form onSubmit={invite} className="form-grid team-form" style={{ marginTop: 10 }}>
        <div className="f-email" style={{ display: "flex", flexDirection: "column", gap: 6 }}><label htmlFor="inv-email">Work email</label>
          <input id="inv-email" type="email" required className="input-frame" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="colleague@scp-worldwide.com" /></div>
        <div className="f-name" style={{ display: "flex", flexDirection: "column", gap: 6 }}><label htmlFor="inv-name">Name</label>
          <input id="inv-name" type="text" className="input-frame" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" /></div>
        <AccessPicker role={role} regions={regions} onChange={(r, g) => { setRole(r); setRegions(g); }} />
        <div className="f-how" style={{ display: "flex", flexDirection: "column", gap: 6 }}><label htmlFor="inv-mode">How</label>
          <select id="inv-mode" className="input-frame" value={mode} onChange={(e) => setMode(e.target.value as "password" | "email")}>
            <option value="password">Temporary password</option><option value="email">Email invitation</option></select></div>
        <div><button className="btn primary">Invite</button></div>
      </form>
      {msg && <p className="note" style={{ marginTop: 8 }}>{msg}</p>}
      {temp && (
        <div className="wn-backdrop" onClick={() => { setTemp(""); setDraft(null); }}>
          <div className="wn ask ask-primary" role="dialog" aria-modal="true" aria-labelledby="temp-title" onClick={(e) => e.stopPropagation()}>
            <div className="wn-head">
              <div><p className="wn-kicker">Copy this now</p><h2 id="temp-title">One-time password</h2></div>
              <button type="button" className="wn-close" onClick={() => { setTemp(""); setDraft(null); }} aria-label="Close">×</button>
            </div>
            <div className="wn-body ask-body">
              <p className="note">It will not be shown again — copy it (or the email below) and share it with them privately.</p>
              <p className="temp-pass"><code>{temp}</code> <button type="button" className="btn tiny" onClick={copyPassword}>Copy password</button></p>
              {draft && (
                <div className="draft-email">
                  <div className="draft-email-head"><b>Ready to send</b><button type="button" className="btn tiny" onClick={copyDraft}>Copy email</button></div>
                  <p className="muted mono">Subject: {draft.subject}</p>
                  <pre>{draft.body}</pre>
                </div>
              )}
            </div>
            <div className="wn-foot"><span /><span className="wn-actions">
              <button type="button" className="btn primary" onClick={() => { setTemp(""); setDraft(null); }}>Done</button></span></div>
          </div>
        </div>
      )}
      <div className="tablewrap" style={{ marginTop: 12 }}><table>
        <thead><tr><th className="num">#</th><th>Name</th><th>Email</th><th>Role</th><th>Region(s)</th><th>Change access</th><th>Invited by</th><th>Joined</th><th>Last sign-in</th><th></th></tr></thead>
        <tbody>{users.map((u, i) => {
          const x = edit[u.id];
          return (
            <tr key={u.id}><td className="num mono">{i + 1}</td><td><b>{u.name || "—"}</b></td><td className="mono">{u.email}</td>
              <td><span className={`role-tag ${u.role}`}>{ROLE[u.role]}</span></td>
              <td>{u.role === "super_admin" ? "All regions" : u.regions.join(", ") || "Not set"}</td>
              <td>{x ? <div className="team-edit"><AccessPicker role={x.role} regions={x.regions} onChange={(r, g) => setEdit((m) => ({ ...m, [u.id]: { role: r, regions: g } }))} />
                  <div className="team-edit-actions">
                    <button type="button" className="btn tiny primary" onClick={() => saveAccess(u)}>Save</button>
                    <button type="button" className="btn tiny" onClick={() => setEdit((m) => { const n = { ...m }; delete n[u.id]; return n; })}>Cancel</button>
                  </div></div>
                : <button type="button" className="btn-change" onClick={() => setEdit((m) => ({ ...m, [u.id]: { role: u.role, regions: u.regions } }))}>Change</button>}</td>
              <td className="muted">{u.invited_by || "—"}</td><td className="mono">{fmtDate(u.created_at)}</td>
              <td className="mono">{u.last_sign_in ? fmtDate(u.last_sign_in) : "Not yet"}</td>
              <td className="team-row-actions">
                {!u.last_sign_in && <button type="button" className="btn tiny" onClick={() => resetPassword(u)} title="They haven't signed in yet — set a fresh one-time password to share with them">Reset password</button>}
                {u.email.toLowerCase() !== myEmail.toLowerCase() && <button type="button" className="btn tiny danger" onClick={() => deleteUser(u)}>Delete</button>}
              </td></tr>);
        })}</tbody></table></div>
    </div>
  );
}
