"use client";
import { useEffect, useState } from "react";
import CostNote from "@/components/CostNote";
import { COUNTRIES } from "@/lib/countries";

type Job = { id: string; region: string; count: number | "max"; mode: string; requested_by: string; requested_at: string; status: string; done_at?: string; result?: string };
type Batch = { id: string; region: string; budget: number; available: number; planned_update: number; planned_new: number; spent: number; runs: number; running: number; at: string; requested_by: string; companies: string[] };
type Summary = { token_info: { created_at?: string; by?: string; hint?: string } | null; token?: string | null; jobs: Job[]; batches: Batch[]; carry: number; spentAll: number; spentMonth: number; balance: { amount?: number; as_of?: string; by?: string };
  balanceLeft: number | null; est: { update: number; discovery: number; profile: number }; log?: { at: string; summary: string; verified: number; new_companies: string[] }[] };

const MODE: Record<string, string> = { verify: "Verify existing companies", discover: "Find new companies", both: "Verify existing + find new" };
const money = (n: number) => `$${n.toFixed(2)}`;

// Settings → Discovery & refresh engine.
export default function EngineSettings() {
  const [s, setS] = useState<Summary | null>(null);
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState({ region: "UAE", count: "50", mode: "verify" });
  const [r, setR] = useState({ region: "UAE", update: 10, fresh: 5, budget: 20 });
  const [bal, setBal] = useState("");
  const [newToken, setNewToken] = useState("");
  const load = () => fetch("/api/engine").then((x) => (x.ok ? x.json() : null)).then((j) => j && setS(j)).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);
  const post = async (body: unknown, ok: string) => {
    const res = await fetch("/api/engine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    if (res.ok) { setS(j); setMsg(ok); if (j.token !== undefined) setNewToken(j.token || ""); } else setMsg(j.error || "Something went wrong.");
  };

  const avail = s ? +(r.budget + s.carry).toFixed(2) : r.budget;
  const est = s?.est || { update: 0.55, discovery: 0.75, profile: 0.55 };
  let left = avail; const pu = Math.min(r.update, Math.floor(left / est.update)); left -= pu * est.update;
  const pn = left >= est.discovery + est.profile ? Math.min(r.fresh, Math.floor((left - est.discovery) / est.profile)) : 0;
  const estCost = +(pu * est.update + (pn ? est.discovery + pn * est.profile : 0)).toFixed(2);

  return (
    <section className="view">
      <div className="panel engine" id="engine">
        <h2>Discovery &amp; refresh engine</h2>
        <p className="note">Two ways to grow and update your accounts. Both follow the same ICP rules (revenue ≥ $250M, 100+ staff; group HQs only; no government bodies, single sites or foreign branches) and the same source ladder for revenue.</p>
        {msg && <p className="eng-msg">{msg}</p>}

        <div className="eng-card free">
          <div className="eng-head"><h3>1 · Search companies — no API cost</h3><span className="tag fact">Included in your Claude plan</span></div>
          <p className="note">Queues a job for the scheduled Claude sessions, which work like the verification sessions you run today (web search, official sources first) and write results straight into the app. Runs on the next scheduled session; counts against your Claude plan's usage, not the Anthropic API key.</p>
          <div className="eng-form">
            <label>Region<select value={q.region} onChange={(e) => setQ({ ...q, region: e.target.value })}>{COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select></label>
            <label>How many<select value={q.count} onChange={(e) => setQ({ ...q, count: e.target.value })}>{["30", "50", "max"].map((n) => <option key={n} value={n}>{n === "max" ? "Max (as many as a session can)" : n}</option>)}</select></label>
            <label>What to do<select value={q.mode} onChange={(e) => setQ({ ...q, mode: e.target.value })}>{Object.entries(MODE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <button type="button" className="btn primary" onClick={() => post({ action: "queue", region: q.region, count: q.count === "max" ? "max" : Number(q.count), mode: q.mode }, "Job queued. It starts in the next scheduled session.")}>Start</button>
          </div>
          {s && s.jobs.length > 0 && <div className="tablewrap"><table><thead><tr><th>Job</th><th>Region</th><th>How many</th><th>Status</th><th>Requested</th><th>Result</th><th></th></tr></thead>
            <tbody>{s.jobs.slice(0, 10).map((j) => <tr key={j.id}><td>{MODE[j.mode] || j.mode}</td><td>{j.region}</td><td>{j.count}</td><td><span className={`tag ${j.status === "done" ? "fact" : j.status === "error" ? "unv" : "likely"}`}>{j.status}</span></td>
              <td className="muted">{new Date(j.requested_at).toLocaleString()}<div>{j.requested_by}</div></td><td className="wrap">{j.result}</td>
              <td>{j.status === "queued" && <button type="button" className="btn tiny ghost" onClick={() => post({ action: "cancel", id: j.id }, "Job cancelled.")}>Cancel</button>}</td></tr>)}</tbody></table></div>}
        </div>

        {s?.log && s.log.length > 0 && <div className="eng-card"><div className="eng-head"><h3>Scheduled run history</h3><span className="tag fact">Daily 6am (Dubai)</span></div>
          <div className="tablewrap"><table><thead><tr><th>When</th><th>Summary</th><th>Verified</th><th>New companies</th></tr></thead>
            <tbody>{s.log.slice(0, 10).map((e) => <tr key={e.at}><td className="muted">{new Date(e.at).toLocaleString()}</td><td className="wrap">{e.summary}</td><td>{e.verified}</td>
              <td className="wrap">{e.new_companies.join(", ") || "—"}</td></tr>)}</tbody></table></div></div>}

        <div className="eng-card">
          <div className="eng-head"><h3>Scheduled session access</h3><span className={`tag ${s?.token_info ? "fact" : "unv"}`}>{s?.token_info ? `Active · ends …${s.token_info.hint}` : "Not set up"}</span></div>
          <p className="note">The daily 6am Claude session talks to the app with a limited engine token: it can read the job queue and the verification queue, submit revenue results, add discovered companies and post notifications — it cannot read contacts or delete anything. Put it in the cloud environment's variables as <code>ENGINE_TOKEN</code> (with <code>APP_URL=https://account-copilot.vercel.app</code>). It's shown only once; generating a new one revokes the old.</p>
          <div className="eng-form">
            <button type="button" className="btn" onClick={() => { if (!s?.token_info || window.confirm("Generate a new engine token? The current one stops working immediately.")) post({ action: "token", op: "generate" }, "New engine token generated — copy it now."); }}>{s?.token_info ? "Regenerate token" : "Generate token"}</button>
            {s?.token_info && <button type="button" className="btn ghost" onClick={() => { if (window.confirm("Revoke the engine token? Scheduled sessions will stop until a new one is set.")) post({ action: "token", op: "revoke" }, "Engine token revoked."); }}>Revoke</button>}
          </div>
          {newToken && <div className="eng-token"><b>Copy these two lines into the cloud environment's Environment variables (shown once):</b>
            <pre>{`APP_URL=https://account-copilot.vercel.app\nENGINE_TOKEN=${newToken}`}</pre>
            <button type="button" className="btn tiny" onClick={() => navigator.clipboard?.writeText(`APP_URL=https://account-copilot.vercel.app\nENGINE_TOKEN=${newToken}`)}>Copy</button></div>}
        </div>

        <div className="eng-card paid">
          <div className="eng-head"><h3>2 · Refresh — uses the Anthropic API</h3><CostNote cost="you set the budget below" /></div>
          <div className="eng-explain">
            <b>What Refresh does when you click it</b>
            <ol>
              <li><b>Updates existing companies</b> in the region: the ones researched longest ago (Verified, Likely or Needs check) are re-researched — revenue, ERP and S2P platform, signals, leadership and contacts — and their ICP status is recalculated.</li>
              <li><b>Finds new companies</b> that match the ICP (one web discovery search) and <b>profiles each one</b> the same way.</li>
              <li><b>Stays within your budget.</b> It plans as many updates and new profiles as the budget allows (updates first). Whatever isn't spent carries over and is added to your next Refresh.</li>
            </ol>
            <p className="note">Typical cost: ≈ {money(est.update)} per company updated · ≈ {money(est.discovery)} per discovery search · ≈ {money(est.profile)} per new company profiled. Real cost is measured per run and shown below. Results appear in Research Queue and the account tabs within minutes.</p>
          </div>
          <div className="eng-form">
            <label>Region<select value={r.region} onChange={(e) => setR({ ...r, region: e.target.value })}>{COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select></label>
            <label>Companies to update<input type="number" min={0} max={50} value={r.update} onChange={(e) => setR({ ...r, update: Math.max(0, Math.min(50, Number(e.target.value) || 0)) })} /></label>
            <label>New companies to find<input type="number" min={0} max={10} value={r.fresh} onChange={(e) => setR({ ...r, fresh: Math.max(0, Math.min(10, Number(e.target.value) || 0)) })} /></label>
            <label>Budget (USD)<input type="number" min={0} max={500} step={1} value={r.budget} onChange={(e) => setR({ ...r, budget: Math.max(0, Math.min(500, Number(e.target.value) || 0)) })} /></label>
          </div>
          <p className="eng-plan">Available: <b>{money(avail)}</b>{s && s.carry > 0 && <> (budget {money(r.budget)} + {money(s.carry)} carried over)</>} → plans <b>{pu}</b> update{pu === 1 ? "" : "s"} and <b>{pn}</b> new compan{pn === 1 ? "y" : "ies"} ≈ <b>{money(estCost)}</b>; ≈ {money(Math.max(0, avail - estCost))} carries over.</p>
          <button type="button" className="btn primary" disabled={!pu && !pn} onClick={() => {
            if (window.confirm(`Refresh ${r.region}: update ${pu} companies and find + profile ${pn} new ones.\n\nThis uses the Anthropic API: about ${money(estCost)} (budget ${money(avail)} available). Unused budget carries over.\n\nContinue?`))
              post({ action: "refresh", region: r.region, update_count: r.update, new_count: r.fresh, budget: r.budget }, "Refresh started. Follow it in Research Queue; spend updates here as each run finishes.");
          }}>Refresh</button>
          {s && s.batches.length > 0 && <div className="tablewrap" style={{ marginTop: 10 }}><table><thead><tr><th>When</th><th>Region</th><th>Planned</th><th>Budget</th><th>Spent</th><th>Left</th><th>Runs</th></tr></thead>
            <tbody>{s.batches.slice(0, 10).map((b) => <tr key={b.id}><td className="muted">{new Date(b.at).toLocaleString()}<div>{b.requested_by}</div></td><td>{b.region}</td>
              <td>{b.planned_update} updates · {b.planned_new} new</td><td className="mono">{money(b.available)}</td><td className="mono">{money(b.spent)}</td>
              <td className="mono">{money(Math.max(0, b.budget - b.spent))}</td><td>{b.runs}{b.running ? ` (${b.running} running)` : ""}</td></tr>)}</tbody></table></div>}
        </div>

        <div className="eng-card">
          <div className="eng-head"><h3>3 · Anthropic API spend &amp; balance</h3></div>
          <div className="eng-stats">
            <div><small>Spent this month (measured)</small><b>{s ? money(s.spentMonth) : "…"}</b></div>
            <div><small>Spent all time (measured)</small><b>{s ? money(s.spentAll) : "…"}</b></div>
            <div><small>Carry-over for next Refresh</small><b>{s ? money(s.carry) : "…"}</b></div>
            <div><small>Estimated balance left</small><b>{s?.balanceLeft !== null && s?.balanceLeft !== undefined ? money(s.balanceLeft) : "Not set"}</b></div>
          </div>
          <p className="note">The API key can't read your credit balance, so enter the balance shown at <a href="https://console.anthropic.com/settings/billing" target="_blank" rel="noopener noreferrer">console.anthropic.com → Billing</a>; the app subtracts what it spends from then on.{s?.balance.as_of && ` Last entered ${money(s.balance.amount || 0)} on ${new Date(s.balance.as_of).toLocaleString()}${s.balance.by ? ` by ${s.balance.by}` : ""}.`} Measured spend covers research, discovery and refresh runs; pitch-plan drafts (≈ $0.05–0.10 each) are not metered.</p>
          <div className="eng-form">
            <label>Console balance (USD)<input type="number" min={0} step={0.01} value={bal} onChange={(e) => setBal(e.target.value)} placeholder="e.g. 50.00" /></label>
            <button type="button" className="btn" disabled={!bal} onClick={() => { post({ action: "balance", amount: Number(bal) }, "Balance saved."); setBal(""); }}>Save balance</button>
          </div>
        </div>
      </div>
    </section>
  );
}
