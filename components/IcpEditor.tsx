"use client";
import { useMemo, useState } from "react";
import { REGIONS, OPTIONS, DEFAULT_RULES, normalizeDefinition, validateRules, summarizeRules, type Definition, type Rules } from "@/lib/icpDefinition.mjs";

type Impact = Record<string, { before: Record<string, number>; after: Record<string, number>; changes: { company: string; from: string; to: string; why: string }[] }>;
type Result = { ok: boolean; problems?: string[]; impact?: Impact; changed?: number; changes?: string[]; saved?: { version: number; at: string; by: string }; error?: string };

const STATUSES = ["ICP — Verified", "ICP — Likely", "ICP — Needs check", "Unknown", "Not ICP"];
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Dubai", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

/** What a parameter drives, so nobody wonders whether a setting is used. */
const Uses = ({ items }: { items: ("Status" | "Discovery" | "Verification" | "Pipeline" | "Contacts" | "Daily run")[] }) => (
  <span className="icp-uses">{items.map((i) => <span key={i} className={`icp-use u-${i.toLowerCase().replace(" ", "")}`}>{i}</span>)}</span>);

function Chips({ options, value, onChange, empty }: { options: string[]; value: string[]; onChange: (v: string[]) => void; empty?: string }) {
  return (
    <div className="icp-chips">
      {options.map((o) => {
        const on = value.includes(o);
        return <button type="button" key={o} className={`icp-chip${on ? " on" : ""}`} aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}>{on ? "✓ " : ""}{o}</button>;
      })}
      {empty && !value.length && <span className="icp-hint">{empty}</span>}
    </div>
  );
}
function Num({ label, value, onChange, suffix, allowBlank, step = 1, help }: { label: string; value: number | null; onChange: (v: number | null) => void; suffix?: string; allowBlank?: boolean; step?: number; help?: string }) {
  return (
    <label className="icp-field"><span>{label}</span>
      <span className="icp-num"><input type="number" step={step} value={value ?? ""} placeholder={allowBlank ? "No limit" : ""}
        onChange={(e) => onChange(e.target.value === "" ? (allowBlank ? null : 0) : Number(e.target.value))} />{suffix && <em>{suffix}</em>}</span>
      {help && <small>{help}</small>}
    </label>
  );
}
function Radio({ options, value, onChange }: { options: [string, string][]; value: string; onChange: (v: string) => void }) {
  return <div className="icp-radio">{options.map(([k, l]) => <label key={k} className={value === k ? "on" : ""}><input type="radio" checked={value === k} onChange={() => onChange(k)} />{l}</label>)}</div>;
}
function Toggle({ label, value, onChange, help }: { label: string; value: boolean; onChange: (v: boolean) => void; help?: string }) {
  return <label className="icp-toggle"><input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} /><span>{label}{help && <small>{help}</small>}</span></label>;
}

