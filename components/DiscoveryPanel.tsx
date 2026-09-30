"use client";
import { useState } from "react";
import Link from "next/link";
import { OPTIONS, UNAVAILABLE_ENGAGEMENT, DEFAULT_CRITERIA, activeCount, type Criteria } from "@/lib/icp";
import { fmtDate } from "@/lib/dates";

const LABEL: Record<string, string> = { banking_financial: "Banking & financial", chemicals_oil_gas: "Oil, gas & chemicals", construction: "Construction",
  healthcare_pharma: "Healthcare & pharma", hospitality: "Hospitality & leisure", logistics_shipping: "Logistics & aviation", mining_resources: "Metals & mining",
  professional_services: "Professional services", retail_lifestyle: "Retail, food & consumer", tech_ai: "Technology & telecom", utilities: "Utilities" };

// Human name for each criteria field, so the summary can say which filters are active, not just how many.
const FIELD_LABEL: Record<string, string> = {
  name: "Company name", website: "Website", hq: "HQ", industries: "Industries", countries: "Countries", regions: "Regions", ownership: "Ownership",
  revenue: "Revenue", employees: "Employees", erp: "ERP", procurement: "Procurement", integration: "Integration", triggers: "Triggers", financial: "Financial",
  firstName: "First name", lastName: "Last name", title: "Title", email: "Email", phone: "Phone", linkedin: "LinkedIn",
  seniority: "Seniority", departments: "Departments", roles: "Roles", intelligence: "Intelligence", engagement: "Engagement",
};
function activeFields(c: Criteria): string[] {
  const on = (v: unknown) => (Array.isArray(v) ? v.length > 0 : !!v);
  return [...Object.entries(c.company).filter(([, v]) => on(v)).map(([k]) => FIELD_LABEL[k] || k),
    ...Object.entries(c.contact).filter(([, v]) => on(v)).map(([k]) => FIELD_LABEL[k] || k)];
}

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
export default function DiscoveryPanel({ criteria: applied, onApply, onSave, savedMeta, teamCriteria, collapsed, onToggle, matches, country, researchTargets = [], onResearch, researchMsg, isSuper = true }: {
  criteria: Criteria; onApply: (c: Criteria) => void; onSave: (c: Criteria) => Promise<SaveResult>; savedMeta: { by?: string; at?: string } | null; teamCriteria: Criteria | null;
  collapsed: boolean; onToggle: () => void; matches: { accounts: number; contacts: number }; country: string; researchTargets?: string[];
  onResearch: (limit: number, profile: boolean) => void; researchMsg: string; isSuper?: boolean;
}) {
  // Three jobs: 1 search the app, 2 filter your view (instant, only for you; Undo / Share as team default), 3 find new companies on the web (paid).
  const criteria = applied, onChange = onApply;
  const base = teamCriteria || DEFAULT_CRITERIA;
  const dirty = JSON.stringify(criteria) !== JSON.stringify(base);
  const [saveRes, setSaveRes] = useState<SaveResult | null>(null);
  const [tab, setTab] = useState<"company" | "contact">("company");
  const [limit, setLimit] = useState(5);
  const [profile, setProfile] = useState(false);
  const co = criteria.company, ct = criteria.contact;
  const setCo = (k: keyof Criteria["company"], v: unknown) => onChange({ ...criteria, company: { ...co, [k]: v } });
  const setCt = (k: keyof Criteria["contact"], v: unknown) => onChange({ ...criteria, contact: { ...ct, [k]: v } });
  const n = activeCount(criteria);
  // How many filters differ from the team's saved ones (for the footer).
  const changed = [...Object.keys(criteria.company), ...Object.keys(criteria.contact).map((k) => `c:${k}`)].filter((k) => {
    const [a, b] = k.startsWith("c:") ? [criteria.contact[k.slice(2) as keyof Criteria["contact"]], base.contact[k.slice(2) as keyof Criteria["contact"]]]
      : [criteria.company[k as keyof Criteria["company"]], base.company[k as keyof Criteria["company"]]];
    return JSON.stringify(a) !== JSON.stringify(b);
  }).length + (criteria.showSpend !== base.showSpend ? 1 : 0);
  const where = researchTargets.length > 1 ? `${researchTargets.slice(0, -1).join(", ")} and ${researchTargets[researchTargets.length - 1]}` : researchTargets[0] || "";

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
      <div className="dp-stats">
        <div className="dp-stat"><b>{matches.accounts}</b><span>Accounts matching</span></div>
        <div className="dp-stat"><b>{matches.contacts}</b><span>Contacts matching</span></div>
        <div className="dp-stat"><b>{n}</b><span>Filters active</span>
          {n > 0 && <em className="dp-active-fields">{activeFields(criteria).join(" · ")}</em>}</div>
      </div>
      <div className="dp-step s1">
        <p className="dp-step-h"><span className="dp-n">1</span>Search the app</p>
        <p className="dp-step-sub">Find a company already in the app. Free, instant; filters every tab.</p>
        <input type="search" className="dp-search" value={co.name} onChange={(e) => setCo("name", e.target.value)} placeholder="Company name…" aria-label="Search companies in the app" />
      </div>
      <p className="dp-step-h s2h"><span className="dp-n">2</span>Filter your view</p>
      <p className="dp-step-sub s2sub">Changes apply straight away and only for you.</p>
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

      <div className="dp-research dp-step s3" id="dp-research">
        <p className="dp-step-h"><span className="dp-n">3</span>Find new companies on the web</p>
        <p className="dp-step-sub">{where ? <>Adds companies not yet in the app, in <b>{where}</b> ({applied.company.countries.length ? "the countries ticked in step 2" : `the ${country} tile you are viewing`}). Same ICP rules: group HQs only; no government bodies, single sites or foreign branches.</> : "Tick a country in step 2 first."}</p>
        <div className="dp-find">Find up to <select className="dp-amber" value={limit} onChange={(e) => setLimit(Number(e.target.value))}>{[3, 5, 10].map((x) => <option key={x}>{x}</option>)}</select>{researchTargets.length > 1 ? " per country" : ""}</div>
        <label className="dp-deep"><input type="checkbox" checked={profile} onChange={(e) => setProfile(e.target.checked)} /> Also research each one in depth</label>
        <button type="button" className="btn primary dp-go" disabled={!researchTargets.length} onClick={() => onResearch(limit, profile)}>Search the web{where ? ` — ${where}` : ""}</button>
        <p className="dp-cost">Uses the Anthropic API ≈ {profile ? "$0.50–1.00 per search + $0.55 per company researched" : "$0.50–1.00 per search"}{researchTargets.length > 1 ? ` × ${researchTargets.length} countries` : ""} · asks for your PIN</p>
        {researchMsg && <p className="dp-saved">{researchMsg}</p>}
      </div>
      <div className="dp-foot">
        {!dirty ? <p className="dp-state">✓ Showing the <b>team&apos;s filters</b>{savedMeta?.at && <> (saved {fmtDate(savedMeta.at)}{savedMeta.by && ` by ${savedMeta.by}`})</>}</p>
          : <>
            <p className="dp-state changed">You changed {changed || "some"} filter{changed === 1 ? "" : "s"} — only you see this view.</p>
            <div className="dp-acts">
              <button type="button" className="btn" onClick={() => { onChange(base); setSaveRes(null); }}>Undo my changes</button>
              {isSuper && <button type="button" className="btn" title="Makes these filters everyone's starting view" onClick={async () => { setSaveRes(null); setSaveRes(await onSave(criteria)); }}>Share as team default</button>}
            </div>
          </>}
        {saveRes && (saveRes.ok ? <p className="dp-note ok">✓ Shared. Everyone now starts from these filters.</p> : <p className="dp-note bad">Couldn&apos;t share: {saveRes.error}</p>)}
      </div>
    </aside>
  );
}
