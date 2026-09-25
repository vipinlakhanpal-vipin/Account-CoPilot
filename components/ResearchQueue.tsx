"use client";
import CostNote from "@/components/CostNote";
import { useEffect, useState } from "react";

type Run = { id: string; query: string; depth: string; status: string; error?: string; stats?: Record<string, unknown>; started_at: string; finished_at?: string; requested_by?: string };
const ROLES = ["Procurement", "Finance", "IT", "Transformation", "Supply Chain"];
const COUNTRIES = ["UAE", "Saudi Arabia", "Qatar", "Kuwait", "Oman", "Egypt"];

export default function ResearchQueue() {
  const [company, setCompany] = useState("");
  const [country, setCountry] = useState("UAE");
  const [depth, setDepth] = useState("standard");
  const [roles, setRoles] = useState<string[]>(ROLES);
  const [msg, setMsg] = useState("");
  const [runs, setRuns] = useState<Run[]>([]);

  async function load() {
    const r = await fetch("/api/runs");
    if (r.ok) setRuns((await r.json()).runs || []);
  }
  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg("Starting research…");
    const r = await fetch("/api/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company, country, depth, roles }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok) { setMsg(`Research started for ${company}. It usually takes 2–5 minutes; the status below updates automatically.`); setCompany(""); load(); }
    else setMsg(j.error || "Could not start research.");
  }

  return (
    <section className="view">
      <div className="panel">
        <h2>New research</h2>
        <p className="note">Claude searches the public web (company sites, annual reports, press, job posts, LinkedIn snippets), extracts contacts and S2P signals with evidence, and adds them without overwriting existing data.</p>
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 10 }}>
          <div className="form-grid">
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label htmlFor="company">Company</label>
              <input id="company" type="text" className="input-frame" required value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Americana Restaurants" />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label htmlFor="country">Country</label>
              <select id="country" className="input-frame" value={country} onChange={(e) => setCountry(e.target.value)}>{COUNTRIES.map((c) => <option key={c}>{c}</option>)}</select>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label htmlFor="depth">Research depth</label>
              <select id="depth" className="input-frame" value={depth} onChange={(e) => setDepth(e.target.value)}>
                <option value="quick">Quick (3–5 sources)</option><option value="standard">Standard (5–10 sources)</option><option value="deep">Deep (10+ sources)</option>
              </select>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label>Contact roles</label>
            <div className="roles">{ROLES.map((r) => (
              <label key={r}><input type="checkbox" checked={roles.includes(r)} onChange={(e) => setRoles(e.target.checked ? [...roles, r] : roles.filter((x) => x !== r))} /> {r}</label>))}
            </div>
          </div>
          <div className="cost-wrap"><button className="btn primary">Start research</button><CostNote cost="Quick ≈ $0.55 · Standard ≈ $1.20–1.50 · Deep ≈ $2.50–3.50" /></div>
          {msg && <p className="note">{msg}</p>}
        </form>
      </div>
      <div className="panel" style={{ marginTop: 16 }}>
        <h2>Research runs</h2>
        <div className="tablewrap"><table>
          <thead><tr><th className="num">#</th><th>Started</th><th>Company</th><th>Depth</th><th>Status</th><th>Result</th><th>By</th></tr></thead>
          <tbody>{runs.map((r, i) => (
            <tr key={r.id}>
              <td className="num mono">{i + 1}</td>
              <td className="mono">{new Date(r.started_at).toLocaleString()}</td><td><b>{r.query}</b></td><td>{r.depth}</td>
              <td><span className={`status ${r.status}`}>{r.status}</span></td>
              <td className="wrap">{r.status === "error" ? r.error : r.stats ? `${r.stats.company} · ${r.stats.newContacts} new contacts · ${r.stats.updatedContacts} updated · ${r.stats.signals} signals · ${r.stats.conflicts} conflicts` : ""}</td>
              <td className="muted">{r.requested_by}</td>
            </tr>))}
            {!runs.length && <tr><td colSpan={7} className="muted">No research runs yet.</td></tr>}
          </tbody></table></div>
      </div>
    </section>
  );
}
