"use client";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { REGIONS, OPTIONS, normalizeDefinition, type Definition, type Rules } from "@/lib/icpDefinition.mjs";
import type { Access } from "@/lib/access";
import { ask, notify } from "@/components/Confirm";
import { fmtDateTime } from "@/lib/dates";

// Home workspace: a left rail with two destinations — About Account CoPilot (always free to read) and Setup Wizard
// (reads and writes the exact settings.icp_definition record Setup → Define ICP uses, so there's no separate config to
// drift out of sync). The wizard's 6 steps live as their own collapsible list under Setup Wizard, colour-coded by what
// they configure: region/size in teal, targeting in gold, sources/pace in sky, review neutral.
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

// Seamless.ai is the only source actually wired into this app today (lib/sources.ts, scripts/apply_verification.mjs) —
// everything else here is just the user's own inventory of what they subscribe to, recorded for later, not a live
// connection. Never mark anything "connected" unless it genuinely is.
type Sources = { checked: string[]; custom: string[] };
const KNOWN_SOURCES = ["ZoomInfo", "Crunchbase", "Lusha", "Dun & Bradstreet", "Refinitiv", "Thomson Reuters"];
type Draft = { discoverPerDay: number; verifyPerDay: number };
type SizeDraft = { revenue: number; employees: number; listing: Rules["listing"]; entity: Rules["entity_level"] };

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
// "250" or "3500" (millions), typed as "250", "250M" or "3.5B" → USD millions. Same parsing rules as Define ICP's own money field.
function parseUsdM(t: string): number | null {
  const v = t.replace(/[$,\s]/g, "").toUpperCase();
  if (!v) return null;
  const m = v.match(/^(\d+(?:\.\d+)?)(B|BN|M|MN)?$/);
  if (!m) return NaN;
  return m[2]?.startsWith("B") ? Number(m[1]) * 1000 : Number(m[1]);
}
// Shows "$250M" / "$2.50B" at rest; click in and it turns editable ("250M", "3.5B" — bare numbers still work, in millions).
function MoneyField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [text, setText] = useState<string | null>(null);
  const parsed = text === null ? value : parseUsdM(text);
  const bad = text !== null && Number.isNaN(parsed);
  return (
    <input type="text" inputMode="decimal" className={bad ? "bad" : undefined} value={text ?? usdM(value)}
      onFocus={() => setText(value >= 1000 ? `${value / 1000}B` : `${value}M`)}
      onChange={(e) => { setText(e.target.value); const p = parseUsdM(e.target.value); if (!Number.isNaN(p) && p !== null) onChange(p); }}
      onBlur={() => setText(null)} />
  );
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

