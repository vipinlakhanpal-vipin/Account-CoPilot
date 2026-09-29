"use client";
import { ask, paidFetch, notify } from "@/components/Confirm";
import SecretInput from "@/components/SecretInput";
import InfoTip from "@/components/InfoTip";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import CostNote from "@/components/CostNote";
import { COUNTRIES } from "@/lib/countries";

type Job = { id: string; region: string; count: number | "max"; mode: string; company_name?: string; website?: string; slug?: string; requested_by: string; requested_at: string; status: string; done_at?: string; result?: string };
type Batch = { id: string; region: string; budget: number; available: number; planned_update: number; planned_new: number; spent: number; runs: number; running: number; at: string; requested_by: string; companies: string[] };
type Pending = { id: string; name: string; website?: string; country: string; region: string; region_status: string; industry?: string; hq_city?: string; why_icp?: string; source_url?: string; requested_at: string };
type Summary = { pin?: { set: boolean; ask_super: boolean; set_by: string; set_at: string }; token_info: { created_at?: string; by?: string; hint?: string } | null; token?: string | null; jobs: Job[]; batches: Batch[]; carry: number; spentAll: number; spentMonth: number; balance: { amount?: number; as_of?: string; by?: string };
  balanceLeft: number | null; est: { update: number; discovery: number; profile: number };
  log?: { at: string; summary: string; verified: number; new_companies: string[]; details?: { name: string; status: string; revenue?: string }[]; source?: "daily" | "instant" }[]; pending?: Pending[] };
const statusTag = (s: string) => (/verified/i.test(s) ? "fact" : /likely/i.test(s) ? "likely" : /not icp/i.test(s) ? "conflict" : "unv");

/** Next daily run (fixed at 02:00 UTC), shown in the viewer's own local time and zone — not a fixed "UAE time" label,
 * so someone in South Africa sees their own local equivalent (e.g. "4:00 AM South Africa Standard Time"), not UAE's. */
const nextRun = () => { const n = new Date(), t = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), 2, 0, 0)); if (t <= n) t.setUTCDate(t.getUTCDate() + 1);
  return t.toLocaleString("en-US", { weekday: "short", hour: "2-digit", minute: "2-digit", hour12: true, timeZoneName: "long" }); };
/** Same run, without the "next" weekday — just "what local time is 02:00 UTC for me", for static badges/labels. */
const dailyRunLocal = () => { const d = new Date(), t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 2, 0, 0));
  return t.toLocaleString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true, timeZoneName: "long" }); };
const MODE: Record<string, string> = { company: "Add one specific company", verify: "Verify existing companies", discover: "Find new companies", both: "Verify existing + find new" };
const money = (n: number) => `$${n.toFixed(2)}`;

