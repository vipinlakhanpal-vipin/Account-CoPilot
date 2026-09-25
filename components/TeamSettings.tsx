"use client";
import { useEffect, useState } from "react";

type U = { email: string; name: string; invited_by: string; joined_from: string; created_at: string; last_sign_in: string | null };

export default function TeamSettings() {
  const [users, setUsers] = useState<U[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"password" | "email">("password");
  const [msg, setMsg] = useState("");
  const [temp, setTemp] = useState("");
  const load = () => fetch("/api/team").then((r) => (r.ok ? r.json() : { users: [] })).then((j) => setUsers(j.users || []));
  useEffect(() => { load(); }, []);
  async function invite(e: React.FormEvent) {
    e.preventDefault(); setMsg("Working…"); setTemp("");
    const r = await fetch("/api/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, name, mode }) });
    const j = await r.json();
    setMsg(j.message || j.error || ""); if (j.tempPassword) setTemp(j.tempPassword);
    if (r.ok) { setEmail(""); setName(""); load(); }
  }
  return (
    <div className="panel" id="team" style={{ marginTop: 16 }}>
      <h2 className="with-count">Team <span className="count">{users.length} users</span></h2>
      <p className="note">Invite colleagues from an allowed email domain. <b>Temporary password</b> creates the account immediately: share the password with them privately, and they can change it later. <b>Email invitation</b> uses Supabase's built-in mailer, which company mail filters sometimes block.</p>
      <form onSubmit={invite} className="form-grid" style={{ marginTop: 10 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}><label htmlFor="inv-email">Work email</label>
          <input id="inv-email" type="email" required className="input-frame" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="colleague@scp-worldwide.com" /></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}><label htmlFor="inv-name">Name</label>
          <input id="inv-name" type="text" className="input-frame" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" /></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}><label htmlFor="inv-mode">How</label>
          <select id="inv-mode" className="input-frame" value={mode} onChange={(e) => setMode(e.target.value as "password" | "email")}>
            <option value="password">Temporary password</option><option value="email">Email invitation</option></select></div>
        <div><button className="btn primary">Invite</button></div>
      </form>
      {msg && <p className="note" style={{ marginTop: 8 }}>{msg}</p>}
      {temp && <p className="temp-pass">Temporary password: <code>{temp}</code>. Copy it now and share it privately; it will not be shown again.</p>}
      <div className="tablewrap" style={{ marginTop: 12 }}><table>
        <thead><tr><th className="num">#</th><th>Name</th><th>Email</th><th>Joined from</th><th>Invited by</th><th>Joined</th><th>Last sign-in</th></tr></thead>
        <tbody>{users.map((u, i) => (
          <tr key={u.email}><td className="num mono">{i + 1}</td><td><b>{u.name || "—"}</b></td><td className="mono">{u.email}</td><td>{u.joined_from || "—"}</td>
            <td className="muted">{u.invited_by || "—"}</td><td className="mono">{new Date(u.created_at).toLocaleDateString()}</td>
            <td className="mono">{u.last_sign_in ? new Date(u.last_sign_in).toLocaleDateString() : "Not yet"}</td></tr>))}
        </tbody></table></div>
    </div>
  );
}
