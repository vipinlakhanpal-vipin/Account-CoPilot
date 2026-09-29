"use client";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { REGIONS, OPTIONS, normalizeDefinition, type Definition, type Rules } from "@/lib/icpDefinition.mjs";
import type { Access } from "@/lib/access";
import { ask, notify } from "@/components/Confirm";

// Home workspace: a left rail with two destinations — About Account CoPilot (always free to read) and Setup Wizard
// (reads and writes the exact settings.icp_definition record Setup → Define ICP uses, so there's no separate config to
// drift out of sync). The wizard's 7 steps live as their own collapsible list under Setup Wizard, colour-coded by what
// they configure: region/size in teal, targeting in gold, sources/pace in sky, review neutral.
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

// Seamless.ai is the only source actually wired into this app today (lib/sources.ts, scripts/apply_verification.mjs) —
// everything else here is just the user's own inventory of what they subscribe to, recorded for later, not a live
// connection. Never mark anything "connected" unless it genuinely is.
type Sources = { checked: string[]; custom: string[] };
const KNOWN_SOURCES = ["ZoomInfo", "Crunchbase", "Lusha", "Dun & Bradstreet", "Refinitiv", "Thomson Reuters"];
type Draft = { revenue: number; employees: number; listing: Rules["listing"]; entity: Rules["entity_level"]; discoverPerDay: number; verifyPerDay: number };