// Settings → Discovery & refresh engine.
export default function EngineSettings() {
  const [s, setS] = useState<Summary | null>(null);
  const [msg, setMsg] = useState<ReactNode>("");
  const [q, setQ] = useState({ region: "UAE", count: "50", mode: "verify", company: "", website: "" });
  const [r, setR] = useState({ region: "UAE", update: 10, fresh: 5, budget: 20 });
  const [pinNew, setPinNew] = useState("");
  const [askSuper, setAskSuper] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
  const [pinRes, setPinRes] = useState<{ ok: boolean; text: string } | null>(null);
  // Saves the PIN and shows the result right here (and as a notice at the top centre); keeps the typed PIN if saving fails.
  async function savePinNow() {
    setPinBusy(true); setPinRes(null);
    try {
      const res = await fetch("/api/engine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "pin", pin: pinNew || null, ask_super: askSuper }) });
      const j = await res.json().catch(() => ({}));
      if (res.ok) { setS(j); const t = pinNew ? `PIN saved. Paid actions now ask for it${askSuper ? " — including Super Admins" : " (Standard users; Super Admins are not asked)"}.` : "Setting saved.";
        setPinRes({ ok: true, text: t }); notify(t, "ok"); setPinNew(""); }
      else { const t = j.error || `Could not save (error ${res.status}).`; setPinRes({ ok: false, text: t }); notify(t, "error"); }
    } catch { setPinRes({ ok: false, text: "Could not reach the server. Check your connection and try again." }); }
    setPinBusy(false);
  }
  // Instant route for one company: paid Quick research (Anthropic API, PIN). Appears in Research Queue and then in Accounts.
  const [nowMsg, setNowMsg] = useState<{ ok: boolean; text: string; company?: string } | null>(null);
  async function runNow() {
    const name = q.company.trim(); if (name.length < 2) return;
    if (!(await ask({ title: `Research ${name} now?`, tone: "cost", confirm: "Run now", points: [`Researches ${name} straight away (about 1–2 minutes) and adds it to ${q.region}.`, "Free alternative: Queue (free) — done in the next scheduled run."], cost: "≈ $0.55 (Quick research)" }))) return;
    setNowMsg({ ok: true, text: "Starting…" });
    const r = await paidFetch("/api/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company: q.website.trim() ? `${name} (${q.website.trim()})` : name, country: q.region, depth: "quick" }) }, `Researching ${name}`);
    setNowMsg(r.ok ? { ok: true, text: `In progress: researching ${name} (about 1–2 minutes).`, company: name } : { ok: false, text: "Could not start the research." });
  }
  const pinAsk = (s as { pin?: { ask_super?: boolean } } | null)?.pin?.ask_super;
  useEffect(() => { if (pinAsk !== undefined) setAskSuper(!!pinAsk); }, [pinAsk]);
  const [queueBusy, setQueueBusy] = useState(false);
  const [bal, setBal] = useState("");
  const [newToken, setNewToken] = useState("");
  const load = () => fetch("/api/engine").then((x) => (x.ok ? x.json() : null)).then((j) => j && setS(j)).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);
  const post = async (body: unknown, ok: ReactNode) => {
    const init = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
    // A paid Refresh needs the paid-actions PIN (asked in the app when required).
    const res = (body as { action?: string }).action === "refresh" ? await paidFetch("/api/engine", init, "A paid Refresh") : await fetch("/api/engine", init);
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
          <p className="note" style={{ marginTop: 10, fontWeight: 600 }}>Review this under &quot;What to do&quot; — each option below is one of the choices in that dropdown.</p>
          <div className="tablewrap"><table>
            <thead><tr><th>What to do</th><th>What it does</th><th>Speed &amp; cost</th></tr></thead>
            <tbody>
              <tr className="wtd-row-instant"><td><b>Add one specific company</b></td><td className="muted">Looks up one named company.</td><td>Instant: <b>Search now (free)</b> or <b>Run now (≈ $0.55)</b></td></tr>
              <tr className="wtd-row-bulk"><td><b>Verify existing companies</b></td><td className="muted">Re-checks revenue and ICP status for up to the number you pick, in bulk.</td><td>Free — next scheduled session only</td></tr>
              <tr className="wtd-row-bulk"><td><b>Find new companies</b></td><td className="muted">Discovers new companies that fit the ICP, in bulk.</td><td>Free — next scheduled session only</td></tr>
              <tr className="wtd-row-bulk"><td><b>Verify existing + find new</b></td><td className="muted">Does both of the above in one run.</td><td>Free — next scheduled session only</td></tr>
            </tbody>
          </table></div>
          <div className="eng-form">
            <label>Region<select value={q.region} onChange={(e) => setQ({ ...q, region: e.target.value })}>{COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select></label>
            <label>What to do<select value={q.mode} onChange={(e) => setQ({ ...q, mode: e.target.value })}>{Object.entries(MODE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            {q.mode === "company" ? <>
              <label>Company name<input value={q.company} onChange={(e) => setQ({ ...q, company: e.target.value })} placeholder="e.g. Almarai" /></label>
              <label>Website (optional)<input value={q.website} onChange={(e) => setQ({ ...q, website: e.target.value })} placeholder="e.g. almarai.com" /></label>
            </> : <>{q.mode === "discover" && <label className="eng-co"><span>Company name (optional)<InfoTip k="companyName" /></span><input value={q.company} onChange={(e) => setQ({ ...q, company: e.target.value })} placeholder="e.g. Almarai" /></label>}
              {!(q.mode === "discover" && q.company.trim()) && <label>How many<select value={q.count} onChange={(e) => setQ({ ...q, count: e.target.value })}>{["1", "5", "10", "30", "50", "max"].map((n) => <option key={n} value={n}>{n === "max" ? "Max (as many as a session can)" : n}</option>)}</select></label>}</>}
            <button type="button" className="btn primary" disabled={queueBusy || (q.mode === "company" && q.company.trim().length < 2)}
              onClick={async () => { const specific = q.mode === "company" || (q.mode === "discover" && q.company.trim().length >= 2); setQueueBusy(true);
                await post(specific ? { action: "queue", region: q.region, count: 1, mode: "company", company_name: q.company.trim(), website: q.website.trim() }
                : { action: "queue", region: q.region, count: q.count === "max" ? "max" : Number(q.count), mode: q.mode },
                specific ? `Searching ${q.company.trim()} (${q.region}) now, free — usually done in a minute or two (falls back to the next run, ${nextRun()}, if that doesn't fire). The job below shows Waiting → In progress → Completed, with a link to the account.`
                  : `Job started, free — usually a minute or two (falls back to the next run, ${nextRun()}, if that doesn't fire).`);
                setQueueBusy(false); }}>{queueBusy ? <span className="btn-spin">Searching…</span> : (q.mode === "company" || (q.mode === "discover" && q.company.trim())) ? "Search now (free)" : "Start"}</button>
            {(q.mode === "company" || (q.mode === "discover" && q.company.trim().length >= 2)) && (
              <button type="button" className="btn" onClick={runNow} title="Researches it now with the Anthropic API (≈ $0.55, asks for your PIN)">Run now (≈ $0.55)</button>)}
          </div>
          {nowMsg && <p className={`now-msg ${nowMsg.ok ? "ok" : "err"}`}>{nowMsg.text}{nowMsg.company && <> <a href="/research">Follow it in Data → Research Queue →</a> When it finishes it appears in <a href={`/?tab=accounts&country=${encodeURIComponent(q.region)}`}>{q.region} accounts →</a></>}</p>}
          {s && s.jobs.length > 0 && <div className="tablewrap"><table><thead><tr><th>Company name</th><th>Job</th><th>Region</th><th>How many</th><th>Status</th><th>Requested</th><th>Result</th><th></th></tr></thead>
            <tbody>{s.jobs.slice(0, 10).map((j) => {
              // The routine's finish message names the company's real, correct name and region: "<Company> (<region>): <outcome>".
              const parsed = String(j.result || "").match(/^(.+)\(([A-Za-z ]+)\):\s*(.+)$/);
              const legacyHeld = parsed ? null : String(j.result || "").match(/held pending ([A-Za-z ]+?) activation/i);
              const realRegion = parsed ? parsed[2].trim() : j.region;
              const held = parsed ? /held pending activation/i.test(parsed[3]) : !!legacyHeld;
              return <tr key={j.id}>
              <td>{j.mode === "company" ? (parsed ? parsed[1].trim() : j.company_name) : "—"}{j.website && <div className="muted">{j.website}</div>}</td>
              <td>{MODE[j.mode] || j.mode}</td><td>{realRegion}</td><td>{j.count}</td><td><span className={`job-st ${j.status}`}>{j.status === "queued" ? "Waiting" : j.status === "running" ? "In progress" : j.status === "done" ? "Completed" : j.status === "error" ? "Failed" : j.status === "cancelled" ? "Cancelled" : j.status}</span>
                {j.status === "queued" && <div className="muted">usually a minute or two — falls back to {nextRun()} if that doesn't fire</div>}{j.status === "running" && <div className="muted">started by the scheduled session</div>}</td>
              <td className="muted">{new Date(j.requested_at).toLocaleString()}<div>{j.requested_by}</div></td><td className="wrap">{j.result}
                {j.status === "done" && (held
                  ? <div><a className="job-link" href="/settings#engine-pending">Waiting for {(parsed ? realRegion : legacyHeld?.[1]) || "region"} Region Activation →</a></div>
                  : <div><a className="job-link" href={j.slug ? `/?open=${encodeURIComponent(j.slug)}&country=${encodeURIComponent(realRegion)}` : `/?tab=accounts&country=${encodeURIComponent(realRegion)}`}>{j.slug ? `View ${parsed ? parsed[1].trim() : j.company_name || "the"} (${realRegion}) Account →` : `View the (${realRegion}) Accounts →`}</a></div>)}</td>
              <td>{j.status === "queued" && <button type="button" className="btn tiny ghost" onClick={() => post({ action: "cancel", id: j.id }, "Job cancelled.")}>Cancel</button>}</td></tr>; })}</tbody></table></div>}
        </div>

        {s?.log && s.log.length > 0 && <div className="eng-card"><div className="eng-head"><h3>Scheduled run history</h3></div>
          <p className="note">Every run from here on tags itself automatically — Run status shows a badge with no extra step. Older runs, from before this existed, show &quot;—&quot;.</p>
          <div className="tablewrap"><table><thead><tr><th>When</th><th>Summary</th><th>Activate Region</th><th>Verified</th><th>New companies</th><th>Run status</th></tr></thead>
            <tbody>{s.log.slice(0, 10).map((e) => { const held = e.details?.filter((d) => /^held/i.test(d.status)) || [];
              return <tr key={e.at}><td className="muted">{new Date(e.at).toLocaleString()}</td>
              <td className="wrap">
                {e.details && e.details.length > 0 ? (<>
                  <table className="run-table"><thead><tr><th>Company</th><th>Status</th><th>Revenue</th></tr></thead>
                    <tbody>{e.details.slice(0, 30).map((d, i) => <tr key={i}><td>{d.name}</td><td><span className={`tag ${statusTag(d.status)}`}>{d.status}</span></td><td className="muted">{d.revenue || "—"}</td></tr>)}</tbody></table>
                  <p className="note run-note">{e.summary}</p></>
                ) : e.summary}
              </td>
              <td>{held.map((d, i) => <div key={i}><a className="job-link" href="/settings#engine-pending">Activate {d.status.replace(/^held \(|\)$/gi, "")} →</a></div>)}</td>
              <td>{e.verified}</td>
              <td className="wrap">{e.new_companies.join(", ") || "—"}</td>
              <td>{e.source === "instant" ? <span className="run-badge instant">Instant search run</span> : e.source === "daily" ? <span className="run-badge daily">Daily run — {dailyRunLocal()}</span> : <span className="muted">—</span>}</td></tr>; })}</tbody></table></div></div>}

        {s?.pending && s.pending.length > 0 && <div className="eng-card" id="engine-pending">
          <div className="eng-head"><h3>Waiting for region activation</h3><span className="tag unv">{s.pending.length}</span></div>
          <p className="note">Each of these belongs to a region that isn&apos;t Active yet, so it hasn&apos;t been added as a live account. Activate the region in Define ICP, then click Add — or dismiss it.</p>
          <div className="tablewrap"><table><thead><tr><th>Company</th><th>Region</th><th>Why</th><th>Requested</th><th>Activate Region</th></tr></thead>
            <tbody>{s.pending.map((p) => <tr key={p.id}>
              <td>{p.name}{p.website && <div className="muted">{p.website}</div>}</td>
              <td>{p.region} <span className={`tag ${p.region_status === "active" ? "fact" : "unv"}`}>{p.region_status === "active" ? "Active" : p.region_status === "next" ? "Next phase" : "Paused"}</span></td>
              <td className="wrap">{p.why_icp}</td>
              <td className="muted">{new Date(p.requested_at).toLocaleString()}</td>
              <td>{p.region_status === "active"
                ? <button type="button" className="btn tiny" onClick={() => post({ action: "release_pending", id: p.id }, <>{p.name} added. <a className="job-link" href={`/?tab=accounts&country=${encodeURIComponent(p.region)}`}>View {p.name} ({p.region}) Account →</a></>)}>Add now</button>
                : <a className="job-link" href="/icp">Activate {p.region} →</a>}
                {" "}<button type="button" className="btn tiny ghost" onClick={async () => { if (await ask({ title: `Dismiss ${p.name}?`, tone: "danger", confirm: "Dismiss", points: ["It will not be added — you'd have to find it again later."] })) post({ action: "dismiss_pending", id: p.id }, `${p.name} dismissed.`); }}>Dismiss</button></td>
            </tr>)}</tbody></table></div>
        </div>}

        <div className="eng-card">
          <div className="eng-head"><h3>Scheduled session access</h3><span className={`tag ${s?.token_info ? "fact" : "unv"}`} title={s?.token_info ? "Last 4 characters of the current token — the app only stores its hash, not the full value. Check this matches the ENGINE_TOKEN you pasted into the cloud environment." : undefined}>{s?.token_info ? `Active · token ends in ${s.token_info.hint}` : "Not set up"}</span></div>
          <p className="note">The daily Claude session talks to the app with a limited engine token: it can read the job queue and the verification queue, submit revenue results, add discovered companies and post notifications — it cannot read contacts or delete anything. Put it in the cloud environment's variables as <code>ENGINE_TOKEN</code> (with <code>APP_URL=https://account-copilot.vercel.app</code>). It's shown only once; generating a new one revokes the old. <b>It never expires on its own</b> — it stays active until you regenerate or revoke it here. Only a Super Admin can generate, regenerate or revoke it; nobody else can reach this action.</p>
          <div className="eng-form">
            <button type="button" className="btn" onClick={async () => { if (!s?.token_info || await ask({ title: "Generate a new engine token?", tone: "danger", confirm: "Generate new token", points: ["The current token stops working immediately.", "Update ENGINE_TOKEN in the routine environment with the new one."] })) post({ action: "token", op: "generate" }, "New engine token generated — copy it now."); }}>{s?.token_info ? "Regenerate token" : "Generate token"}</button>
            {s?.token_info && <button type="button" className="btn ghost" onClick={async () => { if (await ask({ title: "Revoke the engine token?", tone: "danger", confirm: "Revoke token", points: ["The daily run stops until a new token is generated and set."] })) post({ action: "token", op: "revoke" }, "Engine token revoked."); }}>Revoke</button>}
          </div>
          {newToken && <div className="eng-token"><b>Copy these two lines into the cloud environment's Environment variables (shown once):</b>
            <pre>{`APP_URL=https://account-copilot.vercel.app\nENGINE_TOKEN=${newToken}`}</pre>
            <button type="button" className="btn tiny" onClick={() => navigator.clipboard?.writeText(`APP_URL=https://account-copilot.vercel.app\nENGINE_TOKEN=${newToken}`)}>Copy</button>
            <button type="button" className="btn tiny ghost" onClick={() => setNewToken("")}>Done</button></div>}
        </div>

        <div className="eng-card paid">
          <div className="eng-head"><h3>2 · Paid refresh — uses your Anthropic API credit</h3><CostNote cost="you set the budget below" /></div>
          <p className="note">One place for paid work: <b>A</b> shows how much API credit you have and have spent; <b>B</b> spends part of it on a refresh now. The daily run and section 1 are free and don&apos;t touch this credit.</p>
          <div className={`eng-sub pin${s?.pin?.set ? "" : " off"}`}><h4>🔒 Paid-actions PIN {s?.pin?.set ? <span className="tag fact">On</span> : <span className="tag unv">Not set — only Super Admins can run paid actions</span>}</h4>
            <p className="note">Every action that costs money (Research more, Draft pitch plan, Research Queue, Research again, this Refresh) asks for this PIN in the app before anything is spent.
              Standard users are always asked{s?.pin?.ask_super ? "; Super Admins are asked too" : "; Super Admins are not asked unless you tick the box"}. Share it only with people allowed to spend.
              Use a new number, not your sign-in password.{s?.pin?.set_at && ` Last changed ${new Date(s.pin.set_at).toLocaleString()} by ${s.pin.set_by}.`}</p>
            <div className="pin-row">
              <label className="pin-in">{s?.pin?.set ? "New PIN (6–12 digits)" : "Set a PIN (6–12 digits)"}
                <SecretInput value={pinNew} onChange={(v) => { setPinNew(v.replace(/\D/g, "").slice(0, 12)); setPinRes(null); }} inputMode="numeric" autoComplete="new-password" placeholder="e.g. 482915" /></label>
              <label className="pin-ask">Ask Super Admins too (protects against my own accidental clicks)
                <input type="checkbox" checked={askSuper} onChange={(e) => { setAskSuper(e.target.checked); setPinRes(null); }} /></label>
              <button type="button" className="btn primary" disabled={pinBusy || (pinNew.length > 0 && pinNew.length < 6) || (!pinNew && askSuper === !!s?.pin?.ask_super)} onClick={savePinNow}>
                {pinBusy ? "Saving…" : pinNew || !s?.pin?.set ? "Save PIN" : "Save setting"}</button>
            </div>
            {pinNew.length > 0 && pinNew.length < 6 && <p className="pin-msg err">Use at least 6 digits ({pinNew.length} so far).</p>}
            {pinRes && <p className={`pin-msg ${pinRes.ok ? "ok" : "err"}`}>{pinRes.text}</p>}
          </div>
          <div className="eng-sub"><h4>A · Your API credit — check it first</h4>
          <div className="eng-stats">
            <div><small>Spent this month (measured)</small><b>{s ? money(s.spentMonth) : "…"}</b></div>
            <div><small>Spent all time (measured)</small><b>{s ? money(s.spentAll) : "…"}</b></div>
            <div><small>Carry-over for next Refresh</small><b>{s ? money(s.carry) : "…"}</b></div>
            <div><small>Estimated balance left</small><b>{s?.balanceLeft !== null && s?.balanceLeft !== undefined ? money(s.balanceLeft) : "Not set"}</b></div>
          </div>
          <p className="note">The API key can't read your credit balance, so enter the balance shown at <a href="https://console.anthropic.com/settings/billing" target="_blank" rel="noopener noreferrer">console.anthropic.com → Billing</a>; the app subtracts what it spends from then on.{s?.balance.as_of && ` Last entered ${money(s.balance.amount || 0)} on ${new Date(s.balance.as_of).toLocaleString()}${s.balance.by ? ` by ${s.balance.by}` : ""}.`} Measured spend covers research, discovery and refresh runs; pitch-plan drafts (≈ $0.05–0.10 each) are not metered.</p>
          <div className="eng-form">
            <label>Console balance (USD)<span className="money-input"><span aria-hidden="true">$</span><input type="number" min={0} step={0.01} value={bal} onChange={(e) => setBal(e.target.value)} placeholder="50.00" /></span></label>
            <button type="button" className="btn primary" disabled={!bal} onClick={() => { post({ action: "balance", amount: Number(bal) }, "Balance saved."); setBal(""); }}>Save balance</button>
          </div>
          </div>
          <h4 className="eng-sub-h">B · Plan a refresh</h4>
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
          <p className="eng-plan"><span className="eng-preview">Preview — nothing spent yet</span> Calculated from the numbers above (the $20 budget is only a starting value; change it to what you want to spend).
            If you click Refresh: available <b>{money(avail)}</b>{s && s.carry > 0 ? <> (your budget {money(r.budget)} + {money(s.carry)} unspent from earlier Refreshes)</> : <> (your budget; nothing carried over yet)</>} → plans <b>{pu}</b> update{pu === 1 ? "" : "s"} and <b>{pn}</b> new compan{pn === 1 ? "y" : "ies"}, estimated <b>{money(estCost)}</b> (≈ $0.55 per update, plus ≈ $0.75 for the discovery search and ≈ $0.55 per new company profiled); about {money(Math.max(0, avail - estCost))} would carry over. Real spend is measured per run and shown in the spend table.</p>
          <button type="button" className="btn primary" disabled={!pu && !pn} onClick={async () => {
            if (await ask({ title: `Refresh ${r.region}?`, tone: "cost", confirm: "Start refresh", points: [`Updates ${pu} companies and finds + profiles ${pn} new ones.`, "Unused budget carries over to your next Refresh."], cost: `about ${money(estCost)} (budget ${money(avail)} available)` }))
              post({ action: "refresh", region: r.region, update_count: r.update, new_count: r.fresh, budget: r.budget }, "Refresh started. Follow it in Research Queue; spend updates here as each run finishes.");
          }}>Refresh</button>
          {s && s.batches.length > 0 && <div className="tablewrap" style={{ marginTop: 10 }}><table><thead><tr><th>When</th><th>Region</th><th>Planned</th><th>Budget</th><th>Spent</th><th>Left</th><th>Runs</th></tr></thead>
            <tbody>{s.batches.slice(0, 10).map((b) => <tr key={b.id}><td className="muted">{new Date(b.at).toLocaleString()}<div>{b.requested_by}</div></td><td>{b.region}</td>
              <td>{b.planned_update} updates · {b.planned_new} new</td><td className="mono">{money(b.available)}</td><td className="mono">{money(b.spent)}</td>
              <td className="mono">{money(Math.max(0, b.budget - b.spent))}</td><td>{b.runs}{b.running ? ` (${b.running} running)` : ""}</td></tr>)}</tbody></table></div>}
        </div>


      </div>
    </section>
  );
}
