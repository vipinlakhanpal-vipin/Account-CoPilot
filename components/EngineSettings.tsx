"use client";
import { ask, paidFetch, notify } from "@/components/Confirm";
import SecretInput from "@/components/SecretInput";
import InfoTip from "@/components/InfoTip";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import CostNote from "@/components/CostNote";
import { COUNTRIES } from "@/lib/countries";
import { fmtDate, fmtDateTime, fmtTimeShort } from "@/lib/dates";

type JobDetail = { name: string; status?: string; revenue?: string; industry?: string; hq_city?: string; why_icp?: string; source_url?: string; country?: string; decided?: "added" | "ignored" };
type Job = { id: string; region: string; count: number | "max"; mode: string; company_name?: string; website?: string; company_names?: string[]; slug?: string; requested_by: string; requested_at: string; status: string; done_at?: string; result?: string; details?: JobDetail[] };
const parseNames = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
type Batch = { id: string; region: string; budget: number; available: number; planned_update: number; planned_new: number; spent: number; runs: number; running: number; at: string; requested_by: string; companies: string[] };
type Pending = { id: string; name: string; website?: string; country: string; region: string; region_status: string; industry?: string; hq_city?: string; why_icp?: string; source_url?: string; requested_at: string };
type Summary = { pin?: { set: boolean; ask_super: boolean; set_by: string; set_at: string }; token_info: { created_at?: string; by?: string; hint?: string } | null; token?: string | null; jobs: Job[]; batches: Batch[]; carry: number; spentAll: number; spentMonth: number; balance: { amount?: number; as_of?: string; by?: string };
  balanceLeft: number | null; est: { update: number; discovery: number; profile: number };
  log?: { at: string; summary: string; verified: number; new_companies: string[]; details?: { name: string; status: string; revenue?: string }[]; source?: "daily" | "instant"; region?: string }[]; pending?: Pending[] };
const statusTag = (s: string) => (/verified/i.test(s) ? "fact" : /likely/i.test(s) ? "likely" : /not icp/i.test(s) ? "conflict" : "unv");
/** Plain-text status color for the compact run-history table (no pill/box). */
const statusColor = (s: string) => (/verified/i.test(s) ? "st-v" : /likely/i.test(s) ? "st-l" : /not icp/i.test(s) ? "st-n" : "st-u");
/** "ICP — Verified" -> "ICP-Verified": compact, no spaces around the dash. */
const compactStatus = (s: string) => s.replace(/\s*—\s*/g, "-");

/** Next daily run (fixed at 02:00 UTC), shown in the viewer's own local time and zone — not a fixed "UAE time" label,
 * so someone in South Africa sees their own local equivalent (e.g. "4:00 AM South Africa Standard Time"), not UAE's. */