const ICON = {
  pin: (<><path d="M12 21s7-7.58 7-12a7 7 0 0 0-14 0c0 4.42 7 12 7 12z" /><circle cx="12" cy="9" r="2.4" /></>),
  folder: (<><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5" /><path d="M9 13h7M9 17h7" /></>),
  building: (<><rect x="5" y="3" width="9" height="18" /><rect x="14" y="9" width="6" height="12" /><path d="M8 7h2M8 11h2M8 15h2" /></>),
  crosshair: (<><circle cx="12" cy="12" r="7" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /></>),
  database: (<><ellipse cx="12" cy="5" rx="7" ry="2.6" /><path d="M5 5v6c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V5" /><path d="M5 11v6c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6v-6" /></>),
  calendar: (<><rect x="3.5" y="5" width="17" height="16" rx="1.5" /><path d="M3.5 9.5h17M8 3v4M16 3v4" /></>),
  clipboard: (<><rect x="5.5" y="4" width="13" height="17" rx="1.5" /><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" /><path d="M9 12.5l2 2 4-4.5" /></>),
  book: (<><path d="M12 6c-2.5-1.2-5.2-1.2-7 0v12c1.8-1.2 4.5-1.2 7 0z" /><path d="M12 6c2.5-1.2 5.2-1.2 7 0v12c-1.8-1.2-4.5-1.2-7 0z" /><path d="M12 6v12" /></>),
  wand: (<><path d="M4.5 19.5L14 10" /><path d="M17.5 2.2 18.6 4.4 20.8 5.5 18.6 6.6 17.5 8.8 16.4 6.6 14.2 5.5 16.4 4.4Z" fill="currentColor" stroke="none" /><path d="M19 13.3 19.6 14.4 20.7 15 19.6 15.6 19 16.7 18.4 15.6 17.3 15 18.4 14.4Z" fill="currentColor" stroke="none" /><path d="M7 3 7.6 4 7 5 6.4 4Z" fill="currentColor" stroke="none" /></>),
  grid: (<><rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.2" /><rect x="13" y="3.5" width="7.5" height="7.5" rx="1.2" /><rect x="3.5" y="13" width="7.5" height="7.5" rx="1.2" /><rect x="13" y="13" width="7.5" height="7.5" rx="1.2" /></>),
  coin: (<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v9M9.3 9.7c0-1.2 1.2-2 2.7-2s2.7.8 2.7 2c0 2.6-5.4 1.4-5.4 4 0 1.2 1.2 2 2.7 2s2.7-.8 2.7-2" /></>),
  search: (<><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.3 15.3L21 21" /><path d="M7.5 10.5l2 2 3.5-4" /></>),
  target: (<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /></>),
} as const;

function Ico({ name }: { name: keyof typeof ICON }) {
  return <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICON[name]}</svg>;
}
const stepColor = (v: string): CSSProperties => ({ "--step-color": v } as CSSProperties);
const usdM = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(2).replace(/\.?0+$/, "")}B` : `$${n}M`);
// Same per-company rates published in Setup → Learn Me → Costs & usage (components/CostInfo.tsx) — kept in sync with those, not re-derived.
const fmtUsd = (n: number) => `$${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}`;
const costRange = (u: number | [number, number], n: number) => (Array.isArray(u) ? `${fmtUsd(u[0] * n)}–${fmtUsd(u[1] * n)}` : fmtUsd(u * n));
const PROFILE_TIERS: { label: string; unit: number | [number, number]; note: string }[] = [
  { label: "Quick", unit: 0.55, note: "fast pass, ~5 searches" },
  { label: "Standard", unit: [1.2, 1.5], note: "more sources, ~10 searches" },
  { label: "Deep", unit: [2.5, 3.5], note: "most thorough, ~20 searches" },
];

const STEPS: { n: number; label: string; icon: keyof typeof ICON; cls: string }[] = [
  { n: 1, label: "Region", icon: "pin", cls: "hw-step--region" },
  { n: 2, label: "Existing data", icon: "folder", cls: "hw-step--region" },
  { n: 3, label: "Company size", icon: "building", cls: "hw-step--region" },
  { n: 4, label: "Who you're after", icon: "crosshair", cls: "hw-step--people" },
  { n: 5, label: "Data sources", icon: "database", cls: "hw-step--data" },
  { n: 6, label: "Daily plan", icon: "calendar", cls: "hw-step--data" },
  { n: 7, label: "Review", icon: "clipboard", cls: "hw-step--review" },
];

export default function HomeWorkspace({ access }: { access: Access }) {
  const [section, setSection] = useState<"about" | "wizard">("about");
  const [expanded, setExpanded] = useState(true);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [def, setDef] = useState<Definition | null>(null);
  const visibleRegions = useMemo(() => REGIONS.filter((r) => access.isSuper || access.regions.includes(r.key)), [access]);
  const [regions, setRegions] = useState<string[]>([]);
  const [hasList, setHasList] = useState<"yes" | "no" | "">("");
  const [domains, setDomains] = useState<string[]>([]);
  const [sources, setSources] = useState<Sources>({ checked: [], custom: [] });
  const [newSource, setNewSource] = useState("");
  const [activateNow, setActivateNow] = useState(true);
  const [wantsProfiling, setWantsProfiling] = useState<"free" | "paid" | "">("");
  const [draft, setDraft] = useState<Draft>({ revenue: 250, employees: 100, listing: "any", entity: "group_hq", discoverPerDay: 5, verifyPerDay: 25 });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [icpRes, srcRes] = await Promise.all([fetch("/api/icp"), fetch("/api/wizard-sources")]);
        const j = await icpRes.json();
        const d = normalizeDefinition(j.regions ? { regions: j.regions, version: j.version } : j);
        if (cancelled) return;
        setDef(d);
        const first = visibleRegions[0]?.key;
        if (first) {
          setRegions([first]);
          const r = d.regions[first];
          if (r) {
            setDraft({ revenue: r.revenue.min_usd_m, employees: r.employees.min, listing: r.listing, entity: r.entity_level,
              discoverPerDay: r.engine.discover_per_day || 5, verifyPerDay: r.engine.verify_per_day || 25 });
            setDomains(OPTIONS.domains.filter((x) => r.personas.departments.includes(x.department)).map((x) => x.key));
            setActivateNow(r.status === "active");
          }
        }
        const s = await srcRes.json().catch(() => null);
        if (!cancelled && s && Array.isArray(s.checked)) setSources({ checked: s.checked, custom: Array.isArray(s.custom) ? s.custom : [] });
      } catch { if (!cancelled) notify("Could not load Define ICP settings.", "error"); }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  const saveSources = (next: Sources) => {
    setSources(next);
    fetch("/api/wizard-sources", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) }).catch(() => {});
  };
  const toggleRegion = (key: string) => setRegions((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));
  const toggleDomain = (key: string) => setDomains((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));
  const toggleSource = (name: string) => saveSources({ ...sources, checked: sources.checked.includes(name) ? sources.checked.filter((x) => x !== name) : [...sources.checked, name] });
  const addSource = () => {
    const name = newSource.trim();
    if (!name) return;
    const known = [...KNOWN_SOURCES, ...sources.custom].find((x) => x.toLowerCase() === name.toLowerCase());
    if (known) { if (!sources.checked.includes(known)) saveSources({ ...sources, checked: [...sources.checked, known] }); }
    else saveSources({ checked: [...sources.checked, name], custom: [...sources.custom, name] });
    setNewSource("");
  };

  async function save() {
    if (!def) return;
    if (!regions.length) { notify("Pick at least one region in step 1.", "error"); setSection("wizard"); setExpanded(true); setStep(1); return; }
    const names = regions.map((k) => REGIONS.find((r) => r.key === k)?.name || k).join(", ");
    if (!(await ask({ title: "Save this setup?", confirm: "Save & apply", body: `Applies to ${names}.`,
      points: ["Every company's ICP status is recalculated straight away.", "The next daily run uses these rules for each region checked."] }))) return;
    setSaving(true);
    const chosenDepts = domains.map((k) => OPTIONS.domains.find((x) => x.key === k)?.department).filter((x): x is string => !!x);
    const extraTriggers = domains.flatMap((k) => OPTIONS.domains.find((x) => x.key === k)?.extraTriggers || []);
    const n = clone(def);
    for (const key of regions) {
      const target = n.regions[key];
      if (!target) continue;
      target.revenue.min_usd_m = draft.revenue;
      target.employees.min = draft.employees;
      target.listing = draft.listing;
      target.entity_level = draft.entity;
      target.personas.departments = [...new Set(chosenDepts.length ? chosenDepts : target.personas.departments)];
      target.focus.triggers = [...new Set([...target.focus.triggers, ...extraTriggers])];
      target.engine.discover_per_day = draft.discoverPerDay;
      target.engine.verify_per_day = draft.verifyPerDay;
      if (activateNow) target.status = "active";
    }
    try {
      const res = await fetch("/api/icp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", definition: n }) });
      const j = await res.json();
      if (j.ok) { notify(`Saved and applied — ${j.changed || 0} account${j.changed === 1 ? "" : "s"} changed status.`, "ok"); setDef(n); }
      else notify(j.error || j.problems?.[0] || "Could not save.", "error");
    } catch { notify("Could not reach the server.", "error"); }
    setSaving(false);
  }

  const regionNames = regions.map((k) => REGIONS.find((r) => r.key === k)?.name || k);

  return (
    <section className="panel hw">
      <nav className="hw-rail">
        <button type="button" className="hw-rail-item" aria-current={section === "about"} onClick={() => setSection("about")}>
          <span className="hw-rail-icon"><Ico name="book" /></span>About Account CoPilot</button>
        <div className="hw-rail-row">
          <button type="button" className="hw-rail-item" aria-current={section === "wizard"} onClick={() => { setSection("wizard"); setExpanded(true); }}>
            <span className="hw-rail-icon"><Ico name="wand" /></span>Setup Wizard</button>
          <button type="button" className="hw-chevron" aria-expanded={expanded} aria-label={expanded ? "Collapse the 7 steps" : "Expand the 7 steps"}
            onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" style={{ transition: "transform .18s ease", transform: expanded ? "none" : "rotate(-90deg)" }}>
              <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
        {expanded && (
          <ol className="hw-steps">
            {STEPS.map((s) => (
              <li key={s.n}><button type="button" className={`hw-step ${s.cls}`} aria-current={step === s.n && section === "wizard"}
                onClick={() => { setSection("wizard"); setStep(s.n); }}>
                <span className="hw-step-num">{s.n}</span><Ico name={s.icon} />{s.label}</button></li>
            ))}
          </ol>
        )}
      </nav>

      <div className="hw-content">
        {section === "about" ? (
          <div>
            <h3 className="hw-h">About Account CoPilot</h3>
            <p className="hw-lead">Account CoPilot is an <b>AI Agent</b> — it works on its own, not only when you ask. Every morning it looks for new
              companies fitting your ICP, checks their numbers against official sources, and updates your database. Nothing here is invented: every
              figure carries a source and a confidence label.</p>
            <div className="hw-about-grid">
              <div className="hw-about-card hw-about-card--teal"><span className="hw-icon-badge"><Ico name="grid" /></span><h4>What each tab does</h4>
                <ul><li>Dashboard — the big picture, drill into any number</li><li>Accounts — every company, ICP status, Pipeline rank</li>
                  <li>Stakeholders — contacts, seniority, persona fit</li><li>Data — sources, conflicts, tech signals, research queue</li>
                  <li>Setup — Define ICP, engine settings, team access</li></ul></div>
              <div className="hw-about-card hw-about-card--gold"><span className="hw-icon-badge"><Ico name="coin" /></span><h4>Tokens &amp; cost</h4>
                <p>Your <b>Claude plan</b> covers the daily run and anything you queue for free — no Anthropic key touched. The
                  <b> Anthropic API key</b> is only spent by Research Queue, Research more, Draft pitch and paid Refresh — each shows its cost
                  first, and a PIN can gate all of them.</p></div>
              <div className="hw-about-card hw-about-card--sky"><span className="hw-icon-badge"><Ico name="search" /></span><h4>How it verifies</h4>
                <p><b>Find</b> candidates → <b>Check</b> official sources → <b>Verify</b> with a Fact / Likely / Unverified / Unknown label and a
                  source link → <b>Re-check</b> anything short of Verified on a schedule.</p></div>
              <div className="hw-about-card hw-about-card--green"><span className="hw-icon-badge"><Ico name="target" /></span><h4>What &quot;ICP&quot; means</h4>
                <p>Net revenue ≥ $250M and ≥ 100 employees by default, no stock listing required — set per region in <b>Setup → Define ICP</b>, the
                  one rule set everything else reads.</p></div>
            </div>
          </div>
        ) : loading || !def ? <p className="note">Loading your current settings…</p> : (
          <div>
            {step === 1 && (
              <div>
                <div className="hw-tint hw-tint--region">
                  <div className="hw-tint-head"><span className="hw-icon-badge" style={stepColor("var(--teal)")}><Ico name="pin" /></span><h3>Which regions are you setting up?</h3></div>
                  <p className="hw-lead">Tick every region you want this wizard to configure right now. The steps ahead — company size, targeting, data
                    sources and daily plan — are set once and applied to each region checked below. You can always come back and run the wizard again
                    for just one region.</p>
                </div>
                <div className="hw-pillrow">
                  {visibleRegions.map((r) => {
                    const nextPhase = def.regions[r.key]?.status === "next";
                    const on = regions.includes(r.key);
                    return (
                      <button key={r.key} type="button" className={`hw-pill hw-region-pill ${on ? "on" : ""}`} disabled={nextPhase}
                        aria-pressed={on} onClick={() => toggleRegion(r.key)}>
                        {r.name}{nextPhase ? " (next phase)" : ""}
                      </button>
                    );
                  })}
                </div>
                <p className="hw-lead" style={{ marginTop: 12 }}>
                  {regions.length
                    ? <><b>Selected: {regionNames.join(", ")}.</b> Company size, targeting, data sources and daily plan will apply to all of these.</>
                    : "Pick at least one region to continue."}
                </p>
                {!visibleRegions.length && <p className="note">No region is assigned to your account yet — ask a Super Admin to add one in Setup → Team.</p>}
              </div>
            )}

            {step === 2 && (
              <div>
                <div className="hw-tint hw-tint--region">
                  <div className="hw-tint-head"><span className="hw-icon-badge" style={stepColor("var(--teal)")}><Ico name="folder" /></span><h3>Do you already have a validated list?</h3></div>
                  <p className="hw-lead">This decides how the Agent gets started for the region(s) you checked in step 1. Answer for whichever region
                    you have the most data for — you can give a different answer next time you run the wizard for another region.</p>
                </div>
                <div className="hw-pillrow">
                  <button type="button" className={`hw-pill ${hasList === "yes" ? "on" : ""}`} onClick={() => setHasList("yes")}>Yes, I have one</button>
                  <button type="button" className={`hw-pill ${hasList === "no" ? "on" : ""}`} onClick={() => setHasList("no")}>No — help me build one from scratch</button>
                </div>
                <div className="hw-about-grid" style={{ marginTop: 14 }}>
                  <div className={`hw-about-card hw-yesno-yes ${hasList === "yes" ? "selected" : ""}`}>
                    <h4>If Yes {hasList === "yes" && <span className="note">— selected</span>}</h4>
                    <p>Send it over and it&apos;s imported exactly as-is, the same way the UAE workbook was. Nothing in it is overwritten — the daily
                      engine only adds new rows or fills in its own fields (revenue checks, ICP status), and explains any difference it finds.</p></div>
                  <div className={`hw-about-card hw-yesno-no ${hasList === "no" ? "selected" : ""}`}>
                    <h4>If No {hasList === "no" && <span className="note">— selected</span>}</h4>
                    <p>No problem — the free daily engine can build your list from nothing, using its own web search. It just starts at a slower pace
                      until it has found and verified enough companies to feel complete; you&apos;ll set that pace in step 6.</p></div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div>
                <div className="hw-tint hw-tint--region">
                  <div className="hw-tint-head"><span className="hw-icon-badge" style={stepColor("var(--teal)")}><Ico name="building" /></span><h3>Company size — a company must meet both to count</h3></div>
                  <p className="hw-lead">These numbers are the actual pass/fail rule, not just a filter on this page — the daily engine, in-app
                    research and the Pipeline ranking all read them straight from here. Get them right once and everything downstream follows
                    automatically.</p>
                </div>
                <label className="hw-field">Minimum net revenue (USD millions)
                  <div className="hw-field-row">
                    <input type="number" min={0} value={draft.revenue} onChange={(e) => setDraft((d) => ({ ...d, revenue: Number(e.target.value) || 0 }))} />
                    <span className="hw-value-chip">{usdM(draft.revenue)}</span>
                  </div>
                  <span className="hint">Most recent annual net revenue, converted to USD. $250M is a solid default for enterprise procurement deals
                    — raise it to focus only on the very largest accounts, lower it to widen the net.</span></label>
                <label className="hw-field">Minimum employees
                  <input type="number" min={0} value={draft.employees} onChange={(e) => setDraft((d) => ({ ...d, employees: Number(e.target.value) || 0 }))} />
                  <span className="hint">Global headcount, not just this region. Revenue on its own lets small holding entities or shell companies
                    slip through — this second threshold catches those.</span></label>
                <label className="hw-field">Stock listing
                  <select value={draft.listing} onChange={(e) => setDraft((d) => ({ ...d, listing: e.target.value as Rules["listing"] }))}>
                    {OPTIONS.listing.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                  <span className="hint">Off by default — most of the strongest accounts in the Gulf are privately held. Turn this on only if you
                    specifically need publicly listed companies.</span></label>
                <label className="hw-field">Which entities count
                  <select value={draft.entity} onChange={(e) => setDraft((d) => ({ ...d, entity: e.target.value as Rules["entity_level"] }))}>
                    {OPTIONS.entity.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                  <span className="hint">Controls whether a single hotel, branch office, or small subsidiary of a qualifying group counts on its own,
                    or only the parent group does.</span></label>
              </div>
            )}

            {step === 4 && (
              <div>
                <div className="hw-tint hw-tint--people">
                  <div className="hw-tint-head"><span className="hw-icon-badge" style={stepColor("var(--gold)")}><Ico name="crosshair" /></span><h3>Which domains do you want to target?</h3></div>
                  <p className="hw-lead">This decides which people at each company the Agent treats as decision-makers — who gets surfaced first on
                    Stakeholders, and whose seniority counts toward Pipeline rank. Pick as many as apply.</p>
                </div>
                <div className="hw-pillrow">
                  {OPTIONS.domains.map((d) => (
                    <button key={d.key} type="button" className={`hw-pill ${domains.includes(d.key) ? "on" : ""}`} onClick={() => toggleDomain(d.key)}>{d.label}</button>
                  ))}
                </div>
                <p className="hw-lead" style={{ marginTop: 12 }}>
                  {domains.length
                    ? <><b>Selected: {domains.map((k) => OPTIONS.domains.find((x) => x.key === k)?.label).join(", ")}.</b> The Agent prioritizes
                      matching titles when it scores contacts.</>
                    : "Pick at least one domain, or the wizard keeps whatever targeting is already saved for these regions."}
                </p>
              </div>
            )}

            {step === 5 && (
              <div>
                <div className="hw-tint hw-tint--data">
                  <div className="hw-tint-head"><span className="hw-icon-badge" style={stepColor("var(--sky)")}><Ico name="database" /></span><h3>Which data sources do you have?</h3></div>
                  <p className="hw-lead">Seamless.ai is the one source genuinely connected and in use today, for contact enrichment. Everything else
                    below is just your own inventory — tick what you have a subscription to, so I know what to ask for exports from; nothing here
                    connects automatically.</p>
                </div>
                <div className="hw-checkrow">Seamless.ai <span className="hw-tag-sm">connected</span></div>
                {[...KNOWN_SOURCES, ...sources.custom].map((name) => (
                  <label key={name} className="hw-checkrow">
                    <input type="checkbox" checked={sources.checked.includes(name)} onChange={() => toggleSource(name)} />
                    {name} <span className="hint" style={{ marginLeft: 4 }}>— not connected to this app yet</span>
                  </label>
                ))}
                <label className="hw-field">Have another subscription not listed above?
                  <div className="hw-field-row">
                    <input type="text" placeholder="e.g. Coresignal, S&P Capital IQ" value={newSource}
                      onChange={(e) => setNewSource(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSource(); } }} />
                    <button type="button" className="btn" disabled={!newSource.trim()} onClick={addSource}>Add</button>
                  </div>
                  <span className="hint">Adds it to the list above, ticked. Send exports and I&apos;ll fold them in by hand until a real connector exists.</span></label>
              </div>
            )}

            {step === 6 && (
              <div>
                <div className="hw-tint hw-tint--data">
                  <div className="hw-tint-head"><span className="hw-icon-badge" style={stepColor("var(--sky)")}><Ico name="calendar" /></span><h3>Daily plan</h3></div>
                  <p className="hw-lead">Sets how much unattended work the daily run does, on your Claude plan at no extra cost. A good
                    starting point for extending an existing list: find 5 a day, verify 25.</p>
                </div>
                <label className="hw-field">New companies to find per day
                  <input type="number" min={0} max={50} value={draft.discoverPerDay} onChange={(e) => setDraft((d) => ({ ...d, discoverPerDay: Number(e.target.value) || 0 }))} />
                  <span className="hint">How many brand-new candidates the Agent searches for and adds each morning.</span></label>
                <label className="hw-field">Companies to verify per day
                  <input type="number" min={0} max={60} value={draft.verifyPerDay} onChange={(e) => setDraft((d) => ({ ...d, verifyPerDay: Number(e.target.value) || 0 }))} />
                  <span className="hint">How many existing companies get their revenue and size re-checked each morning, oldest checks first.</span></label>
                <label className="hw-checkrow"><input type="checkbox" checked={activateNow} onChange={(e) => setActivateNow(e.target.checked)} />
                  Activate {regions.length > 1 ? "these regions'" : "this region's"} daily run now — leave unchecked to save these rules without
                  switching the run on yet</label>

                <div className="hw-tint hw-tint--data" style={{ marginTop: 18 }}>
                  <div className="hw-tint-head"><span className="hw-icon-badge" style={stepColor("var(--sky)")}><Ico name="coin" /></span><h3>Just the free daily pace, or paid profiling too?</h3></div>
                  <p className="hw-lead">The plan above is entirely free — it&apos;s your Claude plan, not the Anthropic API key. If you&apos;d rather
                    have Claude go deeper on companies than the free daily pace allows — fuller profiles, more sources, faster than 25 a day — that&apos;s
                    a separate, paid action (Data → Research Queue, or Research more) using the Anthropic API key. This is just to set expectations;
                    nothing is charged from this wizard.</p>
                </div>
                <div className="hw-pillrow">
                  <button type="button" className={`hw-pill ${wantsProfiling === "free" ? "on" : ""}`} onClick={() => setWantsProfiling("free")}>Just the free daily pace is fine</button>
                  <button type="button" className={`hw-pill ${wantsProfiling === "paid" ? "on" : ""}`} onClick={() => setWantsProfiling("paid")}>I&apos;ll want paid profiling too</button>
                </div>
                {wantsProfiling === "paid" && (
                  <div className="tablewrap" style={{ marginTop: 12 }}>
                    <table>
                      <thead><tr><th>Research depth</th><th>Per company</th><th>Per 50 companies</th><th>Per 100 companies</th></tr></thead>
                      <tbody>
                        {PROFILE_TIERS.map((t) => (
                          <tr key={t.label}>
                            <td><b>{t.label}</b> <span className="hint">— {t.note}</span></td>
                            <td className="mono">{costRange(t.unit, 1)}</td>
                            <td className="mono">{costRange(t.unit, 50)}</td>
                            <td className="mono">{costRange(t.unit, 100)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="hint" style={{ marginTop: 8 }}>Same per-company rates as Setup → Learn Me → Costs &amp; usage. You approve
                      every paid run before anything is spent, and a Super Admin can require a PIN.</p>
                  </div>
                )}
              </div>
            )}

            {step === 7 && (
              <div>
                <div className="hw-tint hw-tint--review">
                  <div className="hw-tint-head"><span className="hw-icon-badge" style={stepColor("var(--muted)")}><Ico name="clipboard" /></span><h3>Review</h3></div>
                  <p className="hw-lead">Here&apos;s what this sets up, in plain terms. Nothing is saved until you press Save &amp; apply below.</p>
                </div>
                <p className="hw-lead" style={{ marginBottom: 16 }}>
                  You&apos;re setting up <b>{regionNames.length || 0} region{regionNames.length === 1 ? "" : "s"}</b>
                  {regionNames.length ? <> ({regionNames.join(", ")})</> : null} with a bar of <b>{usdM(draft.revenue)} revenue</b> and{" "}
                  <b>{draft.employees}+ employees</b>. {activateNow ? "Once you save, the daily run switches on for these regions" : "These rules save now, but the daily run stays paused for these regions until you activate them"} —
                  every day it looks for <b>{draft.discoverPerDay} new</b> matching companies and re-checks <b>{draft.verifyPerDay} existing</b> ones,
                  weighted toward {domains.length ? domains.map((k) => OPTIONS.domains.find((x) => x.key === k)?.label).join(", ") : "your current targeting"}.
                  All of this runs on your Claude plan, at no extra cost.{wantsProfiling === "paid" ? " Whenever you want it to go deeper than that free pace, Research Queue or Research more (Data tab) will do it, at the rates shown in the previous step." : ""}
                </p>
                <p className="hw-lead" style={{ marginBottom: 16 }}>
                  <b>When to expect something worth looking at:</b> the first new and re-checked companies land within a day or two of the run
                  switching on. A dataset that&apos;s broadly verified across everything in these regions typically takes <b>2–4 weeks</b> to build up
                  at this pace — sooner if you&apos;re starting from an existing list, longer for a region starting from nothing.
                </p>
                <ul className="hw-review-list">
                  <li>Regions <b>{regionNames.length ? regionNames.join(", ") : "none checked"}{activateNow ? " — will be Active" : ""}</b></li>
                  <li>Company size <b>revenue ≥ {usdM(draft.revenue)}, employees ≥ {draft.employees}</b></li>
                  <li>Targeting <b>{domains.length ? domains.map((k) => OPTIONS.domains.find((x) => x.key === k)?.label).join(", ") : "no change to current targeting"}</b></li>
                  <li>Daily plan <b>find {draft.discoverPerDay}, verify {draft.verifyPerDay} per day</b></li>
                </ul>
                <button type="button" className="btn primary" disabled={saving || !regions.length} onClick={save}>{saving ? "Saving…" : "Save & apply"}</button>
              </div>
            )}

            <div className="row-actions" style={{ marginTop: 18 }}>
              {step > 1 && <button type="button" className="btn" onClick={() => setStep((s) => s - 1)}>Back</button>}
              {step < 7 && <button type="button" className="btn primary" onClick={() => setStep((s) => s + 1)}>Next</button>}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
