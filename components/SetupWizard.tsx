"use client";
import { useEffect, useMemo, useState } from "react";
import { REGIONS, OPTIONS, normalizeDefinition, type Definition, type Rules } from "@/lib/icpDefinition.mjs";
import type { Access } from "@/lib/access";
import { ask, notify } from "@/components/Confirm";

// Setup Wizard: a plain-English front door onto the real Define ICP settings (Setup → Define ICP). It reads and writes
// the exact same settings.icp_definition record that page uses — there's no separate wizard-only config to drift out of
// sync. Re-opening it always reflects whatever is currently saved, which is how "go back and edit your answers" works.
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const STEPS = ["Region", "Existing data", "Company size", "Who you're after", "Data sources", "Daily plan", "Review"] as const;

type Sources = { seamless: boolean; lusha: boolean; zoominfo: boolean; crunchbase: boolean; other: string };

export default function SetupWizard({ access }: { access: Access }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [def, setDef] = useState<Definition | null>(null);
  const visibleRegions = useMemo(() => REGIONS.filter((r) => access.isSuper || access.regions.includes(r.key)), [access]);
  const [region, setRegion] = useState(visibleRegions[0]?.key || "UAE");
  const [hasList, setHasList] = useState<"yes" | "no" | "">("");
  const [domains, setDomains] = useState<string[]>([]);
  const [sources, setSources] = useState<Sources>({ seamless: false, lusha: false, zoominfo: false, crunchbase: false, other: "" });
  const [activateNow, setActivateNow] = useState(true);

  async function loadForRegion(key: string, jumpIfConfigured: boolean) {
    setLoading(true);
    try {
      const res = await fetch("/api/icp");
      const j = await res.json();
      const d = normalizeDefinition(j.regions ? { regions: j.regions, version: j.version } : j);
      setDef(d);
      const r = d.regions[key];
      if (r) {
        setDomains(OPTIONS.domains.filter((x) => r.personas.departments.includes(x.department)).map((x) => x.key));
        setActivateNow(r.status === "active");
        // Already configured (Active or Next phase, not the untouched default Paused)? Jump straight to Review — "editing your
        // answers" is then just clicking a step pill, not re-walking the whole flow.
        if (jumpIfConfigured && r.status !== "paused") setStep(STEPS.length - 1);
      }
    } catch { notify("Could not load Define ICP settings.", "error"); }
    setLoading(false);
  }
  useEffect(() => {
    if (!open) return;
    loadForRegion(region, true);
    fetch("/api/wizard-sources").then((r) => r.json()).then((s) => { if (s && typeof s === "object") setSources((cur) => ({ ...cur, ...s })); }).catch(() => {});
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [open]);
  useEffect(() => { if (open) loadForRegion(region, false); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [region]);
  const saveSources = (next: Sources) => { setSources(next); fetch("/api/wizard-sources", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) }).catch(() => {}); };

  const r: Rules | null = def?.regions[region] || null;
  const setR = (fn: (x: Rules) => void) => setDef((d) => { if (!d) return d; const n = clone(d); fn(n.regions[region]); return n; });

  async function save() {
    if (!def || !r) return;
    if (!(await ask({ title: "Save this setup?", confirm: "Save & apply", body: `Applies to ${REGIONS.find((x) => x.key === region)?.name}.`,
      points: ["Every company's ICP status is recalculated straight away.", "The next 6am run uses these rules."] }))) return;
    setSaving(true);
    const chosenDepts = domains.map((k) => OPTIONS.domains.find((x) => x.key === k)?.department).filter((x): x is string => !!x);
    const extraTriggers = domains.flatMap((k) => OPTIONS.domains.find((x) => x.key === k)?.extraTriggers || []);
    const n = clone(def);
    const target = n.regions[region];
    target.personas.departments = [...new Set(chosenDepts.length ? chosenDepts : target.personas.departments)];
    target.focus.triggers = [...new Set([...target.focus.triggers, ...extraTriggers])];
    if (activateNow) target.status = "active";
    try {
      const res = await fetch("/api/icp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", definition: n }) });
      const j = await res.json();
      if (j.ok) { notify(`Saved and applied — ${j.changed || 0} account${j.changed === 1 ? "" : "s"} changed status.`, "ok"); setDef(n); setStep(0); setOpen(false); }
      else notify(j.error || j.problems?.[0] || "Could not save.", "error");
    } catch { notify("Could not reach the server.", "error"); }
    setSaving(false);
  }

  if (!open) return (
    <section className="panel" style={{ border: "1.5px solid color-mix(in srgb, var(--gold) 45%, var(--line))" }}>
      <h2>Setup Wizard</h2>
      <p>Answer a few plain questions and I'll configure your Ideal Customer Profile for you — company size, who you're targeting, your data sources, and the daily plan. Takes a few minutes, and you can come back and change any answer later.</p>
      <button type="button" className="btn primary" onClick={() => setOpen(true)}>Start setup wizard</button>
    </section>
  );

  return (
    <section className="panel">
      <h2>Setup Wizard — {REGIONS.find((x) => x.key === region)?.name || region}</h2>
      <div className="roles" style={{ marginBottom: 10 }}>{STEPS.map((s, i) => <span key={s} role="button" tabIndex={0} onClick={() => setStep(i)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setStep(i); }}
        className={`tag ${i === step ? "fact" : i < step ? "likely" : "unv"}`} style={{ cursor: "pointer" }}>{i + 1}. {s}</span>)}</div>
      {loading || !r ? <p className="note">Loading your current settings…</p> : <>

      {step === 0 && <div>
        <p><b>Which region are you setting up?</b></p>
        <select value={region} onChange={(e) => setRegion(e.target.value)}>{visibleRegions.map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}</select>
      </div>}

      {step === 1 && <div>
        <p><b>Do you already have a validated list of companies for {REGIONS.find((x) => x.key === region)?.name}</b> — for example an Excel workbook you've profiled before, like the one used for UAE?</p>
        <div className="roles">
          <button type="button" className={`btn ${hasList === "yes" ? "primary" : ""}`} onClick={() => setHasList("yes")}>Yes, I have one</button>
          <button type="button" className={`btn ${hasList === "no" ? "primary" : ""}`} onClick={() => setHasList("no")}>No — help me build one from scratch</button>
        </div>
        {hasList === "yes" && <p className="note">Good — import it the way the UAE workbook was imported (ask me to do this any time), and the daily engine will verify and extend it from there.</p>}
        {hasList === "no" && <p className="note">No problem — the free daily engine can build your list from nothing. I'll suggest a starting pace in the Daily plan step.</p>}
      </div>}

      {step === 2 && <div>
        <p><b>Company size — a company must meet both to count.</b></p>
        <label>Minimum net revenue (USD millions)<input type="number" min={0} value={r.revenue.min_usd_m} onChange={(e) => setR((x) => { x.revenue.min_usd_m = Number(e.target.value) || 0; })} /></label>
        <label>Minimum employees<input type="number" min={0} value={r.employees.min} onChange={(e) => setR((x) => { x.employees.min = Number(e.target.value) || 0; })} /></label>
        <label>Stock listing<select value={r.listing} onChange={(e) => setR((x) => { x.listing = e.target.value as Rules["listing"]; })}>{OPTIONS.listing.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label>Which entities count<select value={r.entity_level} onChange={(e) => setR((x) => { x.entity_level = e.target.value as Rules["entity_level"]; })}>{OPTIONS.entity.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      </div>}

      {step === 3 && <div>
        <p><b>Which domains do you want to target?</b> Pick as many as apply — this decides which people at each company matter most.</p>
        <div className="roles">{OPTIONS.domains.map((d) => <button key={d.key} type="button" className={`btn tiny ${domains.includes(d.key) ? "primary" : ""}`}
          onClick={() => setDomains((v) => v.includes(d.key) ? v.filter((x) => x !== d.key) : [...v, d.key])}>{d.label}</button>)}</div>
      </div>}

      {step === 4 && <div>
        <p><b>Which data sources do you have or want to use?</b> This just records your answer — I'll tell you how to connect each one.</p>
        <p className="note">Seamless.ai and Lusha are already connected on this account and free to use for enrichment.</p>
        <div className="roles">
          <label><input type="checkbox" checked disabled /> Seamless.ai — connected</label>
          <label><input type="checkbox" checked disabled /> Lusha — connected</label>
          <label><input type="checkbox" checked={sources.zoominfo} onChange={(e) => saveSources({ ...sources, zoominfo: e.target.checked })} /> ZoomInfo — available as a Claude connector; needs your authorization in Claude's connector settings</label>
          <label><input type="checkbox" checked={sources.crunchbase} onChange={(e) => saveSources({ ...sources, crunchbase: e.target.checked })} /> Crunchbase — available as a Claude connector; needs your authorization</label>
        </div>
        <label>Other subscription you have (e.g. Refinitiv, Dun &amp; Bradstreet)<input type="text" placeholder="e.g. Refinitiv" value={sources.other} onChange={(e) => setSources((s) => ({ ...s, other: e.target.value }))} onBlur={() => saveSources(sources)} /></label>
        {sources.other.trim() && <p className="note">Noted. These aren't connected to Claude yet — if you can get a Claude connector or MCP server for {sources.other}, ask me and I'll wire it into your research once it's available; otherwise send exports and I'll fold them in by hand.</p>}
        <p className="note">Even with none of the above, the free daily engine (your own Claude plan, not the Anthropic API) can still find and verify companies with its own web search — see the next step.</p>
      </div>}

      {step === 5 && <div>
        <p><b>Daily plan</b> — how much should the free daily engine do each morning?</p>
        <p className="note">{hasList === "no" ? "Since you're starting from nothing, a faster discovery pace makes sense at first." : "Suggested pace for extending an existing list."} A good starting point: find {hasList === "no" ? "10" : "5"} new companies a day, and verify {hasList === "no" ? "30" : "50"} existing ones.</p>
        <label>New companies to find per day<input type="number" min={0} max={50} value={r.engine.discover_per_day} onChange={(e) => setR((x) => { x.engine.discover_per_day = Number(e.target.value) || 0; })} /></label>
        <label>Companies to verify per day<input type="number" min={0} max={60} value={r.engine.verify_per_day} onChange={(e) => setR((x) => { x.engine.verify_per_day = Number(e.target.value) || 0; })} /></label>
        <label><input type="checkbox" checked={activateNow} onChange={(e) => setActivateNow(e.target.checked)} /> Activate this region's daily run now (otherwise these rules are saved but the daily engine stays paused for {REGIONS.find((x) => x.key === region)?.name})</label>
      </div>}

      {step === 6 && <div>
        <p><b>Review</b></p>
        <ul className="plain note">
          <li>Region: <b>{REGIONS.find((x) => x.key === region)?.name}</b>, {activateNow ? "will be Active" : "stays as-is"}</li>
          <li>Company size: revenue ≥ ${r.revenue.min_usd_m}M, employees ≥ {r.employees.min}, {OPTIONS.listing.find(([v]) => v === r.listing)?.[1]}</li>
          <li>Targeting: {domains.length ? domains.map((k) => OPTIONS.domains.find((x) => x.key === k)?.label).join(", ") : "no change to current targeting"}</li>
          <li>Daily plan: find {r.engine.discover_per_day}, verify {r.engine.verify_per_day} per day</li>
        </ul>
        <button type="button" className="btn primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save & apply"}</button>
      </div>}

      <div className="row-actions" style={{ marginTop: 14 }}>
        {step > 0 && <button type="button" className="btn ghost" onClick={() => setStep((s) => s - 1)}>Back</button>}
        {step < STEPS.length - 1 && <button type="button" className="btn" onClick={() => setStep((s) => s + 1)}>Next</button>}
        <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Close</button>
      </div>
      </>}
    </section>
  );
}
