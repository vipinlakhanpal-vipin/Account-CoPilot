"use client";
import { useState } from "react";
import Link from "next/link";
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
export default function DiscoveryPanel({ criteria, onChange, onSave, saved, collapsed, onToggle, matches }: {
  criteria: Criteria; onChange: (c: Criteria) => void; onSave: () => void; saved: string; collapsed: boolean; onToggle: () => void;
  matches: { accounts: number; contacts: number };
}) {
  const [tab, setTab] = useState<"company" | "contact">("company");
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
      <p className="dp-summary"><b>{matches.accounts}</b> accounts · <b>{matches.contacts}</b> contacts match · {n} criteria set</p>
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
          <Section title="Procurement & spend intelligence">
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

      <div className="dp-foot">
        <button type="button" className="btn primary" onClick={onSave}>Save as team ICP</button>
        <button type="button" className="btn ghost" onClick={() => onChange(DEFAULT_CRITERIA)}>Reset</button>
        {saved && <span className="dp-saved">{saved}</span>}
        <Link href="/?tab=pipeline" className="dp-link">Open ranked pipeline →</Link>
      </div>
    </aside>
  );
}