export default function IcpEditor({ initial, counts }: { initial: Definition; counts: Record<string, number> }) {
  const [saved, setSaved] = useState<Definition>(normalizeDefinition(initial));
  const [def, setDef] = useState<Definition>(normalizeDefinition(initial));
  const [region, setRegion] = useState("UAE");
  const [busy, setBusy] = useState<"" | "preview" | "save">("");
  const [result, setResult] = useState<Result | null>(null);
  const [copyFrom, setCopyFrom] = useState("");
  const r = def.regions[region];
  const dirty = JSON.stringify(def.regions) !== JSON.stringify(saved.regions);
  const dirtyRegions = REGIONS.filter(({ key }) => JSON.stringify(def.regions[key]) !== JSON.stringify(saved.regions[key])).map((x) => x.key);
  const problems = useMemo(() => REGIONS.flatMap(({ key }) => validateRules(key, def.regions[key])), [def]);
  const set = (fn: (x: Rules) => void) => { setDef((d) => { const n = clone(d); fn(n.regions[region]); return n; }); setResult(null); };

  async function call(action: "preview" | "save") {
    if (action === "save" && !window.confirm(`Save the ICP definition and apply it now?\n\nChanged: ${dirtyRegions.join(", ") || "nothing"}.\nEvery company's ICP status is recalculated straight away, the Pipeline follows the new weights, and the next 6am run uses these rules.`)) return;
    setBusy(action); setResult(null);
    try {
      const res = await fetch("/api/icp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, definition: def }) });
      const j: Result = await res.json();
      setResult(j);
      if (action === "save" && j.ok && j.saved) {
        const n: Definition = { ...def, version: j.saved.version, updated_at: j.saved.at, updated_by: j.saved.by,
          history: [{ at: j.saved.at, by: j.saved.by, summary: (j.changes || []).join(" | ") || "Saved with no changes" }, ...(def.history || [])] };
        setSaved(n); setDef(n);
      }
    } catch { setResult({ ok: false, error: "Could not reach the server." }); }
    setBusy("");
  }

  const w = r.pipeline.w_match + r.pipeline.w_opportunity + r.pipeline.w_fit;
  return (
    <div className="icp-editor">
      <div className="icp-top panel">
        <div>
          <p className="icp-kicker">ICP definition v{saved.version || 1}</p>
          <p className="note">{saved.updated_at ? <>Last saved {when(saved.updated_at)} by <b>{saved.updated_by}</b>.</> : <>Using the default rules (never edited). Everything below is what the agent follows today.</>}</p>
        </div>
        <div className="icp-actions">
          {dirty && <span className="icp-dirty">Unsaved changes: {dirtyRegions.join(", ")}</span>}
          <button type="button" className="btn" disabled={!dirty || !!busy} onClick={() => { setDef(clone(saved)); setResult(null); }}>Discard changes</button>
          <button type="button" className="btn" disabled={!!busy || !!problems.length} onClick={() => call("preview")}>{busy === "preview" ? "Checking…" : "Preview impact"}</button>
          <button type="button" className="btn primary" disabled={!dirty || !!busy || !!problems.length} onClick={() => call("save")}>{busy === "save" ? "Saving…" : "Save & apply"}</button>
        </div>
      </div>

      <nav className="icp-regions" aria-label="Regions">
        {REGIONS.map(({ key, name }) => {
          const st = def.regions[key].status;
          return (
            <button type="button" key={key} className={`icp-region${region === key ? " on" : ""}`} onClick={() => setRegion(key)} title={name}>
              <span className={`dot s-${st}`} />{key}{dirtyRegions.includes(key) && <b className="icp-star" title="Unsaved changes">•</b>}
              <small>{st === "active" ? "Active" : st === "paused" ? "Paused" : "Next phase"}{counts[key] ? ` · ${counts[key]} accounts` : ""}</small>
            </button>
          );
        })}
      </nav>

      {problems.length > 0 && <div className="icp-problems panel"><b>Fix before saving:</b><ul>{problems.map((p) => <li key={p}>{p}</li>)}</ul></div>}

      <p className="icp-summary">{summarizeRules(region, r)}</p>

      <div className="icp-grid">
        <section className="panel icp-card">
          <h3>1 · Region & daily run <Uses items={["Daily run"]} /></h3>
          <Radio options={OPTIONS.status} value={r.status} onChange={(v) => set((x) => { x.status = v as Rules["status"]; })} />
          <div className="icp-row">
            <Num label="New companies to find per day" value={r.engine.discover_per_day} onChange={(v) => set((x) => { x.engine.discover_per_day = v || 0; })} help="0–50. Only for active regions." />
            <Num label="Companies to verify per day" value={r.engine.verify_per_day} onChange={(v) => set((x) => { x.engine.verify_per_day = v || 0; })} help="0–60. The new ones first, then the queue." />
          </div>
          <div className="icp-row">
            <label className="icp-field"><span>Local currency</span><input value={r.currency.code} onChange={(e) => set((x) => { x.currency.code = e.target.value.toUpperCase().slice(0, 4); })} /></label>
            <Num label={`${r.currency.code} per 1 USD`} value={r.currency.per_usd} step={0.0001} onChange={(v) => set((x) => { x.currency.per_usd = v || 0; })} help="Used to convert local revenue to USD." />
          </div>
        </section>

        <section className="panel icp-card">
          <h3>2 · Company size <Uses items={["Status", "Discovery", "Verification"]} /></h3>
          <div className="icp-row">
            <Num label="Minimum revenue" suffix="USD M" value={r.revenue.min_usd_m} onChange={(v) => set((x) => { x.revenue.min_usd_m = v || 0; })} help="At or above this = ICP (Verified when official)." />
            <Num label="Maximum revenue" suffix="USD M" allowBlank value={r.revenue.max_usd_m} onChange={(v) => set((x) => { x.revenue.max_usd_m = v; })} help="Leave blank for no ceiling." />
          </div>
          <div className="icp-row">
            <Num label="Minimum employees" value={r.employees.min} onChange={(v) => set((x) => { x.employees.min = v || 0; })} help="Known headcount below this = Not ICP." />
            <Num label="Maximum employees" allowBlank value={r.employees.max} onChange={(v) => set((x) => { x.employees.max = v; })} help="Leave blank for no ceiling." />
          </div>
          <div className="icp-row three">
            <label className="icp-field"><span>Revenue measure (general)</span><select value={r.revenue.basis_general} onChange={(e) => set((x) => { x.revenue.basis_general = e.target.value; })}>{["Net revenue", "Gross revenue", "Total income"].map((o) => <option key={o}>{o}</option>)}</select></label>
            <label className="icp-field"><span>Banks</span><select value={r.revenue.basis_banks} onChange={(e) => set((x) => { x.revenue.basis_banks = e.target.value; })}>{["Total operating income", "Net interest income", "Total assets (not revenue)"].map((o) => <option key={o}>{o}</option>)}</select></label>
            <label className="icp-field"><span>Insurers</span><select value={r.revenue.basis_insurers} onChange={(e) => set((x) => { x.revenue.basis_insurers = e.target.value; })}>{["Insurance revenue (or GWP)", "Gross written premium", "Net earned premium"].map((o) => <option key={o}>{o}</option>)}</select></label>
          </div>
        </section>

        <section className="panel icp-card">
          <h3>3 · Company type <Uses items={["Status", "Discovery"]} /></h3>
          <p className="icp-label">Stock listing</p>
          <Radio options={OPTIONS.listing} value={r.listing} onChange={(v) => set((x) => { x.listing = v as Rules["listing"]; })} />
          <p className="icp-label">Ownership types allowed</p>
          <Chips options={OPTIONS.ownership} value={r.ownership_allowed} onChange={(v) => set((x) => { x.ownership_allowed = v; })} />
          <p className="icp-label">Which entity to target</p>
          <Radio options={OPTIONS.entity} value={r.entity_level} onChange={(v) => set((x) => { x.entity_level = v as Rules["entity_level"]; })} />
        </section>

        <section className="panel icp-card">
          <h3>4 · Industries <Uses items={["Status", "Discovery"]} /></h3>
          <p className="icp-label">Include only these industries</p>
          <Chips options={OPTIONS.industries} value={r.industries_include} onChange={(v) => set((x) => { x.industries_include = v; })} empty="None selected = all industries." />
          <p className="icp-label">Always exclude</p>
          <Chips options={OPTIONS.industries} value={r.industries_exclude} onChange={(v) => set((x) => { x.industries_exclude = v; })} empty="None excluded." />
        </section>

        <section className="panel icp-card">
          <h3>5 · Never add <Uses items={["Discovery"]} /></h3>
          <Toggle label="Ministries and government bodies" value={r.exclude.government_bodies} onChange={(v) => set((x) => { x.exclude.government_bodies = v; })} />
          <Toggle label="Single hotels, hospitals, schools or attractions" value={r.exclude.single_sites} onChange={(v) => set((x) => { x.exclude.single_sites = v; })} help="Their group HQ can still qualify." />
          <Toggle label="Local branches of foreign groups" value={r.exclude.foreign_branches} onChange={(v) => set((x) => { x.exclude.foreign_branches = v; })} help="Not the decision-making entity." />
          <label className="icp-field"><span>Other exclusions (names or words, comma-separated)</span>
            <input value={r.exclude.keywords} placeholder="e.g. free zone authority, REIT" onChange={(e) => set((x) => { x.exclude.keywords = e.target.value; })} /></label>
        </section>

        <section className="panel icp-card">
          <h3>6 · Evidence & verification <Uses items={["Status", "Verification"]} /></h3>
          <p className="icp-label">Sources that can make a company <b>Verified</b></p>
          <Chips options={OPTIONS.verifiedSources} value={r.evidence.verified_sources} onChange={(v) => set((x) => { x.evidence.verified_sources = v; })} />
          <Toggle label="Estimates can make a company Likely" value={r.evidence.estimates_can_make_likely} onChange={(v) => set((x) => { x.evidence.estimates_can_make_likely = v; })}
            help="Off = anything without an official figure stays Needs check." />
          <div className="icp-row">
            <Num label="Not ICP (estimate) below" suffix="USD M" value={r.evidence.not_icp_estimate_below_usd_m} onChange={(v) => set((x) => { x.evidence.not_icp_estimate_below_usd_m = v || 0; })} />
            <Num label="…and staff at most" value={r.evidence.not_icp_estimate_max_staff} onChange={(v) => set((x) => { x.evidence.not_icp_estimate_max_staff = v || 0; })} help="Reopened if an official figure appears." />
          </div>
          <div className="icp-row">
            <Num label="Seamless band counts as Likely from" suffix="staff" value={r.evidence.seamless_likely_min_staff} onChange={(v) => set((x) => { x.evidence.seamless_likely_min_staff = v || 0; })} help="Below this, a Seamless band alone gives Needs check." />
            <Num label="Re-check every" suffix="days" value={r.evidence.recheck_days} onChange={(v) => set((x) => { x.evidence.recheck_days = v || 0; })} help="Non-Verified companies; growing ones move up." />
          </div>
        </section>

        <section className="panel icp-card">
          <h3>7 · Pipeline & priorities <Uses items={["Pipeline"]} /></h3>
          <div className="icp-row three">
            <Num label="ICP Match weight" suffix="%" value={r.pipeline.w_match} onChange={(v) => set((x) => { x.pipeline.w_match = v || 0; })} />
            <Num label="Opportunity weight" suffix="%" value={r.pipeline.w_opportunity} onChange={(v) => set((x) => { x.pipeline.w_opportunity = v || 0; })} />
            <Num label="Coupa Fit weight" suffix="%" value={r.pipeline.w_fit} onChange={(v) => set((x) => { x.pipeline.w_fit = v || 0; })} />
          </div>
          <p className={`icp-hint${w !== 100 ? " bad" : ""}`}>Weights add up to {w}%{w !== 100 ? " — must be 100%" : ""}.</p>
          <div className="icp-row">
            <Num label="Minimum ICP Match to enter Pipeline" value={r.pipeline.min_match} onChange={(v) => set((x) => { x.pipeline.min_match = v || 0; })} help="0–100." />
            <Toggle label="Keep Not ICP accounts out of the Pipeline" value={r.pipeline.exclude_not_icp} onChange={(v) => set((x) => { x.pipeline.exclude_not_icp = v; })} />
          </div>
          <p className="icp-label">Focus platforms (signals the agent looks for)</p>
          <Chips options={OPTIONS.platforms} value={r.focus.platforms} onChange={(v) => set((x) => { x.focus.platforms = v; })} />
          <p className="icp-label">ERP of interest</p>
          <Chips options={OPTIONS.erp} value={r.focus.erp} onChange={(v) => set((x) => { x.focus.erp = v; })} empty="Any ERP." />
          <p className="icp-label">Buying triggers to prioritise</p>
          <Chips options={OPTIONS.triggers} value={r.focus.triggers} onChange={(v) => set((x) => { x.focus.triggers = v; })} empty="No specific trigger." />
        </section>

        <section className="panel icp-card">
          <h3>8 · Buyer personas <Uses items={["Contacts"]} /></h3>
          <p className="icp-label">Departments</p>
          <Chips options={OPTIONS.departments} value={r.personas.departments} onChange={(v) => set((x) => { x.personas.departments = v; })} />
          <p className="icp-label">Seniority</p>
          <Chips options={OPTIONS.seniority} value={r.personas.seniority} onChange={(v) => set((x) => { x.personas.seniority = v; })} />
          <p className="icp-label">Priority roles</p>
          <Chips options={OPTIONS.roles} value={r.personas.roles} onChange={(v) => set((x) => { x.personas.roles = v; })} empty="Any role in the departments above." />
          <Num label="Contacts to research per account (max)" value={r.personas.max_per_account} onChange={(v) => set((x) => { x.personas.max_per_account = v || 0; })} />
        </section>

        <section className="panel icp-card wide">
          <h3>9 · Notes for the agent <Uses items={["Discovery", "Verification"]} /></h3>
          <textarea rows={3} value={r.notes} placeholder="Anything else the agent must follow for this region, in plain words (e.g. 'include Saudi giga-projects as groups', 'skip real-estate developers under construction only')."
            onChange={(e) => set((x) => { x.notes = e.target.value; })} />
          <div className="icp-tools">
            <label>Copy all rules from <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}><option value="">choose a region…</option>
              {REGIONS.filter((x) => x.key !== region).map((x) => <option key={x.key} value={x.key}>{x.key}</option>)}</select></label>
            <button type="button" className="btn" disabled={!copyFrom} onClick={() => { const src = clone(def.regions[copyFrom]); set((x) => { Object.assign(x, src, { status: x.status, currency: x.currency, engine: x.engine }); }); setCopyFrom(""); }}>Copy</button>
            <button type="button" className="btn" onClick={() => { if (window.confirm(`Reset ${region} to the default rules?`)) set((x) => { Object.assign(x, clone(DEFAULT_RULES), { status: x.status, currency: x.currency, engine: x.engine }); }); }}>Reset {region} to defaults</button>
          </div>
        </section>
      </div>

      {result && (
        <section className={`panel icp-result${result.ok ? "" : " bad"}`}>
          {result.error && <p>{result.error}</p>}
          {result.problems && result.problems.length > 0 && <><b>Not saved — fix these first:</b><ul>{result.problems.map((p) => <li key={p}>{p}</li>)}</ul></>}
          {result.saved && <p className="icp-ok">Saved as v{result.saved.version} and applied: {result.changed} account{result.changed === 1 ? "" : "s"} changed status. The Pipeline and the next 6am run now follow these rules.</p>}
          {!result.saved && result.impact && <p><b>Preview:</b> {result.changed} account{result.changed === 1 ? "" : "s"} would change status. Nothing has been saved yet.</p>}
          {result.impact && (
            <div className="tablewrap"><table><thead><tr><th>Region</th>{STATUSES.map((s) => <th key={s}>{s.replace("ICP — ", "")}</th>)}</tr></thead>
              <tbody>{Object.entries(result.impact).map(([k, v]) => (
                <tr key={k}><td>{k}</td>{STATUSES.map((s) => { const a = v.before[s] || 0, b = v.after[s] || 0; return <td key={s}>{b}{a !== b && <em className={b > a ? "up" : "down"}> ({b > a ? "+" : ""}{b - a})</em>}</td>; })}</tr>))}</tbody></table></div>
          )}
          {result.impact && Object.values(result.impact).some((v) => v.changes.length) && (
            <details open={!result.saved}><summary>Accounts that change</summary>
              <ul className="icp-changes">{Object.values(result.impact).flatMap((v) => v.changes).slice(0, 60).map((c, i) => (
                <li key={i}><b>{c.company}</b>: {c.from} → <b>{c.to}</b><br /><small>{c.why}</small></li>))}</ul></details>
          )}
        </section>
      )}

      <section className="panel icp-history">
        <h3>Change history</h3>
        {saved.history?.length ? <ul>{saved.history.slice(0, 15).map((h, i) => <li key={i}><b>{when(h.at)}</b> · {h.by}<br /><small>{h.summary}</small></li>)}</ul>
          : <p className="note">No changes yet. Every save is recorded here with who made it and what changed.</p>}
      </section>
    </div>
  );
}
