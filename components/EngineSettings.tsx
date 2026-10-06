"use client";
import { ask, notify } from "@/components/Confirm";
import SecretInput from "@/components/SecretInput";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { fmtDateTime } from "@/lib/dates";

type Pending = { id: string; name: string; website?: string; country: string; region: string; region_status: string; industry?: string; hq_city?: string; why_icp?: string; source_url?: string; requested_at: string };
type UploadItem = { id: string; filename: string; region: string; uploaded_by: string; uploaded_at: string; rows: number; status: "waiting" | "done" | "error"; processed_at?: string; summary?: string };
type Summary = { pin?: { set: boolean; ask_super: boolean; set_by: string; set_at: string }; token_info: { created_at?: string; by?: string; hint?: string } | null; token?: string | null; carry: number; spentAll: number; spentMonth: number; balance: { amount?: number; as_of?: string; by?: string };
  balanceLeft: number | null; pending?: Pending[] };
const money = (n: number) => `$${n.toFixed(2)}`;

// Settings → Discovery & refresh engine.
export default function EngineSettings() {
  const [s, setS] = useState<Summary | null>(null);
  const [msg, setMsg] = useState<ReactNode>("");
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
  const pinAsk = (s as { pin?: { ask_super?: boolean } } | null)?.pin?.ask_super;
  useEffect(() => { if (pinAsk !== undefined) setAskSuper(!!pinAsk); }, [pinAsk]);
  const [bal, setBal] = useState("");
  const [newToken, setNewToken] = useState("");
  const load = () => fetch("/api/engine").then((x) => (x.ok ? x.json() : null)).then((j) => j && setS(j)).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const loadUploads = () => fetch("/api/wizard-upload").then((x) => (x.ok ? x.json() : null)).then((j) => j && setUploads(j.items || [])).catch(() => {});
  useEffect(() => { loadUploads(); const t = setInterval(loadUploads, 30000); return () => clearInterval(t); }, []);
  const post = async (body: unknown, ok: ReactNode) => {
    const init = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
    const res = await fetch("/api/engine", init);
    const j = await res.json().catch(() => ({}));
    if (res.ok) { setS(j); setMsg(ok); if (j.token !== undefined) setNewToken(j.token || ""); } else setMsg(j.error || "Something went wrong.");
  };

  return (
    <section className="view">
      <div className="panel engine" id="engine">
        <h2>Discovery &amp; refresh engine</h2>
        <p className="note">Searching for companies, refreshing them with paid research, and scheduled run history all moved to <a href="/?tab=reports">Dashboard → Mission Control →</a> This page now holds only configuration: the paid-actions PIN, your Anthropic API balance, the engine token, and anything waiting on an upload or a region activation.</p>
        {msg && <p className="eng-msg">{msg}</p>}

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

        {uploads.length > 0 && <div className="eng-card">
          <div className="eng-head"><h3>Uploaded lists</h3></div>
          <p className="note">Spreadsheets uploaded from the Setup Wizard&apos;s &quot;Add Data&quot; step, waiting for a scheduled session to read and import.</p>
          <div className="tablewrap"><table><thead><tr><th>File</th><th>Region</th><th>Rows</th><th>Uploaded</th><th>Status</th></tr></thead>
            <tbody>{uploads.map((u) => (
              <tr key={u.id}>
                <td className="wrap">{u.filename}<div className="muted">{u.uploaded_by}</div></td>
                <td>{u.region}</td>
                <td className="muted">{u.rows}</td>
                <td className="muted">{fmtDateTime(u.uploaded_at)}</td>
                <td>{u.status === "waiting" ? <span className="status-plain st-l">Waiting to be processed</span>
                  : u.status === "done" ? <span className="status-plain st-v">Processed{u.summary ? ` — ${u.summary}` : ""}</span>
                  : <span className="status-plain st-u">Error{u.summary ? ` — ${u.summary}` : ""}</span>}</td>
              </tr>
            ))}</tbody></table></div>
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
          <div className="eng-head"><h3>Paid-actions PIN &amp; API credit</h3></div>
          <p className="note">Controls for every paid action in the app (Research more, Draft pitch, Research Queue, and the Refresh in Mission Control). None of this spends anything by itself.</p>
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
          <div className="eng-sub"><h4>Your API credit — check it first</h4>
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
          <p className="note">To actually spend this credit — refresh a region, update or discover companies — go to <a href="/?tab=reports">Dashboard → Mission Control → Search &amp; refresh</a>.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
