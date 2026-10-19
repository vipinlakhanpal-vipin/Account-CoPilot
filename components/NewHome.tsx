"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import HomeWorkspace from "@/components/HomeWorkspace";
import { ask, notify } from "@/components/Confirm";
import { normalizeDefinition, effectiveEngine, PRIORITY_ORDER } from "@/lib/icpDefinition.mjs";
import type { Access } from "@/lib/access";

export type BoardRegion = { key: string; name: string; status: string; priority: string; market: boolean; accounts: number; setNew: number; setVerify: number; newPerDay: number; verifyPerDay: number };
const STATE: Record<string, string> = { active: "Active", paused: "Paused", next: "Next phase" };
const PRIO: Record<string, string> = { high: "High", medium: "Medium", low: "Low" };

// Option A: a regions board. Each region shows its state, priority and accounts, and a Super Admin switches it on or off here, with a confirm that says what happens.
export default function NewHome({ access, regions: initial, total }: { access: Pick<Access, "isSuper" | "role" | "regions" | "email" | "ready">; regions: BoardRegion[]; total: number }) {
  const router = useRouter();
  const [regions, setRegions] = useState(initial);
  const [busy, setBusy] = useState("");
  const isSuper = access.isSuper;
  const activeN = regions.filter((r) => r.status === "active").length;

  const order = [...regions].sort((a, b) => (a.status === "active" ? 0 : 1) - (b.status === "active" ? 0 : 1) || PRIORITY_ORDER.indexOf(a.priority as "high") - PRIORITY_ORDER.indexOf(b.priority as "high") || a.name.localeCompare(b.name));

  // Reads the saved definition, changes one region, and saves it through the same route as Define ICP (which re-applies statuses and records history).
  async function save(key: string, change: (r: Record<string, any>) => void, done: (r: BoardRegion) => BoardRegion, okText: string) { // eslint-disable-line @typescript-eslint/no-explicit-any
    setBusy(key);
    try {
      const j = await (await fetch("/api/icp", { cache: "no-store" })).json();
      const def = normalizeDefinition(j.regions ? { regions: j.regions, version: j.version } : j);
      change(def.regions[key]);
      const res = await fetch("/api/icp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", definition: def }) });
      const out = await res.json();
      if (out.ok) { setRegions((all) => all.map((r) => (r.key === key ? done(r) : r))); notify(okText, "ok"); router.refresh(); }
      else notify(out.error || out.problems?.[0] || "Could not save.", "error");
    } catch { notify("Could not reach the server.", "error"); }
    setBusy("");
  }

  async function activate(r: BoardRegion) {
    const base = { engine: { discover_per_day: r.setNew || 5, verify_per_day: r.setVerify || 25 }, priority: r.priority };
    const e = effectiveEngine(base);
    const yes = await ask({ title: `Activate ${r.name}?`, confirm: "Activate", body: `${r.name} joins the daily run.`,
      points: [`It starts at the next 6am Dubai run, not now. To start sooner, use Find company → Find New Company.`, `Each morning: about ${e.discover_per_day} new companies and ${e.verify_per_day} revenue checks (${PRIO[r.priority]} priority).`, "It runs on your Claude plan, so it adds no API cost. A busy plan means every region's turn gets thinner."] });
    if (!yes) return;
    await save(r.key, (x) => { x.status = "active"; if (!x.engine.discover_per_day && !x.engine.verify_per_day) x.engine = { discover_per_day: 5, verify_per_day: 25 }; },
      (x) => ({ ...x, status: "active", newPerDay: e.discover_per_day, verifyPerDay: e.verify_per_day }), `${r.name} is Active. The engine starts there at the next 6am Dubai run.`);
  }
  async function pause(r: BoardRegion) {
    const yes = await ask({ title: `Pause ${r.name}?`, confirm: "Pause", body: `The engine stops looking for new ${r.name} companies and stops its daily checks. Its accounts, partners and contacts stay as they are, and you can activate it again at any time.` });
    if (!yes) return;
    await save(r.key, (x) => { x.status = "paused"; }, (x) => ({ ...x, status: "paused" }), `${r.name} is Paused.`);
  }
  async function setPriority(r: BoardRegion, p: string) {
    await save(r.key, (x) => { x.priority = p; }, (x) => { const e = effectiveEngine({ engine: { discover_per_day: x.setNew, verify_per_day: x.setVerify }, priority: p }); return { ...x, priority: p, newPerDay: e.discover_per_day, verifyPerDay: e.verify_per_day }; }, `${r.name} is now ${PRIO[p]} priority.`);
  }
  async function toggleMarket(r: BoardRegion) {
    await save(r.key, (x) => { x.market = !r.market; }, (x) => ({ ...x, market: !r.market }), `Market intelligence is ${r.market ? "off" : "on"} for ${r.name}.`);
  }

  return (
    <>
      <section className="panel">
        <div className="roles">
          <div className="metric-tile"><div className="note">Companies tracked</div><div style={{ fontSize: 24, fontWeight: 500 }}>{total.toLocaleString()}</div></div>
          <div className="metric-tile"><div className="note">Active regions</div><div style={{ fontSize: 24, fontWeight: 500 }}>{activeN} of {regions.length}</div></div>
        </div>
      </section>

      <section className="panel nh-board">
        <h2 className="nh-h">Your regions</h2>
        <p className="note">Switch a region on and the engine starts working it at the next 6am Dubai run. Priority decides how much of each morning a region gets. {isSuper ? "" : "A Super Admin switches regions on and off; you can see their state here."}</p>
        <div className="tablewrap"><table className="prose nh-table">
          <thead><tr><th>Region</th><th>State</th><th>Priority</th><th>Plan a day (new / checks)</th><th>Accounts</th><th>Market intelligence</th><th></th></tr></thead>
          <tbody>{order.map((r) => {
            const on = r.status === "active";
            return (
              <tr key={r.key} className={on ? "" : "nh-off"}>
                <td><b>{r.name}</b></td>
                <td><span className={`act-pill ${r.status}`}>{STATE[r.status] || r.status}</span></td>
                <td>{isSuper && on
                  ? <select className="nh-sel" aria-label={`${r.name} priority`} value={r.priority} disabled={busy === r.key} onChange={(e) => setPriority(r, e.target.value)}>{PRIORITY_ORDER.map((p: string) => <option key={p} value={p}>{PRIO[p]}</option>)}</select>
                  : on ? <span className={`bell-prio p-${r.priority}`}>{PRIO[r.priority]}</span> : <span className="muted">—</span>}</td>
                <td>{on ? `${r.newPerDay} / ${r.verifyPerDay}` : <span className="muted">—</span>}</td>
                <td>{r.accounts ? r.accounts.toLocaleString() : <span className="muted">none yet</span>}</td>
                <td>{on ? (isSuper
                  ? <button type="button" className={`nh-chip ${r.market ? "on" : ""}`} disabled={busy === r.key} onClick={() => toggleMarket(r)} aria-pressed={r.market} title="Partner and customer scans each morning">{r.market ? "On" : "Off"}</button>
                  : <span>{r.market ? "On" : "Off"}</span>) : <span className="muted">—</span>}</td>
                <td className="nh-act">{isSuper
                  ? (on ? <button type="button" className="btn tiny" disabled={busy === r.key} onClick={() => pause(r)}>Pause</button>
                      : <button type="button" className="btn tiny primary" disabled={busy === r.key} onClick={() => activate(r)}>{busy === r.key ? "Saving…" : "Activate"}</button>)
                  : <span className="muted">Ask a Super Admin</span>}</td>
              </tr>);
          })}</tbody></table></div>
        {regions.length === 0 && <p className="note">No region is assigned to you yet. Ask a Super Admin to add one in Setup → Team.</p>}
      </section>

      <HomeWorkspace access={access as Access} />
    </>
  );
}
