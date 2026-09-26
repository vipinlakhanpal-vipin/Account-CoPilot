"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import CostNote from "@/components/CostNote";
import { OPTIONS, UNAVAILABLE_ENGAGEMENT, DEFAULT_CRITERIA, activeCount, type Criteria } from "@/lib/icp";

const LABEL: Record<string, string> = { banking_financial: "Banking & financial", chemicals_oil_gas: "Oil, gas & chemicals", construction: "Construction",
  healthcare_pharma: "Healthcare & pharma", hospitality: "Hospitality & leisure", logistics_shipping: "Logistics & aviation", mining_resources: "Metals & mining",
  professional_services: "Professional services", retail_lifestyle: "Retail, food & consumer", tech_ai: "Technology & telecom", utilities: "Utilities" };

function Chips({ label, options, value, onChange, disabled = [] }: { label: string; options: readonly string[]; value: string[]; onChange: (v: string[]) => void; disabled?: string[] }) {
  return (
    <fieldset className="dp-field">
      <legend>{label}{value.length > 0 && <button type="button" className="dp-clear" onClick={() => onChange([])}>clear</button>}</legend>
      <div className="dp-chips">
        {options.map((o) => {
          const off = disabled.includes(o), on = value.includes(o);
          return <button key={o} type="button" className={`dp-chip${on ? " on" : ""}`} aria-pressed={on} disabled={off}
            title={off ? "Needs a data source the app does not have yet (e.g. LinkedIn activity)" : undefined}
            onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}>{LABEL[o] || o}</button>;
        })}
      </div>
    </fieldset>
  );
}
function Text({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <label className="dp-text"><span>{label}</span><input type="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} /></label>;
}
function Section({ title, children, open = false }: { title: string; children: React.ReactNode; open?: boolean }) {
  return <details className="dp-sec" open={open}><summary>{title}</summary><div className="dp-body">{children}</div></details>;
}

// Left-side "Account Discovery Criteria" panel. Criteria filter and rank every view; Save stores them for the whole team.
export type SaveResult = { ok: boolean; error?: string; by?: string; at?: string };
// Criteria edits are a draft until Refresh (apply) or Save (apply + store for the team). Reset asks first.
export default function DiscoveryPanel({ criteria: applied, onApply, onSave, savedMeta, collapsed, onToggle, matches, country, onResearch, researchMsg }: {
  criteria: Criteria; onApply: (c: Criteria) => void; onSave: (c: Criteria) => Promise<SaveResult>; savedMeta: { by?: string; at?: string } | null;
  collapsed: boolean; onToggle: () => void; matches: { accounts: number; contacts: number }; country: string;
  onResearch: (limit: number, profile: boolean) => void; researchMsg: string;
}) {
  const [criteria, onChange] = useState<Criteria>(applied);
  useEffect(() => { onChange(applied); }, [applied]);
  const dirty = JSON.stringify(criteria) !== JSON.stringify(applied);
  const [action, setAction] = useState<"" | "refresh" | "save" | "reset">("");
  const [saveRes, setSaveRes] = useState<SaveResult | null>(null);
  const [tab, setTab] = useState<"company" | "contact">("company");
  const [limit, setLimit] = useState(5);
  const [profile, setProfile] = useState(false);
  const co = criteria.company, ct = criteria.contact;
  const setCo = (k: keyof Criteria["company"], v: unknown) => onChange({ ...criteria, company: { ...co, [k]: v } });
  const setCt = (k: keyof Criteria["contact"], v: unknown) => onChange({ ...criteria, contact: { ...ct, [k]: v } });
  const n = activeCount(criteria);

  if (collapsed) return (
    <aside className="dp dp-collapsed" aria-label="Account Discovery Criteria">
      <button type="button" className="dp-toggle" onClick={onToggle} title="Open Account Discovery Criteria" aria-expanded="false">
        <span aria-hidden="true">☰</span><span className="dp-vert">Discovery criteria{n ? ` · ${n}` : ""}</span>
      </button>
    </aside>
  );

  return (
    <aside className="dp" aria-label="Account Discovery Criteria">
      <div className="dp-head">
        <h2>Account Discovery Criteria</h2>
        <button type="button" className="dp-toggle-sm" onClick={onToggle} aria-expanded="true" title="Collapse panel">«</button>
      </div>
      <p className="dp-summary"><b>{matches.accounts}</b> accounts · <b>{matches.contacts}</b> contacts match · {n} criteria set{dirty && <span className="dp-dirty"> · changes not applied</span>}</p>
      <div className="dp-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "company"} onClick={() => setTab("company")}>Company</button>
        <button type="button" role="tab" aria-selected={tab === "contact"} onClick={() => setTab("contact")}>Contact</button>
      </div>

      {tab === "company" ? (
        <div className="dp-scroll">
          <Section title="Company attributes" open>
            <Text label="Company name" value={co.name} onChange={(v) => setCo("name", v)} />
            <Text label="Website" value={co.website} onChange={(v) => setCo("website", v)} placeholder="e.g. .ae" />
            <Text label="Headquarters location" value={co.hq} onChange={(v) => setCo("hq", v)} placeholder="e.g. Dubai" />
            <Chips label="Country" options={OPTIONS.regions} value={co.countries} onChange={(v) => setCo("countries", v)} />
            <Chips label="Operating regions" options={OPTIONS.regions} value={co.regions} onChange={(v) => setCo("regions", v)} />
            <Chips label="Industry" options={OPTIONS.industries} value={co.industries} onChange={(v) => setCo("industries", v)} />
            <Chips label="Ownership type" options={OPTIONS.ownership} value={co.ownership} onChange={(v) => setCo("ownership", v)} />
          </Section>
          <Section title="Company size" open>
            <Chips label="Annual revenue" options={OPTIONS.revenue} value={co.revenue} onChange={(v) => setCo("revenue", v)} />
            <Chips label="Employees" options={OPTIONS.employees} value={co.employees} onChange={(v) => setCo("employees", v)} />
          </Section>
          <Section title="Procurement & spend intelligence" open>
            <p className="dp-q">Show procurement spend and transaction estimates on account briefs?</p>
            <div className="dp-yn">
              <button type="button" className={criteria.showSpend ? "on" : ""} onClick={() => onChange({ ...criteria, showSpend: true })}>Yes, show estimates</button>
              <button type="button" className={!criteria.showSpend ? "on" : ""} onClick={() => onChange({ ...criteria, showSpend: false })}>No</button>
            </div>
            <p className="dp-note">Companies don't publish spend, invoice or PO volumes. These are <b>estimates from industry benchmarks</b> applied to revenue: total addressable, direct, indirect, MRO, services and CAPEX spend, procurement budget, monthly invoices and POs, supplier counts and transactions. They are always labelled ESTIMATE.</p>
          </Section>
          <Section title="Technology landscape">
            <Chips label="ERP" options={OPTIONS.erp} value={co.erp} onChange={(v) => setCo("erp", v)} />
            <Chips label="Procurement platform" options={OPTIONS.procurement} value={co.procurement} onChange={(v) => setCo("procurement", v)} />
            <Chips label="Integration platform" options={OPTIONS.integration} value={co.integration} onChange={(v) => setCo("integration", v)} />
          </Section>
          <Section title="Business triggers">
            <Chips label="Companies experiencing" options={OPTIONS.triggers} value={co.triggers} onChange={(v) => setCo("triggers", v)} />
          </Section>
          <Section title="Financial indicators">
            <Chips label="Look for" options={OPTIONS.financial} value={co.financial} onChange={(v) => setCo("financial", v)} />
            <p className="dp-note">Used by the Opportunity score (growth, acquisitions, expansion evidence in research).</p>
          </Section>
        </div>
      ) : (
        <div className="dp-scroll">
          <Section title="Contact information" open>
            <Text label="First name" value={ct.firstName} onChange={(v) => setCt("firstName", v)} />
            <Text label="Last name" value={ct.lastName} onChange={(v) => setCt("lastName", v)} />
            <Text label="Job title contains" value={ct.title} onChange={(v) => setCt("title", v)} placeholder="e.g. procurement" />
            <Text label="Email contains" value={ct.email} onChange={(v) => setCt("email", v)} />
            <Text label="Phone contains" value={ct.phone} onChange={(v) => setCt("phone", v)} />
            <Text label="LinkedIn URL contains" value={ct.linkedin} onChange={(v) => setCt("linkedin", v)} />
            <Chips label="Seniority" options={OPTIONS.seniority} value={ct.seniority} onChange={(v) => setCt("seniority", v)} />
            <Chips label="Department" options={OPTIONS.departments} value={ct.departments} onChange={(v) => setCt("departments", v)} />
          </Section>
          <Section title="Procurement buying committee" open>
            <Chips label="Roles" options={OPTIONS.roles} value={ct.roles} onChange={(v) => setCt("roles", v)} />
          </Section>
          <Section title="Contact intelligence">
            <Chips label="Buying role" options={OPTIONS.intelligence} value={ct.intelligence} onChange={(v) => setCt("intelligence", v)} />
            <p className="dp-note">Derived from title and tier (e.g. CFO = Economic Buyer; procurement head = Champion; CIO / IT = Technical Evaluator).</p>
          </Section>
          <Section title="Engagement signals">
            <Chips label="Signals" options={OPTIONS.engagement} value={ct.engagement} onChange={(v) => setCt("engagement", v)} disabled={UNAVAILABLE_ENGAGEMENT} />
            <p className="dp-note">Promotions, new hires and company changes come from employment checks. LinkedIn activity and event attendance need a data source the app doesn't have (LinkedIn can't be scraped).</p>
          </Section>
        </div>
      )}

      <div className="dp-research" id="dp-research">
        <b>Research more in {country === "All" ? "a country (pick one above)" : country}</b>
        <p className="dp-note">Searches the web for new companies in this country that match the criteria above (same ICP rules: group HQs only; no government bodies, single sites or foreign branches), and adds them as "Claude discovery".</p>
        <div className="dp-rrow">
          <label>Find up to <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}>{[3, 5, 10].map((n) => <option key={n}>{n}</option>)}</select></label>
          <label><input type="checkbox" checked={profile} onChange={(e) => setProfile(e.target.checked)} /> and profile each</label>
        </div>
        <button type="button" className="btn" disabled={country === "All"} onClick={() => onResearch(limit, profile)}>Research more</button>
        <CostNote cost={profile ? `≈ $0.50–1.00 + $0.55 per company profiled (up to ≈ $${(1 + limit * 0.55).toFixed(2)})` : "≈ $0.50–1.00 per search"} />
        {researchMsg && <p className="dp-saved">{researchMsg}</p>}
      </div>
      <div className="dp-foot">
        <div className="dp-seg" role="group" aria-label="Criteria actions">
          <button type="button" aria-pressed={action === "refresh"} onClick={() => { onApply(criteria); setAction("refresh"); }}>↻ Refresh</button>
          <button type="button" aria-pressed={action === "save"} onClick={async () => { setAction("save"); setSaveRes(null); onApply(criteria); setSaveRes(await onSave(criteria)); }}>✓ Save</button>
          <button type="button" aria-pressed={action === "reset"} onClick={() => setAction("reset")}>↺ Reset</button>
        </div>
        {action === "refresh" && <div className="dp-out">
          <b>Results refreshed</b><p>Your criteria were re-applied to every tab.</p>
          <div className="dp-stats"><div><small>Pipeline</small><b>{matches.accounts}</b></div><div><small>Contacts</small><b>{matches.contacts}</b></div></div>
          <div className="dp-acts"><Link href="/?tab=pipeline" className="btn tiny">Open pipeline</Link><Link href="/?tab=stakeholders" className="btn tiny">Open stakeholders</Link></div></div>}
        {action === "save" && <div className="dp-out">
          {!saveRes ? <p>Saving…</p> : saveRes.ok ? <>
            <b className="ok">✓ Saved as team ICP</b>
            <p>Everyone now ranks accounts with these criteria.{saveRes.at && ` Saved ${new Date(saveRes.at).toLocaleString()}`}{saveRes.by && ` by ${saveRes.by}`}.</p>
            <p className="dp-note">{n} criteria · {[...criteria.company.countries, ...criteria.company.revenue.slice(0, 1).map((r) => `${r}+`), ...criteria.company.industries.slice(0, 2), ...criteria.company.procurement].join(" · ") || "default ICP"}</p>
            <div className="dp-acts"><Link href="/?tab=pipeline" className="btn tiny">Open pipeline</Link><a href="#dp-research" className="btn tiny">Research more with these</a></div></>
            : <b className="bad">Couldn't save: {saveRes.error}</b>}</div>}
        {action === "reset" && <div className="dp-out">
          <b className="warn">Reset to the default ICP?</b>
          <p>Clears your {n} criteria and goes back to revenue $250M+, 100+ staff, UAE. The saved team ICP isn't changed until you save.</p>
          <div className="dp-acts"><button type="button" className="btn tiny" onClick={() => { onChange(DEFAULT_CRITERIA); onApply(DEFAULT_CRITERIA); setAction("refresh"); }}>Reset criteria</button>
            <button type="button" className="btn tiny ghost" onClick={() => setAction("")}>Keep my criteria</button></div></div>}
        {!action && savedMeta?.at && <p className="dp-note">Team ICP last saved {new Date(savedMeta.at).toLocaleString()}{savedMeta.by && ` by ${savedMeta.by}`}.</p>}
      </div>
    </aside>
  );
}