const STEPS: { n: number; label: string; icon: keyof typeof ICON; cls: string; group?: "mandatory" | "info" }[] = [
  { n: 1, label: "Region & size", icon: "pin", cls: "hw-step--region", group: "mandatory" },
  { n: 2, label: "Add Data", icon: "folder", cls: "hw-step--region", group: "mandatory" },
  { n: 3, label: "Domains", icon: "crosshair", cls: "hw-step--people", group: "mandatory" },
  { n: 4, label: "Daily plan", icon: "calendar", cls: "hw-step--data", group: "mandatory" },
  { n: 5, label: "Data sources", icon: "database", cls: "hw-step--data", group: "info" },
  { n: 6, label: "Review", icon: "clipboard", cls: "hw-step--review" },
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
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [domains, setDomains] = useState<string[]>([]);
  const [sources, setSources] = useState<Sources>({ checked: [], custom: [] });
  const [newSource, setNewSource] = useState("");
  const [activateNow, setActivateNow] = useState(true);
  const [wantsProfiling, setWantsProfiling] = useState<"free" | "paid" | "">("");
  const [draft, setDraft] = useState<Draft>({ discoverPerDay: 5, verifyPerDay: 25 });
  const [sizeDraft, setSizeDraft] = useState<Record<string, SizeDraft>>({});
  // Each region keeps its own size rule — Europe or the USA can carry a higher bar than the Gulf. Falls back to that
  // region's own last-saved value (every region always has one, even unconfigured ones — DEFAULT_RULES), not a shared draft.
  const sizeFor = (key: string): SizeDraft => sizeDraft[key] ?? (def?.regions[key]
    ? { revenue: def.regions[key].revenue.min_usd_m, employees: def.regions[key].employees.min, listing: def.regions[key].listing, entity: def.regions[key].entity_level }
    : { revenue: 250, employees: 100, listing: "any", entity: "group_hq" });
  const setSize = (key: string, patch: Partial<SizeDraft>) => setSizeDraft((cur) => ({ ...cur, [key]: { ...sizeFor(key), ...patch } }));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [icpRes, srcRes] = await Promise.all([fetch("/api/icp"), fetch("/api/wizard-sources")]);
        const j = await icpRes.json();
        const d = normalizeDefinition(j.regions ? { regions: j.regions, version: j.version } : j);
        if (cancelled) return;
        setDef(d);
        // Pre-tick every region already Active in Define ICP (however it got activated — Wizard or Define ICP
        // itself, same saved data either way), not just the first one, so "already active" reads as already ticked.
        const alreadyActive = visibleRegions.map((r) => r.key).filter((k) => d.regions[k]?.status === "active");
        const first = alreadyActive[0] || visibleRegions[0]?.key;
        if (first) {
          setRegions(alreadyActive.length ? alreadyActive : [first]);
          const r = d.regions[first];
          if (r) {
            setDraft({ discoverPerDay: r.engine.discover_per_day || 5, verifyPerDay: r.engine.verify_per_day || 25 });
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
  async function uploadFile(file: File) {
    const region = regions[0];
    if (!region) { setUploadMsg({ ok: false, text: "Pick at least one region in step 1 first." }); return; }
    if (!/\.(xlsx|xls)$/i.test(file.name)) { setUploadMsg({ ok: false, text: "Only .xlsx or .xls files are accepted." }); return; }
    setUploadBusy(true); setUploadMsg(null);
    try {
      const form = new FormData();
      form.append("file", file); form.append("region", region);
      const res = await fetch("/api/wizard-upload", { method: "POST", body: form });
      const j = await res.json().catch(() => ({}));
      if (res.ok) setUploadMsg({ ok: true, text: `"${file.name}" uploaded (${j.item?.rows ?? "?"} rows found) — it'll be read and imported by the next scheduled session. Track it in Settings → Discovery & refresh engine → Uploaded lists.` });
      else setUploadMsg({ ok: false, text: j.error || "Could not upload that file." });
    } catch { setUploadMsg({ ok: false, text: "Could not reach the server." }); }
    setUploadBusy(false);
  }

  async function save() {
    if (!def) return;
    if (!regions.length) { notify("Pick at least one region in step 1.", "error"); setSection("wizard"); setExpanded(true); setStep(1); return; }
    const named: { key: string; s: SizeDraft }[] = regions.map((key) => ({ key, s: sizeFor(key) }));
    const badSize = named.find(({ s }) => !(s.revenue > 0) || !(s.employees >= 0));
    if (badSize) { notify(`${REGIONS.find((r) => r.key === badSize.key)?.name || badSize.key}: enter a valid revenue and employee count.`, "error"); return; }
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
      const s = sizeFor(key);
      target.revenue.min_usd_m = s.revenue;
      target.employees.min = s.employees;
      target.listing = s.listing;
      target.entity_level = s.entity;
      target.personas.departments = [...new Set(chosenDepts.length ? chosenDepts : target.personas.departments)];
      target.focus.triggers = [...new Set([...target.focus.triggers, ...extraTriggers])];
      target.engine.discover_per_day = draft.discoverPerDay;
      target.engine.verify_per_day = draft.verifyPerDay;
      // Configuring a region here is what starts it: a region still marked "next phase" always leaves that state,
      // landing on Active or Paused depending on the checkbox in step 5 — never left stuck as "not started".
      if (activateNow) target.status = "active";
      else if (target.status === "next") target.status = "paused";
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
  const uniformSize = regions.length > 0 && regions.every((k) => sizeFor(k).revenue === sizeFor(regions[0]).revenue && sizeFor(k).employees === sizeFor(regions[0]).employees);
  const startingRegions = regions.filter((k) => def?.regions[k]?.status === "next").map((k) => REGIONS.find((r) => r.key === k)?.name || k);
  // Shared by the "Setup Wizard" label and the chevron, so both always behave the same way: switching in from
  // elsewhere opens the step list, and clicking again once already there toggles it open or closed.
  const toggleWizard = () => {
    if (section !== "wizard") { setSection("wizard"); setExpanded(true); }
    else setExpanded((v) => !v);
  };

  return (
    <section className="panel hw">
      <nav className="hw-rail">
        <button type="button" className="hw-rail-item" aria-current={section === "about"} onClick={() => { setSection("about"); setExpanded(false); }}>
          <span className="hw-rail-icon"><Ico name="book" /></span>About Account CoPilot</button>
        <div className="hw-rail-row">
          <button type="button" className="hw-rail-item" aria-current={section === "wizard"} onClick={toggleWizard}>
            <span className="hw-rail-icon"><Ico name="wand" /></span>Setup Wizard</button>
          <button type="button" className="hw-chevron" aria-expanded={expanded} aria-label={expanded ? "Collapse the 6 steps" : "Expand the 6 steps"} onClick={toggleWizard}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" style={{ transition: "transform .18s ease", transform: expanded ? "none" : "rotate(-90deg)" }}>
              <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
        {expanded && (
          <ol className="hw-steps">
            {STEPS.map((s, i) => (
              <li key={s.n}>
                {s.group === "mandatory" && STEPS[i - 1]?.group !== "mandatory" && <div className="hw-step-group hw-step-group--mandatory">Mandatory · affects the Agent</div>}
                {s.group === "info" && STEPS[i - 1]?.group !== "info" && <div className="hw-step-group hw-step-group--info">Information only</div>}
                <button type="button" className={`hw-step ${s.cls}`} aria-current={step === s.n && section === "wizard"}
                  onClick={() => { setSection("wizard"); setStep(s.n); }}>
                  <span className="hw-step-num">{s.n}</span><Ico name={s.icon} />{s.label}</button>
              </li>
            ))}
          </ol>
        )}
      </nav>

      <div className="hw-content">
        {section === "about" ? (
          <div>
            <h3 className="hw-h">About Account CoPilot</h3>
            <p className="hw-lead hw-lead-justify">Account CoPilot is an <b>AI Agent</b> — it works on its own, not only when you ask. Every morning it looks for new
              companies fitting your ICP, checks their numbers against official sources, and updates your database. Nothing here is invented: every
              figure carries a source and a confidence label.</p>
            <div className="hw-loud">
              <p className="hw-loud-kicker">Put this agent to work</p>
              <h3 className="hw-loud-h">Two questions this app answers for you, every single day</h3>
              <div className="hw-loud-grid">
                <div><p className="hw-loud-q">Who should we target next?</p>
                  <p className="hw-loud-a">Go to <b>Accounts → Pipeline</b>. Every account is ranked by one number — fit, buying signals and Coupa fit combined. Top of the list is who to call first, no guesswork.</p></div>
                <div><p className="hw-loud-q">How ready are they for an S2P platform?</p>
                  <p className="hw-loud-a">Click any account in Pipeline or Accounts to open its brief. <b>Procurement &amp; IT maturity</b> is the first thing you&apos;ll see after the facts at the top — no scrolling to find it.</p></div>
              </div>
              <p className="hw-loud-foot">Every figure above carries a source and a confidence label — nothing here is a guess.</p>
            </div>
            <div className="hw-about-grid">
              <div className="hw-about-card hw-about-card--teal"><span className="hw-icon-badge"><Ico name="search" /></span><h4>Free Daily Search Engine job</h4>
                <ul>
                  <li>Runs every day on your Claude plan — no Anthropic API cost, ever.</li>
                  <li>Finds a handful of brand-new companies fitting the basic ICP shape: name, website, country, industry, HQ city.</li>
                  <li>Checks each company&apos;s <b>revenue figure</b> and sets its ICP status — Verified, Likely, Needs check, Not ICP, or Unknown.</li>
                  <li>That&apos;s the full scope — no contacts, S2P signals, ERP status, ownership or opportunity notes. Those only come from paid research (see the tile on the right).</li>
                </ul>
                <p className="hw-about-stat">Fills in <b>19 pieces of information</b> on every company: 5 when it&apos;s first found (name, website, country, industry, HQ city), and 14 more when its revenue is checked (status, listing, exchange, ticker, revenue figure, year, type, source, confidence, fit, reason, employees, checked date).</p>
                <p className="hw-about-note">Keeps working after it&apos;s added: every company — free or paid — gets its revenue and ICP status automatically re-checked roughly every 180 days, so it can climb the ladder on its own over time (e.g. Likely → Verified) with no further action from you.</p></div>
              <div className="hw-about-card hw-about-card--gold"><span className="hw-icon-badge"><Ico name="coin" /></span><h4>Paid Search Engine Job</h4>
                <ul>
                  <li>A deliberate, separate action you trigger — Research Queue or &quot;Research more&quot; with profiling on. Uses the Anthropic API key; you approve the cost each time.</li>
                  <li><b>Contacts</b> — real names, titles, emails, phone numbers, LinkedIn, seniority and department.</li>
                  <li><b>S2P/Coupa/Ariba signal level</b>, existing <b>ERP/S2P platform</b>, and <b>ownership structure</b> (parent, subsidiaries, procurement model).</li>
                  <li><b>Buying triggers</b> and <b>opportunity classification</b> — transformation signals, implementation/consulting partners, Coupa/Ariba opportunity type.</li>
                  <li>Board phone number, plus the full source/evidence trail behind every finding above.</li>
                </ul>
                <p className="hw-about-stat">Adds <b>39 more pieces of information</b> about the company itself (ownership, ERP, S2P platform, buying signals, opportunity type and more), plus a full profile — <b>27 pieces of information</b> — for every person it finds there (title, email, phone, LinkedIn, seniority and more). None of this exists until paid research runs.</p>
                <p className="hw-about-note">What keeps updating, and what doesn&apos;t: revenue/ICP status keeps re-checking for free, same as any company. But this richer profile is a snapshot from when you ran it — it does not refresh itself; you&apos;d need to run paid research on that company again to update it.</p></div>
            </div>
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
                  source link → <b>Re-check</b> anything short of Verified on a schedule.</p>
                <p className="hw-about-stat">Adds no new information of its own — it labels everything already found as <b>Fact, Likely, Unverified or Unknown</b>, and re-checks revenue roughly every <b>180 days</b>, so nothing is ever just a guess.</p></div>
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
                  <div className="hw-tint-head"><span className="hw-icon-badge" style={stepColor("var(--teal)")}><Ico name="pin" /></span><h3>Which regions, and what counts as a fit?</h3></div>
                  <p className="hw-lead hw-lead-wide">Tick every region you want this wizard to configure, and set its own size rule right in the same row — Europe or the
                    USA can carry a higher bar than the Gulf, for instance. Targeting, data sources and daily plan (the steps ahead) are set once and applied to every
                    region checked here. Regions marked <b>not started yet</b> haven&apos;t been set up at all — ticking one starts it: it moves to Active or Paused
                    (your choice in step 5) once you save.</p>
                </div>
                <div className="hw-region-list">
                  {visibleRegions.map((r) => {
                    const nextPhase = def.regions[r.key]?.status === "next";
                    const checked = regions.includes(r.key);
                    const s = sizeFor(r.key);
                    const activatedBy = def.regions[r.key]?.status === "active" ? def.regions[r.key]?.activated_by : null;
                    const activatedAt = def.regions[r.key]?.activated_at;
                    return (
                      <div key={r.key} className={`hw-region-row ${checked ? "on" : ""}`}>
                        <div className="hw-region-name-col">
                          <span className="hw-region-head">Region</span>
                          <label className="hw-region-name">
                            <input type="checkbox" checked={checked} onChange={() => toggleRegion(r.key)} />
                            {r.name} {nextPhase && <span className="hint">— not started yet</span>}
                          </label>
                        </div>
                        <div className="hw-region-fields">
                          <label>Min net rev<MoneyField value={s.revenue} onChange={(v) => setSize(r.key, { revenue: v })} /></label>
                          <label>Min employees<input type="number" min={0} value={s.employees} onChange={(e) => setSize(r.key, { employees: Number(e.target.value) || 0 })} /></label>
                          <label>Stock listing<select value={s.listing} onChange={(e) => setSize(r.key, { listing: e.target.value as Rules["listing"] })}>
                            {OPTIONS.listing.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
                          <label>Which entities count<select value={s.entity} onChange={(e) => setSize(r.key, { entity: e.target.value as Rules["entity_level"] })}>
                            {OPTIONS.entity.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
                        </div>
                        {activatedBy && (
                          <div className="hw-region-status-col">
                            <span className="hw-region-head">Status</span>
                            <span className="hw-region-activated">Activated by {activatedBy}{activatedAt ? ` on ${fmtDateTime(activatedAt)}` : ""}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="hw-lead hw-lead-wide" style={{ marginTop: 12 }}>
                  {regions.length
                    ? <><b>Selected: {regionNames.join(", ")}.</b> Targeting, data sources and daily plan will apply to all of these.
                      {startingRegions.length > 0 && <> <b>{startingRegions.join(", ")}</b> {startingRegions.length === 1 ? "isn't" : "aren't"} started yet
                        — saving this wizard starts {startingRegions.length === 1 ? "it" : "them"}.</>}</>
                    : "Pick at least one region to continue."}
                </p>
                {!visibleRegions.length && <p className="note">No region is assigned to your account yet — ask a Super Admin to add one in Setup → Team.</p>}
              </div>
            )}

            {step === 2 && (
              <div>
                <div className="hw-tint hw-tint--region">
                  <div className="hw-tint-head"><span className="hw-icon-badge" style={stepColor("var(--teal)")}><Ico name="folder" /></span><h3>Do you already have a validated list?</h3></div>
                  <p className="hw-lead hw-lead-wide">This decides how the Agent gets started for the region(s) you checked in step 1. Answer for whichever region
                    you have the most data for — you can give a different answer next time you run the wizard for another region.</p>
                </div>
                <div className="hw-pillrow">
                  <button type="button" className={`hw-pill ${hasList === "yes" ? "on" : ""}`} onClick={() => setHasList("yes")}>Yes, I have one</button>
                  <button type="button" className={`hw-pill ${hasList === "no" ? "on" : ""}`} onClick={() => setHasList("no")}>No — help me build one from scratch</button>
                </div>
                {hasList === "yes" && (
                  <div className="hw-upload-panel">
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
                      <a className="btn" href="/api/wizard-template" download>⬇ Download the template (.xlsx)</a>
                      <span className="hint">— optional, only if you&apos;re starting from scratch</span>
                    </div>
                    <p className="hw-lead hw-lead-justify">Already have a spreadsheet? You don&apos;t need to reshape it into the template — as long as it&apos;s
                      one worksheet, one company per row, with column headers in the first row, just drop it in below as-is. It can have as many columns
                      as you like; Account CoPilot picks out the fields it needs (company name, website, country, industry, HQ city) and leaves the rest alone.</p>
                    <label className="hw-dropzone">
                      <input type="file" accept=".xlsx,.xls" style={{ display: "none" }} disabled={uploadBusy}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ""; }} />
                      <span className="hw-dropzone-icon">📊</span>
                      <b>{uploadBusy ? "Uploading…" : "Drop your Excel file here, or click to browse"}</b>
                      <span className="hint">.xlsx or .xls only</span>
                    </label>
                    <div className="hw-upload-tips">
                      <p><b>Before you upload</b></p>
                      <ul>
                        <li>Just one worksheet — if there&apos;s more than one, only the first is read</li>
                        <li>Don&apos;t merge cells or add extra rows above the column headers</li>
                        <li>One company per row; leave a cell blank rather than &quot;N/A&quot; or &quot;-&quot;</li>
                      </ul>
                    </div>
                    {uploadMsg && <p className={`now-msg ${uploadMsg.ok ? "ok" : "err"}`}>{uploadMsg.text}</p>}
                  </div>
                )}
                {hasList === "no" && (
                  <div className="hw-about-card hw-yesno-no selected">
                    <h4>Nothing to do here</h4>
                    <p>Just continue to the next step — the free daily engine builds your list from nothing, using its own web search. It starts at a
                      slower pace until it has found and verified enough companies to feel complete; you&apos;ll set that pace in step 4.</p></div>
                )}
              </div>
            )}

            {step === 3 && (
              <div>
                <div className="hw-tint hw-tint--people">
                  <div className="hw-tint-head"><span className="hw-icon-badge" style={stepColor("var(--gold)")}><Ico name="crosshair" /></span><h3>Which domains do you want to target?</h3></div>
                  <p className="hw-lead hw-lead-wide">This decides which people at each company the Agent treats as decision-makers — who gets surfaced first on
                    Stakeholders, and whose seniority counts toward Pipeline rank. Pick as many as apply.</p>
                </div>
                <div>
                  {OPTIONS.domains.map((d) => (
                    <label key={d.key} className="hw-checkrow">
                      <input type="checkbox" checked={domains.includes(d.key)} onChange={() => toggleDomain(d.key)} />
                      {d.label}
                    </label>
                  ))}
                </div>
                <p className="hw-lead hw-lead-wide" style={{ marginTop: 12 }}>
                  {domains.length
                    ? <><b>Selected: {domains.map((k) => OPTIONS.domains.find((x) => x.key === k)?.label).join(", ")}.</b> The Agent prioritizes
                      matching titles when it scores contacts.</>
                    : "Pick at least one domain, or the wizard keeps whatever targeting is already saved for these regions."}
                </p>
              </div>
            )}

            {step === 4 && (
              <div>
                <div className="hw-tint hw-tint--data">
                  <div className="hw-tint-head"><span className="hw-icon-badge" style={stepColor("var(--sky)")}><Ico name="calendar" /></span><h3>Daily plan</h3></div>
                  <p className="hw-lead hw-lead-wide">Sets how much unattended work the daily run does, on your Claude plan at no extra cost. A good
                    starting point for extending an existing list: find 5 a day, verify 25.</p>
                </div>
                <label className="hw-field">New companies to find per day
                  <input type="number" min={0} max={50} value={draft.discoverPerDay} onChange={(e) => setDraft((d) => ({ ...d, discoverPerDay: Number(e.target.value) || 0 }))} />
                  <span className="hint">How many brand-new candidates the Agent searches for and adds each morning.</span></label>
                <label className="hw-field">Companies to verify per day
                  <input type="number" min={0} max={60} value={draft.verifyPerDay} onChange={(e) => setDraft((d) => ({ ...d, verifyPerDay: Number(e.target.value) || 0 }))} />
                  <span className="hint">How many existing companies get their revenue and size re-checked each morning, oldest checks first.</span></label>
                <label className="hw-checkrow"><input type="checkbox" checked={activateNow} onChange={(e) => setActivateNow(e.target.checked)} />
                  Turn the daily run <b>ON</b> now for {regionNames.length ? <b>{regionNames.join(", ")}</b> : "the regions checked in step 1"}</label>
                <span className="hint">Checked: these regions start the daily run automatically once you save. Unchecked: everything above is still
                  saved, but nothing runs until you come back and turn it on.</span>

                <div className="hw-tint hw-tint--data" style={{ marginTop: 18 }}>
                  <div className="hw-tint-head"><span className="hw-icon-badge" style={stepColor("var(--sky)")}><Ico name="coin" /></span><h3>Free daily pace, or paid profiling?</h3></div>
                  <p className="hw-lead hw-lead-wide">The plan above is entirely free — your Claude plan, not the Anthropic API key. Paid profiling is a
                    different, separate action for when you want Claude to go deeper on companies than the free daily pace allows. This button
                    doesn&apos;t start anything or spend anything — it just decides whether to show you what that would cost.</p>
                </div>
                <div className="hw-pillrow">
                  <button type="button" className={`hw-pill ${wantsProfiling === "free" ? "on" : ""}`} onClick={() => setWantsProfiling("free")}>Free daily pace only</button>
                  <button type="button" className={`hw-pill ${wantsProfiling === "paid" ? "on" : ""}`} onClick={() => setWantsProfiling("paid")}>Paid profiling</button>
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
                    <p className="hint" style={{ marginTop: 8 }}>These rates are for reference only — nothing here is selectable or charged. To
                      actually run one, go to <b>Data → Research Queue</b> and pick Quick, Standard or Deep there (or use <b>Research more</b>,
                      in the Discovery panel on the left side of the <b>Dashboard</b> page). Either way you approve the cost before anything runs,
                      and a Super Admin can require a PIN.</p>
                  </div>
                )}
              </div>
            )}

            {step === 5 && (
              <div>
                <div className="hw-tint hw-tint--data">
                  <div className="hw-tint-head"><span className="hw-icon-badge" style={stepColor("var(--sky)")}><Ico name="database" /></span><h3>Which data sources do you have?</h3></div>
                  <p className="hw-lead hw-lead-wide">Informational only — this doesn&apos;t change what the Agent searches. Seamless.ai is the one source genuinely
                    connected and in use today, for contact enrichment. Everything else below is just your own inventory — tick what you have a
                    subscription to, so anyone on the team knows what&apos;s available; nothing here connects automatically.</p>
                </div>
                <div className="hw-checkrow">Seamless.ai <span className="hw-tag-sm">connected</span></div>
                {[...KNOWN_SOURCES, ...sources.custom].map((name) => (
                  <div key={name}>
                    <label className="hw-checkrow">
                      <input type="checkbox" checked={sources.checked.includes(name)} onChange={() => toggleSource(name)} />
                      {name} <span className="hint" style={{ marginLeft: 4 }}>— not connected to this app yet</span>
                    </label>
                    {sources.checked.includes(name) && (
                      <p className="hw-connect-note">{name} isn&apos;t connected to Account CoPilot yet — connecting it would let the Agent pull from
                        it directly instead of just knowing you subscribe to it. To connect it, ask a Super Admin to set it up as a Claude
                        connector in Settings, the same way HubSpot and Seamless.ai are connected.</p>
                    )}
                  </div>
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
                <div className="hw-tint hw-tint--review">
                  <div className="hw-tint-head"><span className="hw-icon-badge" style={stepColor("var(--muted)")}><Ico name="clipboard" /></span><h3>Review</h3></div>
                  <p className="hw-lead hw-lead-wide">Here&apos;s what this sets up, in plain terms. Nothing is saved until you press Save &amp; apply below.</p>
                </div>
                <p className="hw-lead hw-lead-wide" style={{ marginBottom: 16 }}>
                  You&apos;re setting up <b>{regionNames.length || 0} region{regionNames.length === 1 ? "" : "s"}</b>
                  {regionNames.length ? <> ({regionNames.join(", ")})</> : null}{" "}
                  {uniformSize ? <>with a bar of <b>{usdM(sizeFor(regions[0]).revenue)} revenue</b> and <b>{sizeFor(regions[0]).employees}+ employees</b></>
                    : <>each with its own revenue and employee bar (see below)</>}. {activateNow ? "Once you save, the daily run switches on for these regions" : "These rules save now, but the daily run stays paused for these regions until you activate them"} —
                  every day it looks for <b>{draft.discoverPerDay} new</b> matching companies and re-checks <b>{draft.verifyPerDay} existing</b> ones,
                  weighted toward {domains.length ? domains.map((k) => OPTIONS.domains.find((x) => x.key === k)?.label).join(", ") : "your current targeting"}.
                  All of this runs on your Claude plan, at no extra cost.{wantsProfiling === "paid" ? " Whenever you want it to go deeper than that free pace, Research Queue (Data tab) or Research more (the left panel on Dashboard) will do it, at the rates shown in the previous step." : ""}
                </p>
                <p className="hw-lead hw-lead-wide" style={{ marginBottom: 16 }}>
                  <b>When to expect something worth looking at:</b> the first new and re-checked companies land within a day or two of the run
                  switching on. A dataset that&apos;s broadly verified across everything in these regions typically takes <b>2–4 weeks</b> to build up
                  at this pace — sooner if you&apos;re starting from an existing list, longer for a region starting from nothing.
                </p>
                <div className="hw-review-grid">
                  <div className="hw-review-row hw-review-row--region">
                    <span className="k">Regions</span>
                    <span className="v">{regionNames.length ? regionNames.join(", ") : "none checked"}{activateNow ? " — will be Active" : startingRegions.length ? ` — ${startingRegions.join(", ")} will move to Paused` : ""}</span>
                  </div>
                  <div className="hw-review-row hw-review-row--region">
                    <span className="k">Company size</span>
                    <span className="v">{uniformSize ? `revenue ≥ ${usdM(sizeFor(regions[0]).revenue)}, employees ≥ ${sizeFor(regions[0]).employees}`
                      : regions.map((k) => `${REGIONS.find((r) => r.key === k)?.name || k}: revenue ≥ ${usdM(sizeFor(k).revenue)}, employees ≥ ${sizeFor(k).employees}`).join(" · ")}</span>
                  </div>
                  <div className="hw-review-row hw-review-row--people">
                    <span className="k">Targeting</span>
                    <span className="v">{domains.length ? domains.map((k) => OPTIONS.domains.find((x) => x.key === k)?.label).join(", ") : "no change to current targeting"}</span>
                  </div>
                  <div className="hw-review-row hw-review-row--data">
                    <span className="k">Daily plan</span>
                    <span className="v">find {draft.discoverPerDay}, verify {draft.verifyPerDay} per day</span>
                  </div>
                </div>
                <button type="button" className="btn primary" disabled={saving || !regions.length} onClick={save} style={{ marginTop: 16 }}>{saving ? "Saving…" : "Save & apply"}</button>
              </div>
            )}

            <div className="row-actions" style={{ marginTop: 18 }}>
              {step > 1 && <button type="button" className="btn" onClick={() => setStep((s) => s - 1)}>Back</button>}
              {step < 6 && <button type="button" className="btn primary" onClick={() => setStep((s) => s + 1)}>Next</button>}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
