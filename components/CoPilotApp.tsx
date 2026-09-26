"use client";
import CostNote from "@/components/CostNote";
import { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Hero from "@/components/Hero";
import type { AllData, Row } from "@/lib/data";
import { ALL, COUNTRIES, DEFAULT_COUNTRY, countryCode } from "@/lib/countries";
import DiscoveryPanel from "@/components/DiscoveryPanel";
import { SOURCES, indexSources, evidenceGroup } from "@/lib/sources";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { withDefaults, icpMatch, opportunity, coupaFit, companyPasses, contactMatches, estimateSpend, whySelected, recommendedActions,
  type Criteria, type Score } from "@/lib/icp";

const HERO: Record<string, [string, string]> = {
  dashboard: ["Dashboard", "A live snapshot of UAE target accounts, S2P signals, ERP landscape and decision makers."],
  accounts: ["Accounts", "Every account with ICP status, S2P platform and signal strength. Select one to open its brief."],
  stakeholders: ["Stakeholders", "Company and contact details for campaign planning. Emails are never pattern-guessed."],
  signals: ["S2P Signals", "Evidence-based Source-to-Pay, Coupa and SAP Ariba signals, strongest first."],
  erp: ["ERP & Apps", "ERP landscape and third-party applications, with how each was verified."],
  conflicts: ["Conflicts", "Where sources disagree. Both values are kept for you to resolve."],
  sources: ["Sources", "Where every company and fact comes from. Select a source tile to see the companies profiled from it; the catalogue explains what each source provides and how far to trust it."],
  pipeline: ["Pipeline", "Accounts ranked by ICP Match, Opportunity and Coupa Fit against your discovery criteria. Select one for why it was selected and what to do next."],
};
type Scores = { m: Score; o: Score; f: ReturnType<typeof coupaFit>; rank: number };
const ScoreChip = ({ s, label }: { s: Score; label: string }) => (
  <span className={`score ${s.total >= 70 ? "hi" : s.total >= 45 ? "mid" : "lo"}`} title={`${label} ${s.total}/100\n` + s.parts.map((p) => `${p.label}: ${p.score}/${p.max} — ${p.why}`).join("\n")}>{s.total}</span>);

const SIG = ["VERY STRONG SIGNAL", "STRONG SIGNAL", "MODERATE SIGNAL", "WEAK SIGNAL", "NO SIGNAL", "CONFLICTING SIGNAL"];
const PALETTE = ["#3AA0FF", "#2ECC8F", "#9B6BFF", "#F5A623", "#6C7BFF", "#FF4D6A", "#2EC4A6", "#E052C8", "#5AD1FF", "#B6E36B"];
const SIGVAR: Record<string, string> = { VERY: "--sig-vs", STRONG: "--sig-s", MODERATE: "--sig-m", WEAK: "--sig-w", NO: "--sig-n", CONFLICTING: "--sig-c" };
const sigRank = (s?: string) => { const i = SIG.indexOf(s || ""); return i < 0 ? 9 : i; };
/** Revenue is stored in USD millions: 6040 → "$6.04B", 600 → "$600M". */
export const usd = (m: unknown) => {
  const n = Number(m);
  if (m === null || m === undefined || m === "" || !isFinite(n) || n <= 0) return "";
  if (n >= 1000) return `$${(n / 1000).toFixed(2).replace(/\.?0+$/, "")}B`;
  return `$${n >= 100 ? Math.round(n) : n.toFixed(1).replace(/\.0$/, "")}M`;
};
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
// Record dates: when the account was added, last updated, and when its ICP status last changed.
const day = (v: unknown) => str(v).slice(0, 10);
const statusSince = (a: Row) => day(a.profile?.["Status changed"]?.at || a.last_verified || a.created_at);
const Dates = ({ a }: { a: Row }) => (
  <span className="mono rec-dates" title={`Added ${day(a.created_at) || "—"} · Updated ${day(a.updated_at) || "—"} · Status since ${statusSince(a) || "—"}`}>
    {day(a.updated_at) || "—"}<div className="muted">added {day(a.created_at) || "—"}</div></span>);

// Role family is a department, never a data source. Unrecognised values fall into OTHER.
const famKey = (f: unknown) => {
  const v = str(f).toUpperCase();
  if (!v || v.length > 40) return "OTHER";
  if (/PROCURE|SOURCING|PURCHAS|CONTRACT/.test(v)) return "PROCUREMENT";
  if (/SUPPLY|LOGISTIC/.test(v)) return "SUPPLY CHAIN";
  if (/FINANC|CFO|ACCOUNT|TREASUR/.test(v)) return "FINANCE";
  if (/TRANSFORM/.test(v)) return "TRANSFORMATION";
  if (/^IT\b|IT\/|ERP|TECH|DIGITAL|DATA|INFORMATION/.test(v)) return "IT";
  if (/EXEC|CEO|CHAIR|BOARD|MANAGING DIRECTOR/.test(v)) return "EXECUTIVE";
  return "OTHER";
};
const erpKey = (e: unknown) => {
  const v = str(e || "Unknown");
  if (/unknown|not identified|no evidence/i.test(v)) return "Unknown";
  if (/s\/4/i.test(v)) return "SAP S/4HANA";
  if (/sap/i.test(v)) return "SAP (ECC / other)";
  if (/fusion|oracle cloud/i.test(v)) return "Oracle Fusion Cloud ERP";
  if (/e-business|ebs/i.test(v)) return "Oracle E-Business Suite";
  if (/oracle/i.test(v)) return "Oracle (other)";
  if (/dynamics|microsoft/i.test(v)) return "Microsoft Dynamics";
  return v.split(/[;(,]/)[0].trim();
};

const ICP_ORDER = ["ICP — Verified", "ICP — Likely", "ICP — Needs check", "Unknown", "Not ICP"];
const icpRank = (s?: string) => { const i = ICP_ORDER.indexOf(String(s)); return i < 0 ? 9 : i; };
const ICP_CLS: Record<string, string> = { "ICP — Verified": "icp-v", "ICP — Likely": "icp-l", "ICP — Needs check": "icp-c", "Not ICP": "icp-n", Unknown: "icp-u" };
const ICP_ICON: Record<string, string> = { "ICP — Verified": "✓", "ICP — Likely": "●", "ICP — Needs check": "!", "Not ICP": "✕", Unknown: "?" };
function IcpTag({ s, why }: { s?: string; why?: string }) {
  if (!s) return null;
  return <span className={`icp ${ICP_CLS[s] || "icp-u"}`} title={why || s}><i aria-hidden="true">{ICP_ICON[s] || "?"}</i>{s}</span>;
}
/** Best available revenue: verified > Claude research > your data > Seamless estimate. */
const bestRevenue = (a: Row): { v: number | null; src: string } => {
  const d = a.profile?.["Display revenue"];
  if (d?.value_usd_m) return { v: Number(d.value_usd_m), src: d.source };
  if (a.revenue_usd_m) return { v: Number(a.revenue_usd_m), src: "" };
  return { v: null, src: "" };
};

function Pill({ s }: { s?: string }) {
  if (!s) return null;
  return <span className={`pill s-${s.split(" ")[0]}`}>{s.replace(" SIGNAL", "")}</span>;
}
function Ext({ href, children }: { href?: string; children: React.ReactNode }) {
  return href && /^https?:/.test(href) ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> : null;
}
function StatusTag({ s }: { s?: string }) {
  if (!s) return null;
  const v = s.toUpperCase();
  return <span className={`tag ${v.startsWith("FACT") ? "fact" : v.startsWith("LIKELY") ? "likely" : "unv"}`}>{s}</span>;
}

function countBy(rows: Row[], fn: (r: Row) => string) {
  const m = new Map<string, number>();
  rows.forEach((r) => { const k = fn(r) || "Unknown"; m.set(k, (m.get(k) || 0) + 1); });
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
function Bars({ entries, order, signal }: { entries: [string, number][]; order?: (k: string) => number; signal?: boolean }) {
  const list = order ? [...entries].sort((a, b) => order(a[0]) - order(b[0])) : entries;
  const max = Math.max(1, ...list.map((e) => e[1]));
  return (
    <div className="bars">
      {list.map(([k, n], idx) => {
        const sv = signal ? SIGVAR[k.split(" ")[0]] : undefined;
        const colour = sv ? `var(${sv})` : PALETTE[idx % PALETTE.length];
        return (
          <div key={k} className="bar sigbar" style={{ "--c": colour } as React.CSSProperties}>
            <span className="lab" title={k}>{k}</span>
            <span className="trk"><span className="fill" style={{ width: `${((n / max) * 100).toFixed(1)}%` }} /></span>
            <span className="n">{n}</span>
          </div>
        );
      })}
    </div>
  );
}

type ColDef = { h: string; cell: (r: Row) => React.ReactNode; wrap?: boolean };
type FilterDef = { label: string; get: (r: Row) => string };

function FilterTable({ title, note, rows, cols, filters, search, onRow, unit = "rows" }: {
  title: string; note?: string; rows: Row[]; cols: ColDef[]; filters: FilterDef[]; search: (r: Row) => string; onRow?: (r: Row) => void; unit?: string;
}) {
  const [q, setQ] = useState("");
  const [fv, setFv] = useState<string[]>(filters.map(() => ""));
  const options = useMemo(() => filters.map((f) => [...new Set(rows.map(f.get).filter(Boolean))].sort()), [rows, filters]);
  const out = rows.filter((r) => (!q || search(r).toLowerCase().includes(q.toLowerCase())) && filters.every((f, i) => !fv[i] || f.get(r) === fv[i]));
  return (
    <>
      <h2 className="with-count">{title} <span className="count">{out.length.toLocaleString()} {unit}{out.length !== rows.length ? ` of ${rows.length.toLocaleString()}` : ""}</span></h2>
      {note && <p className="note">{note}</p>}
      <div className="filters">
        <input type="search" className={`flt-search${q ? " on" : ""}`} placeholder={`Search ${title.toLowerCase()}…`} aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} />
        {(q || fv.some(Boolean)) && <button type="button" className="btn clear" onClick={() => { setQ(""); setFv(filters.map(() => "")); }}>Clear filters</button>}
        {filters.map((f, i) => (
          <select key={f.label} aria-label={f.label} value={fv[i]} className={`flt f${(i % 8) + 1}${fv[i] ? " on" : ""}`} onChange={(e) => setFv(fv.map((x, j) => (j === i ? e.target.value : x)))}>
            <option value="">{f.label}: all</option>
            {options[i].map((o) => <option key={o}>{o}</option>)}
          </select>
        ))}

      </div>
      <p className="filter-count">{out.length} of {rows.length} rows
          {rows.some((r) => r.company_id) && <> · {new Set(out.map((r) => r.company_id)).size} {new Set(out.map((r) => r.company_id)).size === 1 ? "company" : "companies"}</>}</p>
      <div className="tablewrap">
        <table>
          <thead><tr><th className="num">#</th>{cols.map((c) => <th key={c.h}>{c.h}</th>)}</tr></thead>
          <tbody>
            {out.slice(0, 800).map((r, i) => (
              <tr key={r.id || i} className={onRow ? "click" : undefined} tabIndex={onRow ? 0 : undefined}
                onClick={(e) => { if (onRow && !(e.target as HTMLElement).closest("a")) onRow(r); }}
                onKeyDown={(e) => { if (onRow && e.key === "Enter") onRow(r); }}>
                <td className="num mono">{i + 1}</td>
                {cols.map((c) => <td key={c.h} className={c.wrap ? "wrap" : undefined}>{c.cell(r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function CoPilotApp({ data: all }: { data: AllData }) {
  const params = useSearchParams();
  const tab = params.get("tab") || "dashboard";
  const country = params.get("country") || DEFAULT_COUNTRY;
  // Everything below (dashboard, tabs, drill-downs) sees only the selected country's accounts and their linked rows.
  const data = useMemo<AllData>(() => {
    if (country === ALL) return all;
    const accounts = all.accounts.filter((a) => countryCode(a.country) === country);
    const ids = new Set(accounts.map((a) => a.id));
    const mine = (r: Row) => ids.has(r.company_id);
    return { ...all, accounts, contacts: all.contacts.filter(mine), signals: all.signals.filter(mine), sources: all.sources.filter(mine),
      conflicts: all.conflicts.filter(mine), apps: all.apps.filter(mine), history: all.history.filter(mine) };
  }, [all, country]);
  const [criteria, setCriteria] = useState<Criteria>(withDefaults());
  const [saved, setSaved] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try { setCollapsed(localStorage.getItem("dp-collapsed") === "1"); } catch {}
    supabaseBrowser().from("settings").select("value").eq("key", "icp_criteria").maybeSingle()
      .then(({ data: row }) => { if (row?.value) setCriteria(withDefaults(row.value as Criteria)); });
  }, []);
  const toggle = () => setCollapsed((c) => { try { localStorage.setItem("dp-collapsed", c ? "0" : "1"); } catch {} return !c; });
  async function saveCriteria() {
    const { error } = await supabaseBrowser().from("settings").upsert({ key: "icp_criteria", value: criteria, updated_at: new Date().toISOString() });
    setSaved(error ? `Could not save: ${error.message}` : "Saved for the team.");
    setTimeout(() => setSaved(""), 4000);
  }
  const [researchMsg, setResearchMsg] = useState("");
  async function researchMore(limit: number, profile: boolean) {
    const k = criteria.company;
    const est = profile ? `≈ $0.50–1.00 for the search plus ≈ $0.55 per company profiled (up to ≈ $${(1 + limit * 0.55).toFixed(2)})` : "≈ $0.50–1.00";
    if (!window.confirm(`Research more in ${country}: find up to ${limit} new companies matching your criteria${profile ? " and profile each one" : ""}.\n\nThis uses the Anthropic API: ${est}.\n\nContinue?`)) return;
    const summary = [`Revenue bands: ${k.revenue.join(", ") || "any (ICP minimum $250M)"}`, `Employees: ${k.employees.join(", ") || "100+"}`,
      k.industries.length && `Industries: ${k.industries.join(", ")}`, k.ownership.length && `Ownership: ${k.ownership.join(", ")}`,
      k.erp.length && `ERP: ${k.erp.join(", ")}`, k.procurement.length && `Procurement platform: ${k.procurement.join(", ")}`,
      k.triggers.length && `Business triggers: ${k.triggers.join(", ")}`, k.hq && `HQ: ${k.hq}`].filter(Boolean).join("\n");
    setResearchMsg("Starting…");
    const r = await fetch("/api/discover", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ country, limit, profile, criteria: summary }) });
    setResearchMsg(r.ok ? "Discovery started. Follow it in Research Queue; new companies appear under list \"Claude discovery\" (refresh the page when done)." : "Could not start discovery.");
  }
  // Criteria: text fields filter companies; everything else is scored so accounts are ranked, not hidden.
  const contactSet = Object.entries(criteria.contact).some(([, v]) => (Array.isArray(v) ? v.length : v));
  const A = useMemo(() => data.accounts.filter((a) => companyPasses(a, criteria)), [data.accounts, criteria]);
  const P = useMemo(() => { const ids = new Set(A.map((a) => a.id));
    return data.contacts.filter((p) => ids.has(p.company_id) && (!contactSet || contactMatches(p, criteria, data.history, famKey))); }, [data, A, criteria, contactSet]);
  const scores = useMemo(() => {
    const hires: Record<string, number> = {};
    data.history.forEach((h) => { if (/change|promot|join|hire/i.test(str(h.determination))) hires[h.company_id] = (hires[h.company_id] || 0) + 1; });
    const m: Record<string, Scores> = {};
    A.forEach((a) => { const x = icpMatch(a, criteria), o = opportunity(a, hires[a.id] || 0), f = coupaFit(a);
      m[a.id] = { m: x, o, f, rank: Math.round(x.total * 0.5 + o.total * 0.3 + f.total * 0.2) }; });
    return m;
  }, [A, criteria, data.history]);
  const [open, setOpen] = useState<string | null>(null);
  const [contact, setContact] = useState<string | null>(null);
  const [drill, setDrill] = useState<{ title: string; kind: Kind; rows: Row[] } | null>(null);
  const byCo = useMemo(() => {
    const m: Record<string, Row[]> = {};
    P.forEach((p) => { (m[p.company_id] ||= []).push(p); });
    return m;
  }, [P]);
  const openRow = (r: Row) => setOpen(r.company_id);
  useEffect(() => {
    // Escape closes the top-most panel first: contact card, then account brief, then drill-down
    const k = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setContact((c) => { if (c) return null; setOpen((o) => { if (o) return null; setDrill(null); return o; }); return c; });
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  let view: React.ReactNode = null;
  if (tab === "accounts") {
    view = <FilterTable unit="companies" title="Accounts" note="ICP = net revenue ≥ $250M and 100+ employees (stock listing not required). ✓ Verified: confirmed from an official source · ● Likely: your data / Seamless say ≥ $250M, not yet confirmed · ! Needs check: sources disagree about $250M · ? Unknown: no revenue figure yet · ✕ Not ICP: below $250M. Hover a status for the reason; select a row to open the account brief."
      rows={[...A].sort((a, b) => icpRank(a.icp_status) - icpRank(b.icp_status) || sigRank(a.s2p_signal_level) - sigRank(b.s2p_signal_level) || (bestRevenue(b).v || 0) - (bestRevenue(a).v || 0))}
      search={(a) => [a.company_name, a.industry, a.erp, a.existing_s2p_product, a.s2p_strong_signals].join(" ")}
      filters={[{ label: "ICP status", get: (a) => a.icp_status }, { label: "List", get: (a) => (a.lists || []).join(" + ") },
        { label: "Signal", get: (a) => a.s2p_signal_level }, { label: "S2P", get: (a) => a.existing_s2p_product }, { label: "Industry", get: (a) => a.industry },
        { label: "Exchange", get: (a) => a.exchange }, { label: "Country", get: (a) => a.country }]}
      cols={[{ h: "Company", cell: (a) => <><b>{a.company_name}</b><div className="muted mono">{a.exchange} {a.ticker}</div></> },
        { h: "Industry", cell: (a) => a.industry }, { h: "Revenue", cell: (a) => { const r = bestRevenue(a); return r.v ? <><span className="mono">{usd(r.v)}</span>{r.src && <div className="rev-src">{r.src}</div>}</> : <span className="muted">—</span>; } },
        { h: "ICP status", cell: (a) => <><IcpTag s={a.icp_status} why={a.icp_fit_reason} /><div className="muted mono rec-since">since {statusSince(a) || "—"}</div></> },
        { h: "ICP match", cell: (a) => scores[a.id] && <ScoreChip s={scores[a.id].m} label="ICP Match" /> },
        { h: "Opportunity", cell: (a) => scores[a.id] && <ScoreChip s={scores[a.id].o} label="Opportunity" /> },
        { h: "Coupa fit", cell: (a) => scores[a.id] && <ScoreChip s={scores[a.id].f} label="Coupa Fit" /> },
        { h: "Updated", cell: (a) => <Dates a={a} /> }, { h: "Lists", cell: (a) => <span className="muted">{(a.lists || []).join(", ")}</span> },
        { h: "Signal", cell: (a) => <Pill s={a.s2p_signal_level} /> }, { h: "Existing S2P", cell: (a) => a.existing_s2p_product },
        { h: "S2P status", cell: (a) => a.s2p_platform_status }, { h: "ERP", cell: (a) => a.erp }, { h: "Contacts", cell: (a) => <span className="mono">{(byCo[a.id] || []).length}</span> }]}
      onRow={openRow} />;
  } else if (tab === "pipeline") {
    const ranked = A.filter((a) => scores[a.id] && scores[a.id].m.total >= 70 && a.icp_status !== "Not ICP").sort((a, b) => scores[b.id].rank - scores[a.id].rank);
    view = <FilterTable unit="accounts" title="Ranked pipeline" note="Rank = 50% ICP Match + 30% Opportunity + 20% Coupa Fit. Accounts with ICP Match below 70 or Not ICP are left out. Hover a score for its breakdown; select a row for why it was selected and the recommended next steps."
      rows={ranked} search={(a) => [a.company_name, a.industry, a.erp, a.existing_s2p_product].join(" ")}
      filters={[{ label: "ICP status", get: (a) => a.icp_status }, { label: "S2P", get: (a) => a.existing_s2p_product }, { label: "Industry", get: (a) => a.industry }, { label: "Country", get: (a) => a.country }]}
      cols={[{ h: "Rank", cell: (a) => <b className="mono">{scores[a.id].rank}</b> }, { h: "Company", cell: (a) => <><b>{a.company_name}</b><div className="muted">{a.industry} · {a.country}</div></> },
        { h: "ICP match", cell: (a) => <ScoreChip s={scores[a.id].m} label="ICP Match" /> }, { h: "Opportunity", cell: (a) => <ScoreChip s={scores[a.id].o} label="Opportunity" /> },
        { h: "Coupa fit", cell: (a) => <ScoreChip s={scores[a.id].f} label="Coupa Fit" /> }, { h: "ICP status", cell: (a) => <IcpTag s={a.icp_status} why={a.icp_fit_reason} /> },
        { h: "Revenue", cell: (a) => <span className="mono">{usd(bestRevenue(a).v)}</span> }, { h: "Existing S2P", cell: (a) => a.existing_s2p_product },
        { h: "Contacts", cell: (a) => <span className="mono">{(byCo[a.id] || []).length}</span> }]}
      onRow={openRow} />;
  } else if (tab === "stakeholders") {
    view = <FilterTable unit="contacts" title="Stakeholders" note="Company and contact details only. Emails are never pattern-guessed; a blank email means it could not be verified. Select a contact to open their contact card."
      rows={[...P].sort((a, b) => sigRank(a.account_s2p_signal) - sigRank(b.account_s2p_signal) || str(a.company).localeCompare(b.company) || str(a.contact_tier).localeCompare(str(b.contact_tier)))}
      search={(p) => [p.company, p.full_name, p.title_verbatim, p.email, p.notes_contact].join(" ")}
      filters={[{ label: "Tier", get: (p) => p.contact_tier }, { label: "Role family", get: (p) => famKey(p.role_family) }, { label: "Signal", get: (p) => p.account_s2p_signal },
        { label: "Email status", get: (p) => p.email_status }, { label: "Channel", get: (p) => p.channel_state }]}
      cols={[{ h: "Company", cell: (p) => p.company }, { h: "Full name", cell: (p) => <b>{p.full_name}</b> }, { h: "Title (verbatim)", cell: (p) => p.title_verbatim, wrap: true },
        { h: "Role family", cell: (p) => p.role_family }, { h: "Tier", cell: (p) => p.contact_tier },
        { h: "Channel", cell: (p) => <>{p.channel_state}<div className="muted">{p.channel_source !== p.channel_state ? p.channel_source : ""}</div></> },
        { h: "Email", cell: (p) => <span className="mono">{p.email}</span> }, { h: "Email status", cell: (p) => p.email_status },
        { h: "Phone", cell: (p) => <><span className="mono">{p.phone}</span> <span className="muted">{p.phone_type}</span></> },
        { h: "LinkedIn", cell: (p) => <Ext href={p.linkedin_url}>profile</Ext> }, { h: "S2P signal", cell: (p) => <Pill s={p.account_s2p_signal} /> },
        { h: "Notes / intel", cell: (p) => p.notes_contact, wrap: true }]}
      onRow={(p) => setContact(p.id)} />;
  } else if (tab === "signals") {
    view = <FilterTable unit="signals" title="S2P signals" note="Every signal carries its evidence and source."
      rows={[...data.signals].sort((a, b) => sigRank(a.level) - sigRank(b.level))}
      search={(s) => [s.company, s.signal, s.evidence, s.platform].join(" ")}
      filters={[{ label: "Level", get: (s) => s.level }, { label: "Category", get: (s) => s.category }, { label: "Platform", get: (s) => s.platform }]}
      cols={[{ h: "Company", cell: (s) => <b>{s.company}</b> }, { h: "Level", cell: (s) => <Pill s={s.level} /> }, { h: "Category", cell: (s) => s.category },
        { h: "Platform", cell: (s) => s.platform }, { h: "Signal", cell: (s) => s.signal, wrap: true }, { h: "Evidence", cell: (s) => s.evidence, wrap: true },
        { h: "Date", cell: (s) => <span className="mono">{s.date}</span> }, { h: "Source", cell: (s) => <Ext href={s.source_url}>source</Ext> }]}
      onRow={openRow} />;
  } else if (tab === "erp") {
    view = <FilterTable title="ERP & third-party apps" note="FACT = directly sourced · LIKELY = several indirect signals · UNVERIFIED = one weak source, such as technographics."
      rows={data.apps} search={(r) => [r.company, r.name, r.category, r.evidence].join(" ")}
      filters={[{ label: "Category", get: (r) => r.category }, { label: "Status", get: (r) => r.status }]}
      cols={[{ h: "Company", cell: (r) => <b>{r.company}</b> }, { h: "Application", cell: (r) => r.name }, { h: "Category", cell: (r) => r.category },
        { h: "Status", cell: (r) => <StatusTag s={r.status} /> }, { h: "Evidence", cell: (r) => r.evidence, wrap: true }, { h: "Source", cell: (r) => <Ext href={r.source_url}>source</Ext> }]}
      onRow={openRow} />;
  } else if (tab === "conflicts") {
    view = <FilterTable unit="conflicts" title="Conflicts" note="Both values are kept. Nothing is overwritten." rows={data.conflicts}
      search={(c) => [c.company, c.entity, c.field, c.value_a, c.value_b].join(" ")} filters={[{ label: "Field", get: (c) => c.field }]}
      cols={[{ h: "Company", cell: (c) => c.company }, { h: "Entity", cell: (c) => c.entity }, { h: "Field", cell: (c) => c.field },
        { h: "Value A", cell: (c) => c.value_a, wrap: true }, { h: "Source A", cell: (c) => c.source_a }, { h: "Value B", cell: (c) => c.value_b, wrap: true },
        { h: "Source B", cell: (c) => c.source_b }, { h: "Determination", cell: (c) => c.determination, wrap: true }]}
      onRow={openRow} />;
  } else if (tab === "sources") {
    const region = country === ALL ? "All regions" : country;
    const idx = indexSources(A, data.sources.filter((s) => A.some((a) => a.id === s.company_id)), data.contacts);
    const tiles = (group: "channel" | "evidence") => (
      <div className="kpis src-tiles">{SOURCES.filter((d) => d.group === group).map((d) => {
        const rows = idx[d.key] || [];
        const byC = country === ALL ? countBy(rows, (a) => countryCode(a.country)).map(([k, n]) => `${k} ${n}`).join(" · ") : "";
        return (
          <button type="button" key={d.key} className={`kpi src-tile${rows.length ? "" : " empty"}`} style={{ "--k": d.color } as React.CSSProperties}
            onClick={() => rows.length && setDrill({ title: `${d.name} | ${region}`, kind: "accounts", rows })} title={`${d.what}\nProvides: ${d.provides}`}>
            <small>{d.name} <span className="src-region">| {region}</span></small><b>{rows.length.toLocaleString()}</b>
            <em>companies profiled{byC && ` · ${byC}`}</em><span className="kpi-go" aria-hidden="true">View →</span>
          </button>);
      })}</div>);
    const catalogue = (group: "channel" | "evidence") => (
      <details className="src-cat"><summary>What each source is, what it provides and how far to trust it</summary>
        <div className="tablewrap"><table><thead><tr><th>Source</th><th>What it is</th><th>Provides</th><th>How it's collected</th><th>Reliability</th><th>Cost</th></tr></thead>
          <tbody>{SOURCES.filter((d) => d.group === group).map((d) => (
            <tr key={d.key}><td><span className="src-dot" style={{ background: d.color }} /> <b>{d.name}</b></td><td className="wrap">{d.what}</td><td className="wrap">{d.provides}</td>
              <td className="wrap">{d.how}</td><td className="wrap">{d.reliability}</td><td>{d.cost}</td></tr>))}</tbody></table></div></details>);
    view = <>
      <div className="panel src-panel">
        <h2>Channels — how companies were found and profiled</h2>
        <p className="note">A company can appear under several channels (for example your workbook, then Claude research, then a revenue check). Select a tile to see its companies.</p>
        {tiles("channel")}{catalogue("channel")}
      </div>
      <div className="panel src-panel">
        <h2>Evidence types — the documents behind the facts</h2>
        <p className="note">Counts are companies with at least one fact from that type of source. Tier 1 = official (annual reports, filings, company websites); Tier 3–4 = databases and estimates.</p>
        {tiles("evidence")}{catalogue("evidence")}
      </div>
      <FilterTable unit="sources" title="Source evidence" note="The audit trail behind every fact: one row per source used, with what was found and how confident we are." rows={data.sources}
      search={(s) => [s.company, s.source, s.information_found, s.url].join(" ")}
      filters={[{ label: "Source group", get: (s) => evidenceGroup(s) }, { label: "Tier", get: (s) => s.source_tier }, { label: "Type", get: (s) => s.source_type }, { label: "Confidence", get: (s) => s.confidence }]}
      cols={[{ h: "Company", cell: (s) => s.company }, { h: "Source", cell: (s) => s.source }, { h: "Type", cell: (s) => s.source_type }, { h: "Tier", cell: (s) => s.source_tier },
        { h: "Information found", cell: (s) => s.information_found, wrap: true }, { h: "Published", cell: (s) => <span className="mono">{s.date_published}</span> },
        { h: "Confidence", cell: (s) => s.confidence }, { h: "URL", cell: (s) => <Ext href={s.url}>open</Ext> }]}
      onRow={openRow} /></>;
  } else {
    const top = A.filter((a) => sigRank(a.s2p_signal_level) <= 1).sort((a, b) => sigRank(a.s2p_signal_level) - sigRank(b.s2p_signal_level));
    const ACT = ["Evaluation", "RFP / Tender", "Currently Implementing", "Replacement / Transformation"];
    const kpis: [string, Row[], Kind][] = [
      ["Accounts (all lists)", A, "accounts"], ["ICP — Verified", A.filter((a) => a.icp_status === "ICP — Verified"), "accounts"],
      ["ICP — Likely", A.filter((a) => a.icp_status === "ICP — Likely"), "accounts"],
      ["ICP — Needs check", A.filter((a) => a.icp_status === "ICP — Needs check" || a.icp_status === "Unknown"), "accounts"],
      ["Strong / very strong", top, "accounts"], ["Coupa accounts", A.filter((a) => /coupa/i.test(str(a.existing_s2p_product))), "accounts"],
      ["SAP Ariba accounts", A.filter((a) => /ariba/i.test(str(a.existing_s2p_product))), "accounts"], ["Contacts", P, "contacts"],
      ["Verified contacts", P.filter((p) => p.verification_status === "VERIFIED"), "contacts"], ["Contacts with email", P.filter((p) => p.email), "contacts"],
      ["Signals logged", data.signals, "signals"], ["Conflicts retained", data.conflicts, "conflicts"],
      ["Employment changes", data.history.filter((h) => /change/i.test(str(h.determination))), "history"],
      ["Possible new S2P projects", A.filter((a) => ACT.includes(a.s2p_platform_status)), "accounts"],
    ];

    view = (
      <>
        <div className="kpis">{kpis.map(([l, rows, kind], i) => (
          <button type="button" key={l} className={`kpi c${(i % 8) + 1}`} onClick={() => setDrill({ title: l, kind, rows })} title={`Show the ${rows.length.toLocaleString()} records`}>
            <small>{l}</small><b>{rows.length.toLocaleString()}</b><span className="kpi-go" aria-hidden="true">View →</span>
          </button>))}</div>
        <div className="grid2">
          <div className="panel"><h2>Accounts by S2P signal</h2><Bars entries={countBy(A, (a) => a.s2p_signal_level)} order={sigRank} signal /></div>
          <div className="panel"><h2>Existing S2P platform</h2><Bars entries={countBy(A, (a) => a.existing_s2p_product)} /></div>
          <div className="panel"><h2>ERP landscape</h2><Bars entries={countBy(A, (a) => erpKey(a.erp)).slice(0, 10)} /></div>
          <div className="panel"><h2>Contacts by role family</h2><Bars entries={countBy(P, (p) => famKey(p.role_family))} /></div>
          <div className="panel"><h2>Research channel</h2><Bars entries={countBy(P, (p) => p.research_channel)} /></div>
          <div className="panel"><h2>Accounts by ICP status</h2><Bars entries={countBy(A, (a) => a.icp_status || "Unknown")} order={(k) => icpRank(k)} /></div>
        </div>
        <div className="panel" style={{ marginTop: 16 }}>
          <h2>Priority accounts</h2>
          <p className="note">Accounts with strong or very strong S2P signals. Select a row to open the account brief.</p>
          <div className="tablewrap"><table>
            <thead><tr><th className="num">#</th><th>Company</th><th>Signal</th><th>Existing S2P</th><th>Status</th><th>ERP</th><th>Why</th></tr></thead>
            <tbody>{top.map((a, i) => (
              <tr key={a.id} className="click" tabIndex={0} onClick={() => setOpen(a.id)} onKeyDown={(e) => e.key === "Enter" && setOpen(a.id)}>
                <td className="num mono">{i + 1}</td><td><b>{a.company_name}</b></td><td><Pill s={a.s2p_signal_level} /></td><td>{a.existing_s2p_product}</td><td>{a.s2p_platform_status}</td>
                <td>{a.erp}</td><td className="wrap">{str(a.s2p_strong_signals).slice(0, 260)}</td>
              </tr>))}
            </tbody></table></div>
        </div>
      </>
    );
  }

  return (
    <div className={`app-shell${collapsed ? " dp-closed" : ""}`}>
    <DiscoveryPanel criteria={criteria} onChange={setCriteria} onSave={saveCriteria} saved={saved} collapsed={collapsed} onToggle={toggle}
      matches={{ accounts: Object.values(scores).filter((x) => x.m.total >= 70).length, contacts: P.length }}
      country={country} onResearch={researchMore} researchMsg={researchMsg} />
    <div className="app-main">
      <Hero title={(HERO[tab] || HERO.dashboard)[0]} text={(HERO[tab] || HERO.dashboard)[1]} />
      <section className="view">{A.length === 0
        ? <div className="panel"><h2>No {COUNTRIES.find((c) => c.code === country)?.name || country} accounts yet</h2>
            <p>This market is next on the roadmap. Add companies from the Research Queue (choose the country there), or pick another country above.</p></div>
        : view}</section>
      {drill && <DrillDown d={drill} byCo={byCo} onClose={() => setDrill(null)} onAccount={setOpen} onContact={setContact} />}
      {open && A.find((x) => x.id === open) && <Brief a={A.find((x) => x.id === open)!} data={data} people={byCo[open] || []} onClose={() => setOpen(null)} onContact={setContact}
        scores={scores[open]} criteria={criteria} />}
      {contact && (() => { const p = P.find((x) => x.id === contact); return p ? <ContactCard p={p} data={data} onClose={() => setContact(null)} onAccount={(id) => { setContact(null); setOpen(id); }} /> : null; })()}
    </div>
    </div>
  );
}

function Fact({ l, children }: { l: string; children: React.ReactNode }) {
  if (children === null || children === undefined || children === "") return null;
  return <div className="fact"><small>{l}</small><div>{children}</div></div>;
}

function Brief({ a, data, people, onClose, onContact, scores, criteria }: { a: Row; data: AllData; people: Row[]; onClose: () => void; onContact: (id: string) => void;
  scores?: Scores; criteria: Criteria }) {
  const spend = criteria.showSpend ? estimateSpend(a) : null;
  const why = scores ? whySelected(a, criteria, scores.m, spend) : [];
  const rec = scores ? recommendedActions(a, people, scores.f) : null;
  const cs = [...people].sort((x, y) => str(x.contact_tier).localeCompare(str(y.contact_tier)));
  const sigs = data.signals.filter((s) => s.company_id === a.id).sort((x, y) => sigRank(x.level) - sigRank(y.level));
  const apps = data.apps.filter((s) => s.company_id === a.id && s.category !== "ERP (core)");
  const srcs = data.sources.filter((s) => s.company_id === a.id);
  const conf = data.conflicts.filter((s) => s.company_id === a.id);
  const [pitch, setPitch] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState("");

  async function draftPitch() {
    setBusy(true); setPitch("Drafting…");
    const facts = { company: a.company_name, industry: a.industry, revenue_usd_m: a.revenue_usd_m, erp: a.erp, existing_s2p: a.existing_s2p_product,
      s2p_detail: a.existing_s2p_detail, s2p_status: a.s2p_platform_status, signal: a.s2p_signal_level, s2p_signals: a.s2p_strong_signals,
      procurement_transformation: a.procurement_transformation_signals, digital: a.digital_transformation_signals, procurement_model: a.procurement_model,
      coupa_opportunity: a.coupa_opportunity_type, ariba_opportunity: a.ariba_opportunity_type, opportunity: a.potential_opportunity,
      apps: apps.map((x) => `${x.name} (${x.category}, ${x.status})`), signals: sigs.map((s) => `${s.level}: ${s.signal} — ${s.evidence} (${s.date || ""})`),
      contacts: cs.map((p) => `${p.full_name} — ${p.title_verbatim} — ${p.role_family} ${p.contact_tier}`) };
    try {
      const r = await fetch("/api/pitch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(facts) });
      const j = await r.json();
      setPitch(j.text || j.error || "Could not draft the pitch plan.");
    } catch { setPitch("Could not reach the server. Try again."); } finally { setBusy(false); }
  }
  async function refreshResearch() {
    setRefresh("Starting…");
    const r = await fetch("/api/research", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company: a.company_name, country: a.country || "UAE", depth: "standard", companyId: a.id }) });
    setRefresh(r.ok ? "Research started. Follow it in Research Queue; refresh this page when it finishes." : "Could not start research.");
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="brief" aria-label="Account brief">
        <div className="brief-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="muted mono">{a.exchange} {a.ticker} · {a.industry}</div>
            <h3>{a.company_name}</h3>
            <div style={{ marginTop: 6 }}><Pill s={a.s2p_signal_level} /> <span className="tag">{a.existing_s2p_product || "Unknown"}</span> <span className="tag">{a.s2p_platform_status || "Unknown"}</span></div>
          </div>
          <span className="cost-wrap"><button className="btn ghost" type="button" onClick={refreshResearch}>Refresh research</button><CostNote cost="≈ $1.20–1.50" /></span>
          <button className="btn ghost" type="button" onClick={onClose}>Close</button>
        </div>
        <div className="brief-body">
          {refresh && <p className="note">{refresh}</p>}
          <div className="facts">
            <Fact l="Website"><Ext href={a.company_website}>{a.domain || a.company_website}</Ext></Fact>
            <Fact l="Revenue">{bestRevenue(a).v ? <>{usd(bestRevenue(a).v)} <span className="muted">{[bestRevenue(a).src, a.revenue_local, a.revenue_fy].filter(Boolean).join(" · ")}</span></> : ""}</Fact>
            <Fact l="Listing">{a.listing_status || (a.exchange ? `Listed (${a.exchange})` : "")}</Fact>
            <Fact l="Employees">{a.employee_range}</Fact>
            <Fact l="ICP fit">{a.icp_fit}{a.icp_fit_reason && <div className="note">{a.icp_fit_reason}</div>}</Fact>
            <Fact l="Ownership">{a.ownership}</Fact>
            <Fact l="Parent">{a.parent_company}</Fact>
            <Fact l="Board phone">{a.board_phone && <span className="mono">{a.board_phone}</span>}</Fact>
            <Fact l="Last researched">{str(a.last_researched).slice(0, 10)}</Fact>
            <Fact l="Record dates"><span className="mono">Added {day(a.created_at) || "—"} · Updated {day(a.updated_at) || "—"} · Status since {statusSince(a) || "—"}</span></Fact>
            <Fact l="ICP status"><IcpTag s={a.icp_status} why={a.icp_fit_reason} />{a.icp_fit_reason && <div className="note">{a.icp_fit_reason}</div>}</Fact>
            <Fact l="Lists">{(a.lists || []).join(", ")}</Fact>
          </div>
          {scores && rec && <div className="block ai-block"><h4>AI intelligence</h4>
            <div className="score-cards">
              {([["ICP Match", scores.m], ["Opportunity", scores.o], ["Coupa Fit", scores.f]] as [string, Score][]).map(([l, sc]) => (
                <div key={l} className="score-card"><small>{l}</small><b className={sc.total >= 70 ? "hi" : sc.total >= 45 ? "mid" : "lo"}>{sc.total}</b>
                  <ul>{sc.parts.map((x) => <li key={x.label}><span>{x.label}</span><span className="mono">{x.score}/{x.max}</span><em>{x.why}</em></li>)}</ul></div>))}
            </div>
            <h5>Why this account was selected</h5><ul className="plain">{why.map((w) => <li key={w}>{w}</li>)}</ul>
            {spend && <><h5>Procurement &amp; spend intelligence <span className="tag unv">ESTIMATE</span></h5>
              <div className="spend-grid">{([["Total addressable spend", spend.total], ["Direct", spend.direct], ["Indirect", spend.indirect], ["MRO", spend.mro], ["Services", spend.services],
                ["CAPEX", spend.capex], ["Annual procurement budget", spend.budget]] as [string, number][]).map(([l, v]) => <div key={l}><small>{l}</small><b>{usd(v)}</b></div>)}
                {([["Invoices / month", spend.invoicesPerMonth], ["POs / month", spend.posPerMonth], ["Suppliers / year", spend.suppliers], ["Active suppliers", spend.activeSuppliers],
                ["Procurement transactions / year", spend.transactionsPerYear]] as [string, number][]).map(([l, v]) => <div key={l}><small>{l}</small><b>~{v.toLocaleString()}</b></div>)}</div>
              <p className="note">{spend.basis}</p></>}
            <h5>Recommended actions</h5>
            <div className="rec-grid">
              <div><b>Connect with</b><ul className="plain">{rec.stakeholders.length ? rec.stakeholders.map((x) => <li key={x}>{x}</li>) : <li>No buying-committee contact on file yet: research the CPO / CFO.</li>}</ul></div>
              <div><b>Suggested messaging</b><p>{rec.messaging}</p></div>
              <div><b>Discovery questions</b><ul className="plain">{rec.questions.map((x) => <li key={x}>{x}</li>)}</ul></div>
              <div><b>Potential pain points</b><ul className="plain">{rec.pains.map((x) => <li key={x}>{x}</li>)}</ul></div>
              <div><b>Potential Coupa use cases</b><ul className="plain">{rec.useCases.map((x) => <li key={x}>{x}</li>)}</ul></div>
              <div><b>Next steps</b><ul className="plain">{rec.next.map((x) => <li key={x}>{x}</li>)}</ul></div>
            </div>
            <p className="note">Scores and recommendations are rule-based on the evidence in this brief (no API cost). For a tailored write-up use Draft pitch plan below.</p>
          </div>}
          <div className="block"><h4>S2P intelligence</h4><p>{a.s2p_strong_signals || "No S2P evidence found."}</p>
            {a.existing_s2p_detail && <p className="note">Detail: {a.existing_s2p_detail}</p>}
            <p className="note">Coupa: {a.coupa_opportunity_type || "No Evidence"} · Ariba: {a.ariba_opportunity_type || "No Evidence"}</p>
            {sigs.map((s) => (
              <div key={s.id} className={`sig ${str(s.level).split(" ")[0]}`}><b>{s.signal}</b> <Pill s={s.level} /> <span className="tag">{s.category}</span>
                <div className="note">{s.evidence} {s.date && `· ${s.date}`} <Ext href={s.source_url}>source</Ext></div></div>))}
          </div>
          <div className="block"><h4>ERP landscape and third-party apps</h4>
            <p><b>ERP:</b> {a.erp || "Unknown"} <StatusTag s={a.erp_status} /></p>{a.erp_evidence && <p className="note">{a.erp_evidence}</p>}
            <div>{apps.length ? apps.map((x) => <span key={x.id} className="tag" title={x.evidence}>{x.name} · {x.category} · {x.status}</span>) : <span className="muted">No third-party apps verified.</span>}</div>
          </div>
          <div className="block"><h4>Transformation context</h4>
            {a.procurement_model && <p><b>Procurement model:</b> {a.procurement_model}</p>}
            {a.procurement_transformation_signals && <p><b>Procurement transformation:</b> {a.procurement_transformation_signals}</p>}
            {a.digital_transformation_signals && <p><b>Digital transformation:</b> {a.digital_transformation_signals}</p>}
            {a.known_implementation_partner && <p><b>Implementation partner:</b> {a.known_implementation_partner}</p>}
            {a.subsidiaries && <p className="note"><b>Subsidiaries:</b> {a.subsidiaries}</p>}
          </div>
          {a.profile && <Profile profile={a.profile} />}
          <div className="block"><h4>Opportunity observations</h4><p>{a.potential_opportunity || "—"}</p>{a.account_notes && <p className="note">{a.account_notes}</p>}</div>
          <div className="block"><h4>Stakeholders ({cs.length}) · select a person for their contact card</h4>
            <div className="tablewrap"><table><thead><tr><th className="num">#</th><th>Name</th><th>Title (verbatim)</th><th>Tier</th><th>Channel</th><th>Email</th><th>Phone</th><th>LinkedIn</th></tr></thead>
              <tbody>{cs.map((p, i) => (
                <tr key={p.id} className="click" tabIndex={0} onClick={(e) => { if (!(e.target as HTMLElement).closest("a")) onContact(p.id); }} onKeyDown={(e) => e.key === "Enter" && onContact(p.id)}><td className="num mono">{i + 1}</td><td><b>{p.full_name}</b><div className="muted">{p.role_family} · {p.verification_status}</div></td><td>{p.title_verbatim}</td>
                  <td>{p.contact_tier}</td><td>{p.channel_state}</td><td className="mono">{p.email}<div className="muted">{p.email_status}</div></td>
                  <td className="mono">{p.phone}</td><td><Ext href={p.linkedin_url}>profile</Ext></td></tr>))}
              </tbody></table></div>
          </div>
          <div className="pitch"><h4 style={{ margin: "0 0 6px", font: "600 12px var(--body)", letterSpacing: ".1em", textTransform: "uppercase" }}>Pitch planner</h4>
            <p className="note">Claude drafts a pitch plan from the evidence on this page: what to lead with, who to approach first, and what to validate on the first call.</p>
            <button className="btn primary" type="button" disabled={busy} onClick={draftPitch}>{busy ? "Drafting…" : "Draft pitch plan"}</button> <CostNote cost="≈ $0.05–0.10" />
            {pitch && <div className="pitch-out">{pitch}</div>}
          </div>
          {conf.length > 0 && <div className="block"><h4>Conflicts retained ({conf.length})</h4>
            {conf.map((c) => <p key={c.id} className="note"><b>{c.entity} · {c.field}</b>: “{c.value_a}” ({c.source_a}) vs “{c.value_b}” ({c.source_b}) — {c.determination}</p>)}</div>}
          <div className="block"><h4>Evidence ({srcs.length} sources)</h4>
            {srcs.map((s) => <p key={s.id} className="note"><span className="tag">{s.source_tier}</span> <b>{s.source}</b> {s.date_published && `(${s.date_published})`} — {s.information_found} <Ext href={s.url}>open</Ext></p>)}</div>
        </div>
      </aside>
    </>
  );
}

function Profile({ profile }: { profile: Record<string, Record<string, unknown>> }) {
  const sheets = Object.entries(profile).filter(([, v]) => v && Object.keys(v).length);
  if (!sheets.length) return null;
  return (
    <div className="block input-block">
      <h4>Your profiling (reference workbook, unchanged)</h4>
      {sheets.map(([sheet, fields]) => (
        <div key={sheet} style={{ marginBottom: 10 }}>
          <p className="note"><b>{sheet}</b></p>
          <div className="facts">
            {Object.entries(fields).filter(([k]) => k !== "Company" && k !== "Sl#").map(([k, v]) => (
              <div key={k} className="fact"><small>{k}</small><div>{/^https?:/.test(String(v)) ? <a href={String(v)} target="_blank" rel="noopener noreferrer">{String(v)}</a> : String(v)}</div></div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

type Kind = "accounts" | "contacts" | "signals" | "conflicts" | "history";

function DrillDown({ d, byCo, onClose, onAccount, onContact }: { d: { title: string; kind: Kind; rows: Row[] }; byCo: Record<string, Row[]>;
  onClose: () => void; onAccount: (id: string) => void; onContact: (id: string) => void }) {
  let table: React.ReactNode;
  if (d.kind === "accounts") {
    table = <FilterTable unit="companies" title={d.title} rows={[...d.rows].sort((a, b) => icpRank(a.icp_status) - icpRank(b.icp_status) || (bestRevenue(b).v || 0) - (bestRevenue(a).v || 0))}
      search={(a) => [a.company_name, a.industry, a.erp, a.existing_s2p_product].join(" ")}
      filters={[{ label: "ICP status", get: (a) => a.icp_status }, { label: "Signal", get: (a) => a.s2p_signal_level }, { label: "Industry", get: (a) => a.industry }]}
      cols={[{ h: "Company", cell: (a) => <b>{a.company_name}</b> }, { h: "Revenue", cell: (a) => <span className="mono">{usd(bestRevenue(a).v)}</span> },
        { h: "ICP status", cell: (a) => <IcpTag s={a.icp_status} why={a.icp_fit_reason} /> }, { h: "Updated", cell: (a) => <Dates a={a} /> }, { h: "Signal", cell: (a) => <Pill s={a.s2p_signal_level} /> },
        { h: "S2P", cell: (a) => a.existing_s2p_product }, { h: "ERP", cell: (a) => a.erp }, { h: "Contacts", cell: (a) => <span className="mono">{(byCo[a.id] || []).length}</span> }]}
      onRow={(a) => onAccount(a.id)} />;
  } else if (d.kind === "contacts") {
    table = <FilterTable unit="contacts" title={d.title} rows={d.rows} search={(p) => [p.company, p.full_name, p.title_verbatim, p.email].join(" ")}
      filters={[{ label: "Tier", get: (p) => p.contact_tier }, { label: "Role family", get: (p) => famKey(p.role_family) }, { label: "Channel", get: (p) => p.channel_state }]}
      cols={[{ h: "Name", cell: (p) => <b>{p.full_name}</b> }, { h: "Company", cell: (p) => p.company }, { h: "Title", cell: (p) => p.title_verbatim, wrap: true },
        { h: "Email", cell: (p) => <span className="mono">{p.email}</span> }, { h: "Channel", cell: (p) => p.channel_state }]}
      onRow={(p) => onContact(p.id)} />;
  } else if (d.kind === "signals") {
    table = <FilterTable unit="signals" title={d.title} rows={[...d.rows].sort((a, b) => sigRank(a.level) - sigRank(b.level))} search={(s) => [s.company, s.signal, s.evidence].join(" ")}
      filters={[{ label: "Level", get: (s) => s.level }, { label: "Platform", get: (s) => s.platform }]}
      cols={[{ h: "Company", cell: (s) => <b>{s.company}</b> }, { h: "Level", cell: (s) => <Pill s={s.level} /> }, { h: "Signal", cell: (s) => s.signal, wrap: true }, { h: "Date", cell: (s) => s.date }]}
      onRow={(s) => onAccount(s.company_id)} />;
  } else if (d.kind === "conflicts") {
    table = <FilterTable unit="conflicts" title={d.title} rows={d.rows} search={(c) => [c.company, c.entity, c.field, c.value_a, c.value_b].join(" ")}
      filters={[{ label: "Field", get: (c) => c.field }]}
      cols={[{ h: "Company", cell: (c) => c.company }, { h: "Entity", cell: (c) => c.entity }, { h: "Field", cell: (c) => c.field },
        { h: "Value A", cell: (c) => c.value_a, wrap: true }, { h: "Value B", cell: (c) => c.value_b, wrap: true }]}
      onRow={(c) => onAccount(c.company_id)} />;
  } else {
    table = <FilterTable unit="records" title={d.title} rows={d.rows} search={(h) => [h.full_name, h.company, h.title].join(" ")} filters={[]}
      cols={[{ h: "Person", cell: (h) => <b>{h.full_name}</b> }, { h: "Now at", cell: (h) => h.company }, { h: "Title", cell: (h) => h.title, wrap: true },
        { h: "Determination", cell: (h) => h.determination }, { h: "Source", cell: (h) => h.source }]}
      onRow={(h) => h.company_id && onAccount(h.company_id)} />;
  }
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="brief drill" aria-label={d.title}>
        <div className="brief-head"><div style={{ flex: 1 }}><div className="muted">Dashboard drill-down</div><h3>{d.title}</h3></div>
          <button className="btn ghost" type="button" onClick={onClose}>Close</button></div>
        <div className="brief-body">{table}</div>
      </aside>
    </>
  );
}

function ContactCard({ p, data, onClose, onAccount }: { p: Row; data: AllData; onClose: () => void; onAccount: (id: string) => void }) {
  const nk = (n: unknown) => str(n).toLowerCase().replace(/^(dr|eng|mr|ms|mrs|h\.?e)\.?\s+/, "").replace(/[^a-z]/g, "");
  const others = data.contacts.filter((x) => x.id !== p.id && nk(x.full_name) === nk(p.full_name) && (x.company_id === p.company_id || x.company_ref_name === p.company_ref_name));
  const hist = data.history.filter((h) => nk(h.full_name) === nk(p.full_name) && h.company_id === p.company_id);
  const copy = async (t: string) => { try { await navigator.clipboard.writeText(t); } catch { /* ignore */ } };
  return (
    <>
      <div className="scrim top" onClick={onClose} />
      <aside className="brief contact" aria-label={`Contact card: ${p.full_name}`}>
        <div className="brief-head">
          <div className="avatar lg" aria-hidden="true">{str(p.full_name).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="muted">{p.role_family} · {p.contact_tier} · {p.channel_state}</div>
            <h3>{p.full_name}</h3>
            <div className="note">{p.title_verbatim}</div>
          </div>
          <button className="btn ghost" type="button" onClick={() => onAccount(p.company_id)}>Company brief</button>
          <button className="btn ghost" type="button" onClick={onClose}>Close</button>
        </div>
        <div className="brief-body">
          <div className="facts">
            <Fact l="Company">{p.company}{p.company_ref_name && p.company_ref_name !== p.company ? <div className="note">As in your sheet: {p.company_ref_name}</div> : null}</Fact>
            <Fact l="Email">{p.email ? <><span className="mono">{p.email}</span> <button type="button" className="btn tiny" onClick={() => copy(p.email)}>Copy</button><div className="note">{p.email_status}{p.email_confidence ? ` · ${p.email_confidence}` : ""}</div></> : ""}</Fact>
            <Fact l="Unverified email candidate">{p.email_candidate}</Fact>
            <Fact l="Phone">{p.phone ? <><span className="mono">{p.phone}</span> <button type="button" className="btn tiny" onClick={() => copy(p.phone)}>Copy</button><div className="note">{p.phone_type}</div></> : ""}</Fact>
            <Fact l="LinkedIn"><Ext href={p.linkedin_url}>{str(p.linkedin_url).replace(/^https?:\/\/(www\.)?/, "")}</Ext></Fact>
            <Fact l="Location">{p.location}</Fact>
            <Fact l="Nationality">{p.nationality}</Fact>
            <Fact l="Verification">{p.verification_status}</Fact>
            <Fact l="Employment">{p.employment_status}</Fact>
            <Fact l="Record">{p.record_status}</Fact>
            <Fact l="Source">{p.source_url ? <Ext href={p.source_url}>{p.source_type || "source"}</Ext> : p.source}</Fact>
            <Fact l="Account signal"><Pill s={p.account_s2p_signal} /></Fact>
          </div>
          {p.claude_check && <div className="block"><h4>Claude check</h4><p>{p.claude_check}</p></div>}
          {p.notes_contact && <div className="block"><h4>Notes / intel</h4><p style={{ whiteSpace: "pre-wrap" }}>{p.notes_contact}</p></div>}
          {p.s2p_contact_signal && <div className="block"><h4>S2P relevance</h4><p>{p.s2p_contact_signal}</p></div>}
          {others.length > 0 && <div className="block"><h4>Other records for this person ({others.length})</h4>
            <div className="tablewrap"><table><thead><tr><th>Channel</th><th>Title</th><th>Email</th><th>Phone</th><th>Record</th></tr></thead>
              <tbody>{others.map((o) => <tr key={o.id}><td>{o.channel_state}</td><td>{o.title_verbatim}</td><td className="mono">{o.email}<div className="muted">{o.email_status}</div></td>
                <td className="mono">{o.phone}</td><td className="muted">{o.record_status}</td></tr>)}</tbody></table></div></div>}
          {hist.length > 0 && <div className="block"><h4>Employment history ({hist.length})</h4>
            {hist.slice(0, 12).map((h) => <p key={h.id} className="note"><b>{h.title}</b> · {h.company} <span className="muted">— {h.determination}{h.evidence ? ` (${h.evidence})` : ""}</span></p>)}</div>}
        </div>
      </aside>
    </>
  );
}