const nextRun = () => { const n = new Date(), t = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), 2, 0, 0)); if (t <= n) t.setUTCDate(t.getUTCDate() + 1);
  return t.toLocaleString("en-US", { weekday: "short", hour: "2-digit", minute: "2-digit", hour12: true, timeZoneName: "long" }); };
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
  // Instant route for several named companies at once: same paid Quick research, run once per name.
  async function runNowMulti(names: string[]) {
    if (!(await ask({ title: `Research ${names.length} companies now?`, tone: "cost", confirm: "Run now", points: [`Researches each of the ${names.length} named companies straight away and adds it to ${q.region}.`, "Free alternative: Search now (free) — a narrower check, done in the next scheduled run."], cost: `≈ $${(names.length * 0.55).toFixed(2)} (Quick research × ${names.length})` }))) return;
    setNowMsg({ ok: true, text: "Starting…" });
    for (const name of names) await paidFetch("/api/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company: name, country: q.region, depth: "quick" }) }, `Researching ${name}`);
    setNowMsg({ ok: true, text: `In progress: researching ${names.length} companies (about 1–2 minutes each).` });
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
  const names = parseNames(q.company); // discover mode: 0 = normal bulk search, 1 = a single named company, 2+ = several named companies at once

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
            </> : <>{q.mode === "discover" && <label className="eng-co"><span>Company names (optional)<InfoTip k="companyName" /></span>
              <textarea rows={names.length > 1 ? 3 : 1} value={q.company} onChange={(e) => setQ({ ...q, company: e.target.value })} placeholder="e.g. Almarai, Gulf Steel Works, Emirates Bio Farm — one per line or comma-separated" /></label>}
              {names.length === 0 && <label>How many<select value={q.count} onChange={(e) => setQ({ ...q, count: e.target.value })}>{["1", "5", "10", "30", "50", "max"].map((n) => <option key={n} value={n}>{n === "max" ? "Max (as many as a session can)" : n}</option>)}</select></label>}
              {names.length > 1 && <span className="eng-namecount">{names.length} companies — from the names above</span>}</>}
            <button type="button" className="btn primary" disabled={queueBusy || (q.mode === "company" && q.company.trim().length < 2)}
              onClick={async () => { const specific = q.mode === "company" || (q.mode === "discover" && names.length === 1); setQueueBusy(true);
                await post(specific ? { action: "queue", region: q.region, count: 1, mode: "company", company_name: q.company.trim(), website: q.website.trim() }
                : names.length > 1 ? { action: "queue", region: q.region, count: names.length, mode: "discover", company_names: names }
                : { action: "queue", region: q.region, count: q.count === "max" ? "max" : Number(q.count), mode: q.mode },
                specific ? `Searching ${q.company.trim()} (${q.region}) now, free — usually done in a minute or two (falls back to the next run, ${nextRun()}, if that doesn't fire). The job below shows Waiting → In progress → Completed, with a link to the account.`
                  : names.length > 1 ? `Searching ${names.length} companies (${q.region}) now, free — usually done in a minute or two. Each one will show up below with Add / Ignore once it's checked.`
                  : `Job started, free — usually a minute or two (falls back to the next run, ${nextRun()}, if that doesn't fire).`);
                setQueueBusy(false); }}>{queueBusy ? <span className="btn-spin">Searching…</span> : (q.mode === "company" || (q.mode === "discover" && names.length > 0)) ? "Search now (free)" : "Start"}</button>
            {(q.mode === "company" || (q.mode === "discover" && names.length === 1)) && (
              <button type="button" className="btn" onClick={runNow} title="Researches it now with the Anthropic API (≈ $0.55, asks for your PIN)">Run now (≈ $0.55)</button>)}
            {q.mode === "discover" && names.length > 1 && (
              <button type="button" className="btn" onClick={() => runNowMulti(names)} title="Researches each one now with the Anthropic API, asks for your PIN">Run now — deep research (≈ ${(names.length * 0.55).toFixed(2)}, {names.length}{" "}× $0.55)</button>)}
          </div>
          {q.mode === "discover" && names.length > 1 && <p className="note" style={{ marginTop: 8 }}>&quot;Search now&quot; is a narrower, free lookup (confirms it exists, a rough size/industry signal) — each one lands below with Add / Ignore. &quot;Run now&quot; is full paid research per company (revenue, ERP/S2P signals, contacts), added straight away.</p>}
          {nowMsg && <p className={`now-msg ${nowMsg.ok ? "ok" : "err"}`}>{nowMsg.text}{nowMsg.company && <> <a href="/research">Follow it in Data → Research Queue →</a> When it finishes it appears in <a href={`/?tab=accounts&country=${encodeURIComponent(q.region)}`}>{q.region} accounts →</a></>}</p>}
          {s && s.jobs.length > 0 && <div className="tablewrap"><table className="jobs-table"><thead><tr><th>Company name</th><th>Job</th><th>Region</th><th>How many</th><th>Status</th><th>Requested</th><th>Result</th><th></th></tr></thead>
            <tbody>{s.jobs.slice(0, 10).flatMap((j) => {
              // The routine's finish message names the company's real, correct name and region: "<Company> (<region>): <outcome>".
              const parsed = String(j.result || "").match(/^(.+)\(([A-Za-z ]+)\):\s*(.+)$/);
              const legacyHeld = parsed ? null : String(j.result || "").match(/held pending ([A-Za-z ]+?) activation/i);
              const realRegion = parsed ? parsed[2].trim() : j.region;
              const held = parsed ? /held pending activation/i.test(parsed[3]) : !!legacyHeld;
              const statusCell = <><span className={`job-st ${j.status}`}>{j.status === "queued" ? "Waiting" : j.status === "running" ? "In progress" : j.status === "done" ? "Completed" : j.status === "error" ? "Failed" : j.status === "cancelled" ? "Cancelled" : j.status}</span>
                {j.status === "queued" && <div className="muted">usually a minute or two — falls back to {nextRun()} if that doesn't fire</div>}{j.status === "running" && <div className="muted">started by the scheduled session</div>}</>;
              // A multi-name discover job: several companies searched for free under one job, each awaiting an Add / Ignore decision.
              if (j.mode === "discover" && j.details && j.details.length > 1) {
                const n = j.details.length, pending = j.details.filter((d) => !d.decided).length;
                return [...j.details.map((d, i) => (
                  <tr key={`${j.id}-${i}`} className={i === 0 ? "run-group-top" : undefined}>
                    <td className="wrap">{d.name}</td>
                    {i === 0 && <td rowSpan={n}>{MODE[j.mode] || j.mode}</td>}
                    {i === 0 && <td rowSpan={n}>{j.region}</td>}
                    {i === 0 && <td rowSpan={n}>{j.count}</td>}
                    {i === 0 && <td rowSpan={n}>{statusCell}</td>}
                    {i === 0 && <td className="muted" rowSpan={n}>{fmtDateTime(j.requested_at)}<div>{j.requested_by}</div></td>}
                    <td className="wrap">{d.status}{d.why_icp && <div className="muted">{d.why_icp}</div>}</td>
                    <td className="wrap">{!d.decided ? <>
                      <button type="button" className="btn-check ok" onClick={() => post({ action: "add_found", job_id: j.id, name: d.name }, `${d.name} added.`)}><span className="btn-check-box">✓</span> Add</button>
                      <button type="button" className="btn-check no" onClick={() => post({ action: "ignore_found", job_id: j.id, name: d.name }, `${d.name} ignored — will resurface in 180 days if it grows.`)}><span className="btn-check-box">✓</span> Ignore</button>
                    </> : <span className="muted" style={{ fontStyle: "italic" }}>{d.decided === "added" ? "Added" : "Ignored — resurfaces in 180 days"}</span>}</td>
                  </tr>
                )), pending > 1 && <tr key={`${j.id}-addall`}><td colSpan={8} className="jobs-addall">
                  <button type="button" className="btn tiny" onClick={() => post({ action: "add_all_found", job_id: j.id }, `${pending} companies added.`)}>Add all {pending} to app</button>
                </td></tr>];
              }
              return [<tr key={j.id}>
              <td>{j.mode === "company" ? (parsed ? parsed[1].trim() : j.company_name) : "—"}{j.website && <div className="muted">{j.website}</div>}</td>
              <td>{MODE[j.mode] || j.mode}</td><td>{realRegion}</td><td>{j.count}</td><td>{statusCell}</td>
              <td className="muted">{fmtDateTime(j.requested_at)}<div>{j.requested_by}</div></td><td className="wrap">{j.result}
                {j.status === "done" && (held
                  ? <div><a className="job-link" href="/settings#engine-pending">Waiting for {(parsed ? realRegion : legacyHeld?.[1]) || "region"} Region Activation →</a></div>
                  : <div><a className="job-link" href={j.slug ? `/?open=${encodeURIComponent(j.slug)}&country=${encodeURIComponent(realRegion)}` : `/?tab=accounts&country=${encodeURIComponent(realRegion)}`}>{j.slug ? `View ${parsed ? parsed[1].trim() : j.company_name || "the"} (${realRegion}) Account →` : `View the (${realRegion}) Accounts →`}</a></div>)}</td>
              <td>{j.status === "queued" && <button type="button" className="btn tiny ghost" onClick={() => post({ action: "cancel", id: j.id }, "Job cancelled.")}>Cancel</button>}</td></tr>]; })}</tbody></table></div>}
        </div>

        {s?.log && s.log.length > 0 && <div className="eng-card"><div className="eng-head"><h3>Scheduled run history</h3></div>
          <p className="note">Every run from here on tags itself automatically — Run status shows a badge with no extra step. Older runs, from before this existed, show &quot;—&quot;.</p>
          {(() => { const latest = s.log[0]; return (
            <div className="run-summary-box">
              <div className="run-summary-box-label">Summary</div>
              <div className="run-summary-box-body"><b>{latest.verified}</b> verified{latest.new_companies.length > 0 && <> · {latest.new_companies.length} new: {latest.new_companies.join(", ")}</>}</div>
            </div>
          ); })()}
          <div className="tablewrap"><table className="run-history-table"><thead><tr><th>Date</th><th>Company</th><th>Status</th><th>Revenue</th><th>Region</th><th>Run Status</th><th>Activate Region</th></tr></thead>
            <tbody>{s.log.slice(0, 10).flatMap((e) => {
              // Older runs, from before per-company detail tracking existed, only have a free-text summary and a
              // new-companies list — fall back to one row per named company (status/revenue unknown) instead of
              // dumping the whole sentence into the Company cell.
              const rows = e.details && e.details.length > 0 ? e.details.slice(0, 30)
                : e.new_companies && e.new_companies.length > 0 ? e.new_companies.map((name) => ({ name, status: "", revenue: "" }))
                : [{ name: e.summary, status: "", revenue: "" }];
              const held = e.details?.filter((d) => /^held/i.test(d.status)) || [];
              const n = rows.length;
              return rows.map((d, i) => (
                <tr key={`${e.at}-${i}`} className={i === 0 ? "run-group-top" : undefined}>
                  {i === 0 && <td className="muted run-date" rowSpan={n}>{fmtDate(e.at)}<br />{fmtTimeShort(e.at)}</td>}
                  <td className="wrap">{d.name}</td>
                  <td>{d.status ? <span className={`status-plain ${statusColor(d.status)}`}>{compactStatus(d.status)}</span> : <span className="muted">—</span>}</td>
                  <td className="muted">{d.revenue || "—"}</td>
                  {i === 0 && <td rowSpan={n}>{e.region || <span className="muted">—</span>}</td>}
                  {i === 0 && <td rowSpan={n}>{e.source === "instant" ? <span className="run-badge instant">Instant Run</span> : e.source === "daily" ? <span className="run-badge daily">Daily Run 6am GST</span> : <span className="muted">—</span>}</td>}
                  {i === 0 && <td rowSpan={n}>{held.length > 0 ? held.map((h, hi) => <div key={hi}><a className="job-link" href="/settings#engine-pending">Activate {h.status.replace(/^held \(|\)$/gi, "")} →</a></div>) : <span className="muted">—</span>}</td>}
                </tr>
              ));
            })}</tbody></table></div></div>}

        {s?.pending && s.pending.length > 0 && <div className="eng-card" id="engine-pending">
          <div className="eng-head"><h3>Waiting for region activation</h3><span className="tag unv">{s.pending.length}</span></div>
          <p className="note">Each of these belongs to a region that isn&apos;t Active yet, so it hasn&apos;t been added as a live account. Activate the region in Define ICP, then click Add — or dismiss it.</p>
          <div className="tablewrap"><table><thead><tr><th>Company</th><th>Region</th><th>Why</th><th>Requested</th><th>Activate Region</th></tr></thead>
            <tbody>{s.pending.map((p) => <tr key={p.id}>
              <td>{p.name}{p.website && <div className="muted">{p.website}</div>}</td>
              <td>{p.region} <span className={`tag ${p.region_status === "active" ? "fact" : "unv"}`}>{p.region_status === "active" ? "Active" : p.region_status === "next" ? "Next phase" : "Paused"}</span></td>
              <td className="wrap">{p.why_icp}</td>
              <td className="muted">{fmtDateTime(p.requested_at)}</td>
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
              Use a new number, not your sign-in password.{s?.pin?.set_at && ` Last changed ${fmtDateTime(s.pin.set_at)} by ${s.pin.set_by}.`}</p>
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
          <p className="note">The API key can't read your credit balance, so enter the balance shown at <a href="https://console.anthropic.com/settings/billing" target="_blank" rel="noopener noreferrer">console.anthropic.com → Billing</a>; the app subtracts what it spends from then on.{s?.balance.as_of && ` Last entered ${money(s.balance.amount || 0)} on ${fmtDateTime(s.balance.as_of)}${s.balance.by ? ` by ${s.balance.by}` : ""}.`} Measured spend covers research, discovery and refresh runs; pitch-plan drafts (≈ $0.05–0.10 each) are not metered.</p>
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
            <tbody>{s.batches.slice(0, 10).map((b) => <tr key={b.id}><td className="muted">{fmtDateTime(b.at)}<div>{b.requested_by}</div></td><td>{b.region}</td>
              <td>{b.planned_update} updates · {b.planned_new} new</td><td className="mono">{money(b.available)}</td><td className="mono">{money(b.spent)}</td>
              <td className="mono">{money(Math.max(0, b.budget - b.spent))}</td><td>{b.runs}{b.running ? ` (${b.running} running)` : ""}</td></tr>)}</tbody></table></div>}
        </div>


      </div>
    </section>
  );
}
