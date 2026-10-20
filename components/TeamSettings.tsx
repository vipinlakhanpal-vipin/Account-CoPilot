"use client";
import { useEffect, useState } from "react";
import { REGIONS } from "@/lib/icpDefinition.mjs";
import { fmtDateTime } from "@/lib/dates";
import { ask, notify } from "@/components/Confirm";

type DraftEmail = { subject: string; body: string };

type Role = "super_admin" | "admin" | "standard";
type U = { id: string; email: string; name: string; invited_by: string; joined_from: string; created_at: string; last_sign_in: string | null; role: Role; regions: string[]; suspended_at?: string | null; kept_at?: string | null };
const ROLE: Record<Role, string> = { super_admin: "Super Admin", admin: "Admin", standard: "Standard User" };
const ROLE_HELP: Record<Role, string> = {
  super_admin: "The owner. Sees every region, manages the team, the engine and every ICP, and is the only one who can download (Master Book, PDF and Excel).",
  admin: "Everything a Super Admin can do except download: no Master Book, PDF or Excel. Sees all data on screen. Cannot open the Team tab.",
  standard: "Sees only their region(s)' accounts, contacts and Master Book, and controls only those regions' ICP. One person can be given several regions.",
};

function AccessPicker({ role, regions, onChange, isOwner }: { role: Role; regions: string[]; onChange: (role: Role, regions: string[]) => void; isOwner: boolean }) {
  return (
    <div className="team-access">
      <label className="f-role">Role
        <select className="input-frame" value={role} onChange={(e) => onChange(e.target.value as Role, regions)}>
          <option value="standard">Standard User</option>{isOwner && <option value="admin">Admin</option>}{isOwner && <option value="super_admin">Super Admin</option>}
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

export default function TeamSettings({ isOwner = false }: { isOwner?: boolean }) {
  const [users, setUsers] = useState<U[]>([]);
  // % used: of the places and features a person can use, the share they opened in the last 30 days (see lib/activity.ts USAGE_AREAS).
  const [usage, setUsage] = useState<Record<string, { pct: number; used: string[]; missing: string[]; total: number }>>({});
  useEffect(() => { fetch("/api/activity?view=usage", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j?.ready) setUsage(j.usage || {}); }).catch(() => {}); }, []);
  const [ready, setReady] = useState(true);
  const [denied, setDenied] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"password" | "email">("password");
  const [role, setRole] = useState<Role>("standard");
  const [regions, setRegions] = useState<string[]>([]);
  const [msg, setMsg] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null); // id of the user being deleted
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
    setMsg(`Deletion in progress for ${u.email}…`); setTemp(""); setDraft(null); setDeleting(u.id);
    try {
      const r = await fetch("/api/team", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: u.id }) });
      const j = await r.json().catch(() => ({}));
      setMsg(j.message || j.error || (r.ok ? `${u.email} was deleted.` : "Could not delete that user."));
      if (r.ok) { notify(`${u.email} was deleted.`, "ok"); load(); } else notify(j.error || "Could not delete that user.", "error");
    } catch { setMsg("Could not reach the server. Nothing was deleted."); notify("Could not reach the server. Nothing was deleted.", "error"); }
    finally { setDeleting(null); }
  }
  async function saveAccess(u: U) {
    const x = edit[u.id]; if (!x) return;
    const r = await fetch("/api/team", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: u.id, ...x }) });
    const j = await r.json();
    setMsg(r.ok ? `Access updated for ${u.email}: ${x.role === "super_admin" ? "Super Admin (all regions)" : x.role === "admin" ? "Admin (all regions, no downloads)" : `Standard User for ${x.regions.join(", ")}`}.` : j.error || "Could not update.");
    if (r.ok) { setEdit((m) => { const n = { ...m }; delete n[u.id]; return n; }); load(); }
  }
  if (denied) return (
    <div className="panel" id="team" style={{ marginTop: 16 }}><h2>Team</h2><p className="note">Your Super Admin manages the team, roles and regions.</p></div>);
  return (
    <div className="panel" id="team" style={{ marginTop: 16 }}>
      <h2 className="with-count">Team <span className="count">{users.length} {users.length === 1 ? "user" : "users"}</span></h2>
      <div className="team-roles">
        <div><b>Super Admin</b><span>{ROLE_HELP.super_admin}</span></div>
        <div><b>Admin</b><span>{ROLE_HELP.admin}</span></div>
        <div><b>Standard User</b><span>{ROLE_HELP.standard} The whole app — dashboard, accounts, pipeline, research, the daily engine and exports — works only on that region, by that region&apos;s ICP.</span></div>
      </div>
      {!ready && <p className="team-warn">Roles and regions are saved, but they take effect only after the one-time region-access database update has been run in Supabase (see the release notes). Until then everyone sees every region.</p>}
      <p className="note">Invite colleagues from an allowed email domain and choose what they can see. Both options create the account immediately with a one-time password — <b>Temporary password</b> just shows it to copy; <b>Email invitation</b> also drafts a ready-to-send email with it built in (until Resend is connected, nothing is sent automatically — copy the draft into your own mail client).</p>
      <form onSubmit={invite} className="form-grid team-form" style={{ marginTop: 10 }}>
        <div className="f-email" style={{ display: "flex", flexDirection: "column", gap: 6 }}><label htmlFor="inv-email">Work email</label>
          <input id="inv-email" type="email" required className="input-frame" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="colleague@scp-worldwide.com" /></div>
        <div className="f-name" style={{ display: "flex", flexDirection: "column", gap: 6 }}><label htmlFor="inv-name">Name</label>
          <input id="inv-name" type="text" className="input-frame" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" /></div>
        <AccessPicker isOwner={isOwner} role={role} regions={regions} onChange={(r, g) => { setRole(r); setRegions(g); }} />
        <div className="f-how" style={{ display: "flex", flexDirection: "column", gap: 6 }}><label htmlFor="inv-mode">How</label>
          <select id="inv-mode" className="input-frame" value={mode} onChange={(e) => setMode(e.target.value as "password" | "email")}>
            <option value="password">Temporary password</option><option value="email">Email invitation</option></select></div>
        <div><button className="btn primary">Invite</button></div>
      </form>
      {msg && <p className={`note${deleting ? " team-deleting-note" : ""}`} style={{ marginTop: 8 }} role="status" aria-live="polite">{deleting ? "⏳ " : ""}{msg}</p>}
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
        <thead><tr><th className="num">#</th><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Region(s)</th><th>Change access</th><th>Invited by</th><th>Joined</th><th>Last sign-in</th><th title="Share of the places and features this person opened in the last 30 days. Hover a value to see what they have and have not used.">% used</th><th>Reset password</th><th>Delete</th></tr></thead>
        <tbody>{users.map((u, i) => {
          const x = edit[u.id];
          return (
            <tr key={u.id} className={deleting === u.id ? "team-deleting" : undefined} aria-busy={deleting === u.id}><td className="num mono">{i + 1}</td><td><b>{u.name || "—"}</b></td><td className="mono">{u.email}</td>
              <td><span className={`role-tag ${u.role}`}>{ROLE[u.role]}</span></td>
              <td>{u.suspended_at ? <span className="team-status susp" title="No activity for 15 days. They cannot sign in. Decide in Inactive users above.">Suspended {new Date(u.suspended_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</span>
                : u.kept_at && Date.now() - new Date(u.kept_at).getTime() < 15 * 864e5 ? <span className="team-status kept" title="You chose Keep; their 15 days restarted on this date.">Kept {new Date(u.kept_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</span>
                : <span className="team-status ok">Active</span>}</td>
              <td>{u.role !== "standard" ? "All regions" : u.regions.join(", ") || "Not set"}</td>
              <td>{x ? <div className="team-edit"><AccessPicker isOwner={isOwner} role={x.role} regions={x.regions} onChange={(r, g) => setEdit((m) => ({ ...m, [u.id]: { role: r, regions: g } }))} />
                  <div className="team-edit-actions">
                    <button type="button" className="btn tiny primary" onClick={() => saveAccess(u)}>Save</button>
                    <button type="button" className="btn tiny" onClick={() => setEdit((m) => { const n = { ...m }; delete n[u.id]; return n; })}>Cancel</button>
                  </div></div>
                : (isOwner || u.role === "standard") ? <button type="button" className="btn-change" disabled={!!deleting} onClick={() => setEdit((m) => ({ ...m, [u.id]: { role: u.role, regions: u.regions } }))}>Change</button> : <span className="muted">Super Admin only</span>}</td>
              <td className="muted">{u.invited_by || "—"}</td><td className="mono team-dt">{fmtDateTime(u.created_at)}</td>
              <td className="mono team-dt">{u.last_sign_in ? fmtDateTime(u.last_sign_in) : "Not yet"}</td>
              <td>{(() => { const g = usage[u.email]; return g ? (
                <div className="used-cell" title={`Used ${g.used.length} of ${g.total} places and features in the last 30 days.\n\nUsed: ${g.used.join(", ") || "none yet"}\n\nNot yet used: ${g.missing.join(", ") || "nothing"}`}>
                  <b>{g.pct}%</b><span className="used-bar" aria-hidden="true"><i style={{ width: `${g.pct}%` }} /></span></div>) : <span className="muted">—</span>; })()}</td>
              <td className="team-row-actions">
                {!u.last_sign_in && <button type="button" className="btn tiny" disabled={!!deleting} onClick={() => resetPassword(u)} title="They haven't signed in yet — set a fresh one-time password to share with them">Reset password</button>}
              </td>
              <td className="team-row-actions">
                {deleting === u.id ? <span className="team-del-flash" role="status">⏳ Deletion in progress…</span>
                  : u.email.toLowerCase() !== myEmail.toLowerCase() && <button type="button" className="btn tiny danger" disabled={!!deleting} onClick={() => deleteUser(u)}>Delete</button>}
              </td></tr>);
        })}</tbody></table></div>
    </div>
  );
}
