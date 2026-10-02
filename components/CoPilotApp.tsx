"use client";
import { ask, paidFetch, notify } from "@/components/Confirm";
import { rulesFor, regionOf } from "@/lib/icpDefinition.mjs";
import { personaFit } from "@/lib/icp";
import CostNote from "@/components/CostNote";
import CompanyLogo from "@/components/CompanyLogo";
import { useCustomFilters, CustomFilterBar, type CustomFilter } from "@/components/CustomFilters";
import InfoTip, { type Weights } from "@/components/InfoTip";
import { useMemo, useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { parseGlobalQuery } from "@/lib/globalSearch";
import Hero from "@/components/Hero";
import type { AllData, Row } from "@/lib/data";
import { ALL, COUNTRIES, DEFAULT_COUNTRY, countryCode } from "@/lib/countries";
import DiscoveryPanel from "@/components/DiscoveryPanel";
import ConflictGroupsView from "@/components/ConflictsPanel";
import { groupConflicts } from "@/lib/conflicts";
import { SOURCES, indexSources, evidenceGroup, originName, simpleOrigin } from "@/lib/sources";
import { buildPeople, contributorOf, TRUST_ORDER, type Person, type Trust } from "@/lib/people";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { withDefaults, icpMatch, opportunity, coupaFit, companyPasses, contactMatches, estimateSpend, whySelected, recommendedActions, revenueOf,
  type Criteria, type Score } from "@/lib/icp";
import SavedReportsList, { SaveReportButton, type SavedReport } from "@/components/SavedReports";

const HERO: Record<string, [string, string]> = {
  dashboard: ["Dashboard", "A live snapshot of UAE target accounts, S2P signals, ERP landscape and decision makers."],
  reports: ["Reports", "Search or filter, then see a ready-to-work contact list — who to call or email, and the account context behind each one. Save it under a name to revisit later."],
  accounts: ["Accounts", "Every account with ICP status, S2P platform and signal strength. Select one to open its brief."],
  stakeholders: ["Stakeholders", "Company and contact details for campaign planning. Emails are never pattern-guessed."],
  signals: ["S2P Signals", "Evidence-based Source-to-Pay, Coupa and SAP Ariba signals, strongest first."],
  erp: ["ERP & Apps", "ERP landscape and third-party applications, with how each was verified."],
  conflicts: ["Conflicts", "Where sources disagree. Both values are kept for you to resolve."],
  sources: ["Sources", "Where every company and fact comes from. Select a source tile to see the companies profiled from it; the catalogue explains what each source provides and how far to trust it."],
  pipeline: ["Pipeline", "Accounts ranked by ICP Match, Opportunity and Coupa Fit against your discovery criteria. Select one for why it was selected and what to do next."],
};
type Scores = { m: Score; o: Score; f: ReturnType<typeof coupaFit>; rank: number };
const TRUST_CLS: Record<string, string> = { "Confirmed by 2+ sources": "t-ok", "Single source": "t-one", Conflicting: "t-bad" };
const TrustTag = ({ t, why }: { t?: string; why?: string }) => t ? <span className={`trust ${TRUST_CLS[t] || ""}`} title={why}>{t}</span> : null;
const ScoreChip = ({ s, label }: { s: Score; label: string }) => (
  <span className={`score ${s.total >= 70 ? "hi" : s.total >= 45 ? "mid" : "lo"}`} title={`${label} ${s.total}% (share of the maximum points)\n` + s.parts.map((p) => `${p.label}: ${p.score} of ${p.max} points — ${p.why}`).join("\n")}>{s.total}%</span>);

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
  // Anything else falls through as-is (e.g. a raw enum like "not_public" or "not_found") — humanize it so it
  // reads like the rest ("Not Public"), instead of breaking the chart's casing pattern.
  return v.split(/[;(,]/)[0].trim().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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
const BarIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="9" width="3" height="5.5" rx="0.5" fill="currentColor" /><rect x="6.5" y="5" width="3" height="9.5" rx="0.5" fill="currentColor" /><rect x="11.5" y="1.5" width="3" height="13" rx="0.5" fill="currentColor" /></svg>
);
const PieIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5a6.5 6.5 0 1 0 6.5 6.5H8V1.5Z" fill="currentColor" /><path d="M9.5 1.6A6.5 6.5 0 0 1 14.4 6.5H9.5V1.6Z" fill="currentColor" opacity="0.55" /></svg>
);
// Each chart picks its own bar/pie view independently (useState is per component instance).
function Bars({ entries, order, signal }: { entries: [string, number][]; order?: (k: string) => number; signal?: boolean }) {
  const [mode, setMode] = useState<"bar" | "pie">("bar");
  const list = order ? [...entries].sort((a, b) => order(a[0]) - order(b[0])) : entries;
  const max = Math.max(1, ...list.map((e) => e[1]));
  const total = Math.max(1, list.reduce((s, e) => s + e[1], 0));
  const colourOf = (k: string, idx: number) => { const sv = signal ? SIGVAR[k.split(" ")[0]] : undefined; return sv ? `var(${sv})` : PALETTE[idx % PALETTE.length]; };
  let acc = 0;
  const pieStops = list.map(([k, n], idx) => {
    const from = (acc / total) * 100; acc += n; const to = (acc / total) * 100;
    return `${colourOf(k, idx)} ${from.toFixed(2)}% ${to.toFixed(2)}%`;
  }).join(", ");
  return (
    <div className="bars-wrap">
      <div className="chart-mode-toggle" role="group" aria-label="Chart type">
        <button type="button" className={mode === "bar" ? "on" : ""} onClick={() => setMode("bar")} title="Bar chart" aria-label="Bar chart"><BarIcon /></button>
        <button type="button" className={mode === "pie" ? "on" : ""} onClick={() => setMode("pie")} title="Pie chart" aria-label="Pie chart"><PieIcon /></button>
      </div>
      {mode === "bar" ? (
        <div className="bars">
          {list.map(([k, n], idx) => (
            <div key={k} className="bar sigbar" style={{ "--c": colourOf(k, idx) } as React.CSSProperties}>
              <span className="lab" title={k}>{k}</span>
              <span className="trk"><span className="fill" style={{ width: `${((n / max) * 100).toFixed(1)}%` }} /></span>
              <span className="n">{n}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="pie-wrap">
          <div className="pie" style={{ background: `conic-gradient(${pieStops})` }} />
          <div className="pie-legend">
            {list.map(([k, n], idx) => (
              <div key={k} className="pie-legend-row"><span className="sw" style={{ background: colourOf(k, idx) }} /><span className="lab" title={k}>{k}</span><b className="n">{n}</b></div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// field: the raw row key this column shows, when there's a clean one — restricts the custom filter's field list
// to what's actually visible in the table, instead of every property on the row object (most of which aren't
// shown as a column at all and would be confusing to filter on sight-unseen). A column with no clean 1:1 field
// (a computed score, a combined cell) just omits it.
type ColDef = { h: string; cell: (r: Row) => React.ReactNode; wrap?: boolean; cls?: string; tip?: string; field?: string };
type FilterDef = { label: string; get: (r: Row) => string; tip?: string };

function FilterTable({ title, note, rows, cols, filters, search, onRow, unit = "rows", tipW, empty, initial, onState, toggleExtra }: {
  title: string; note?: React.ReactNode; tipW?: Weights; empty?: (q: string) => React.ReactNode; rows: Row[]; cols: ColDef[]; filters: FilterDef[]; search: (r: Row) => string; onRow?: (r: Row) => void; unit?: string;
  // initial: seeds the search box / dropdowns / custom filters once, when opening a saved report — pass a
  // changing `key` on the element to force a remount for a new seed to take effect (see tab === "reports").
  // onState: fires on every change, so a parent (Reports' "Save this report") can capture exactly what's set.
  initial?: { q?: string; fv?: string[]; cf?: CustomFilter[] }; onState?: (s: { q: string; fv: string[]; cf: CustomFilter[]; count: number }) => void;
  toggleExtra?: React.ReactNode; // e.g. Reports' "Save this report", shown right next to the live filtered count
}) {
  const [q, setQ] = useState(initial?.q || "");
  const [fv, setFv] = useState<string[]>(initial?.fv || filters.map(() => ""));
  const [showAll, setShowAll] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const scrollH = (dx: number) => wrapRef.current?.scrollBy({ left: dx, behavior: "smooth" });
  const options = useMemo(() => filters.map((f) => [...new Set(rows.map(f.get).filter(Boolean))].sort()), [rows, filters]);
  const visibleFields = useMemo(() => cols.map((c) => c.field).filter((f): f is string => !!f), [cols]);
  const cf = useCustomFilters(rows, title, initial?.cf, visibleFields);
  const out = rows.filter((r) => (!q || search(r).toLowerCase().includes(q.toLowerCase())) && filters.every((f, i) => !fv[i] || f.get(r) === fv[i]) && cf.test(r));
  useEffect(() => { onState?.({ q, fv, cf: cf.list, count: out.length });
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [q, fv, cf.list, out.length]);
  // "All <unit>" shows every row regardless of the filters above — the search box, dropdowns and custom filters
  // stay exactly as set, so switching back to "Filtered results" re-applies them instantly (nothing is cleared).
  const displayed = showAll ? rows : out;
  // On a table whose rows are contacts/signals/sources/etc (one row per sub-entity, not per company), "All
  // Accounts" means the distinct companies behind those rows, not the row count — e.g. Reports is one row per
  // contact, so "All Accounts" is the 225 companies those 1,093 contacts belong to, shown alongside the true
  // contact count, not the contact count mislabelled as an account count.
  const hasCompany = rows.some((r) => r.company_id);
  const isPeople = hasCompany && rows.some((r) => r.full_name);
  const accountsN = hasCompany ? new Set(rows.map((r) => r.company_id)).size : rows.length;
  const multiPerCompany = hasCompany && accountsN !== rows.length;
  return (
    <>
      <h2 className="with-count">{title} <span className="count">{displayed.length.toLocaleString()} {unit}{displayed.length !== rows.length ? ` of ${rows.length.toLocaleString()}` : ""}</span></h2>
      {note && (typeof note === "string" ? <p className="note">{note}</p> : note)}
      <div className="seg-toggle-row">
        <div className="seg-toggle" role="group" aria-label="Show all or filtered">
          <button type="button" aria-pressed={showAll} onClick={() => setShowAll(true)}>All Accounts ({accountsN.toLocaleString()})</button>
          <button type="button" aria-pressed={!showAll} onClick={() => setShowAll(false)}>{isPeople ? "Contacts" : "Filtered results"} ({out.length.toLocaleString()})</button>
        </div>
        {!isPeople && multiPerCompany && <InfoTip k="accountsVsRows" />}
        {toggleExtra}
      </div>
      {isPeople && <p className="note seg-extra">All Contacts ({rows.length.toLocaleString()})</p>}
      <div className="filters">
        <input type="search" className={`flt-search${q ? " on" : ""}`} placeholder={`Search ${title.toLowerCase()}…`} aria-label="Search" value={q}
          onChange={(e) => { setQ(e.target.value); if (e.target.value) setShowAll(false); }} />
        {filters.map((f, i) => (
          <span key={f.label} className="flt-wrap">
            <select aria-label={f.label} value={fv[i]} className={`flt f${(i % 8) + 1}${fv[i] ? " on" : ""}`}
              onChange={(e) => { const v = e.target.value; setFv(fv.map((x, j) => (j === i ? v : x))); if (v) setShowAll(false); }}>
              <option value="">{f.label}: all</option>
              {options[i].map((o) => <option key={o}>{o}</option>)}
            </select>
            {f.tip && <InfoTip k={f.tip} />}
          </span>
        ))}

        <CustomFilterBar rows={rows} cf={cf} />
      </div>
      <p className="filter-count">{showAll ? <>Showing all {rows.length.toLocaleString()} rows — {out.length.toLocaleString()} match the filters below</> : <>{out.length.toLocaleString()} of {rows.length.toLocaleString()} rows</>}
          {rows.some((r) => r.company_id) && <> · {new Set(displayed.map((r) => r.company_id)).size} {new Set(displayed.map((r) => r.company_id)).size === 1 ? "company" : "companies"}</>}</p>
      {empty && q.trim().length >= 2 && out.length === 0 && empty(q.trim())}
      <div className="tablewrap-head">
        <span className="note">{cols.length + 1} columns — scroll sideways, or use the arrows:</span>
        <button type="button" className="btn tiny" aria-label="Scroll table left" onClick={() => scrollH(-320)}>← </button>
        <button type="button" className="btn tiny" aria-label="Scroll table right" onClick={() => scrollH(320)}> →</button>
      </div>
      <div className="tablewrap tablewrap-tall" ref={wrapRef}>
        <table>
          <thead><tr><th className="num">#</th>{cols.map((c) => <th key={c.h} className={c.cls}>{c.h}{c.tip && <InfoTip k={c.tip} w={tipW} />}</th>)}</tr></thead>
          <tbody>
            {displayed.map((r, i) => (
              <tr key={r.id || i} className={onRow ? "click" : undefined} tabIndex={onRow ? 0 : undefined}
                onClick={(e) => { if (onRow && !(e.target as HTMLElement).closest("a")) onRow(r); }}
                onKeyDown={(e) => { if (onRow && e.key === "Enter") onRow(r); }}>
                <td className="num mono">{i + 1}</td>
                {cols.map((c) => <td key={c.h} className={[c.wrap ? "wrap" : "", c.cls || ""].join(" ").trim() || undefined}>{c.cell(r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function CoPilotApp({ data: all, home = DEFAULT_COUNTRY, isSuper = true }: { data: AllData; home?: string; isSuper?: boolean }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab = params.get("tab") || "dashboard";
  const country = params.get("country") || home;
  // Everything below (dashboard, tabs, drill-downs) sees only the selected country's accounts and their linked rows.
  const data = useMemo<AllData>(() => {
    if (country === ALL) return all;
    const accounts = all.accounts.filter((a) => regionOf(a.country) === country);
    const ids = new Set(accounts.map((a) => a.id));
    const mine = (r: Row) => ids.has(r.company_id);
    return { ...all, accounts, contacts: all.contacts.filter(mine), signals: all.signals.filter(mine), sources: all.sources.filter(mine),
      conflicts: all.conflicts.filter(mine), apps: all.apps.filter(mine), history: all.history.filter(mine) };
  }, [all, country]);
  const [criteria, setCriteria] = useState<Criteria>(withDefaults());
  // Pipeline rules for the selected country come from Setup → Define ICP.
  const [icpDef, setIcpDef] = useState<unknown>(null);
  const regionRules = useMemo(() => rulesFor(icpDef, country === "All" ? "UAE" : country), [icpDef, country]);
  const pipe = regionRules.pipeline, focus = regionRules.focus, personas = regionRules.personas;
  // An existing Coupa customer isn't a new-business target — it moves to the Dashboard's "Existing Customers"
  // section (upsell / cross-sell / managed services) instead of competing for a Pipeline slot. Ariba and other
  // platforms stay in Pipeline: they're still a live Coupa-displacement prospect, on top of their own managed-
  // services angle.
  const inPipe = (a: Row, sc?: Scores) => !!sc && sc.m.total >= pipe.min_match && (!pipe.exclude_not_icp || a.icp_status !== "Not ICP") && !/coupa/i.test(str(a.existing_s2p_product));
  const [savedMeta, setSavedMeta] = useState<{ by?: string; at?: string } | null>(null);
  const [teamCriteria, setTeamCriteria] = useState<Criteria | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  // Reports tab: the table's own search/dropdowns/custom filter live inside FilterTable, so this mirrors its
  // live state (reported up via onState) for "Save this report" to use, and seeds it back in (via `initial` +
  // bumping reportKey to force a remount) when a saved report is opened.
  const [reportTableState, setReportTableState] = useState<{ q: string; fv: string[]; cf: CustomFilter[]; count: number }>({ q: "", fv: [], cf: [], count: 0 });
  const [reportSeed, setReportSeed] = useState<{ q?: string; fv?: string[]; cf?: CustomFilter[] } | undefined>(undefined);
  const [reportKey, setReportKey] = useState(0);
  const [savedReportItems, setSavedReportItems] = useState<SavedReport[]>([]);
  useEffect(() => { fetch("/api/reports").then((r) => (r.ok ? r.json() : null)).then((j) => j && setSavedReportItems(j.items || [])).catch(() => {}); }, []);
  useEffect(() => {
    try { setCollapsed(localStorage.getItem("dp-collapsed") === "1"); } catch {}
    supabaseBrowser().from("settings").select("value").eq("key", "icp_definition").maybeSingle().then(({ data: row }) => setIcpDef(row?.value || null));
    supabaseBrowser().from("settings").select("value").eq("key", "icp_criteria").maybeSingle()
      .then(({ data: row }) => { if (row?.value) { setCriteria(withDefaults(row.value as Criteria)); setTeamCriteria(withDefaults(row.value as Criteria)); setSavedMeta((row.value as { _meta?: { by?: string; at?: string } })._meta || null); } });
  }, []);
  // Header's global search (?gq=) applies once, then clears itself from the URL so it doesn't re-fire on refresh/back.
  useEffect(() => {
    const gq = params.get("gq");
    if (!gq) return;
    const parsed = parseGlobalQuery(gq);
    setCriteria((c) => ({ ...c, company: { ...c.company, name: parsed.name || c.company.name,
      ...(parsed.revenue.length ? { revenue: parsed.revenue } : {}), ...(parsed.employees.length ? { employees: parsed.employees } : {}),
      ...(parsed.icpStatus.length ? { icpStatus: parsed.icpStatus } : {}), ...(parsed.listing.length ? { listing: parsed.listing } : {}),
      ...(parsed.signal.length ? { signal: parsed.signal } : {}) } }));
    setCollapsed(false);
    try { localStorage.setItem("dp-collapsed", "0"); } catch {}
    const next = new URLSearchParams(params.toString()); next.delete("gq");
    router.replace(`${pathname}?${next.toString()}`);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [params]);
  const toggle = () => setCollapsed((c) => { try { localStorage.setItem("dp-collapsed", c ? "0" : "1"); } catch {} return !c; });
  async function saveCriteria(c: Criteria) {
    if (!isSuper) return { ok: false, error: "Only a Super Admin can save the team's filters. Your changes still apply to your own view." };
    const sb = supabaseBrowser(), at = new Date().toISOString();
    const { data: u } = await sb.auth.getUser();
    const by = (u.user?.user_metadata?.name as string) || u.user?.email || "";
    const { error } = await sb.from("settings").upsert({ key: "icp_criteria", value: { ...c, _meta: { by, at } }, updated_at: at });
    if (!error) { setSavedMeta({ by, at }); setTeamCriteria(c); }
    return error ? { ok: false, error: error.message } : { ok: true, by, at };
  }
  const [researchMsg, setResearchMsg] = useState("");
  // Research more targets the countries ticked in the panel's Country list; with none ticked, the country tile you are viewing.
  const researchTargets = useMemo(() => { const picked = criteria.company.countries.filter((c) => COUNTRIES.some((x) => x.code === c));
    return picked.length ? picked : country === ALL ? [] : [country]; }, [criteria.company.countries, country]);
  async function researchMore(limit: number, profile: boolean) {
    const k = criteria.company, n = researchTargets.length, where = n > 1 ? `${researchTargets.slice(0, -1).join(", ")} and ${researchTargets[n - 1]}` : researchTargets[0];
    if (!n) return;
    const one = profile ? 1 + limit * 0.55 : 1;
    const est = `${profile ? `≈ $0.50–1.00 for the search plus ≈ $0.55 per company profiled` : "≈ $0.50–1.00 per search"}${n > 1 ? ` × ${n} countries (up to ≈ $${(one * n).toFixed(2)})` : profile ? ` (up to ≈ $${one.toFixed(2)})` : ""}`;
    if (!(await ask({ title: `Research more in ${where}?`, tone: "cost", confirm: "Start research",
      points: [`Finds up to ${limit} new companies${n > 1 ? " in each country" : ""} matching your criteria${profile ? " and profiles each one" : ""}.`, "New companies appear under the list \"Claude discovery\"; follow progress in Research Queue."], cost: est }))) return;
    const summary = [`Revenue bands: ${k.revenue.join(", ") || "any (ICP minimum $250M)"}`, `Employees: ${k.employees.join(", ") || "100+"}`,
      k.industries.length && `Industries: ${k.industries.join(", ")}`, k.ownership.length && `Ownership: ${k.ownership.join(", ")}`,
      k.erp.length && `ERP: ${k.erp.join(", ")}`, k.procurement.length && `Procurement platform: ${k.procurement.join(", ")}`,
      k.triggers.length && `Business triggers: ${k.triggers.join(", ")}`, k.hq && `HQ: ${k.hq}`].filter(Boolean).join("\n");
    setResearchMsg("Starting…");
    const memo: { pin?: string } = {}, done: string[] = [], failed: string[] = [];
    for (const c of researchTargets) {
      const r = await paidFetch("/api/discover", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ country: c, limit, profile, criteria: summary }) }, `Research more in ${where}`, memo);
      (r.ok ? done : failed).push(c);
      if (!r.ok && !memo.pin) break; // cancelled or no PIN: stop
    }
    setResearchMsg(done.length ? `Discovery started for ${done.join(", ")}. Follow it in Research Queue; new companies appear under list "Claude discovery" (refresh the page when done).${failed.length ? ` Not started: ${failed.join(", ")}.` : ""}` : "Could not start discovery.");
  }
  // Criteria: text fields filter companies; everything else is scored so accounts are ranked, not hidden.
  const contactSet = Object.entries(criteria.contact).some(([, v]) => (Array.isArray(v) ? v.length : v));
  const A = useMemo(() => data.accounts.filter((a) => companyPasses(a, criteria)), [data.accounts, criteria]);
  const P = useMemo(() => { const ids = new Set(A.map((a) => a.id));
    return data.contacts.filter((p) => ids.has(p.company_id) && (!contactSet || contactMatches(p, criteria, data.history, famKey))); }, [data, A, criteria, contactSet]);
  const people = useMemo(() => buildPeople(P), [P]);
  const coById = useMemo(() => Object.fromEntries(A.map((a) => [a.id, a])), [A]);
  // Signals weren't previously scoped to the selected country/criteria at all. coById is built from A (which
  // already reflects the country tab and Discovery Criteria), so a signal whose company isn't in coById is
  // out of scope — the same check also excludes confirmed Coupa customers in one pass.
  const inScopeSignal = (s: Row) => { const c = coById[s.company_id]; return !!c && !/coupa/i.test(str(c.existing_s2p_product)); };
  const [perPerson, setPerPerson] = useState(true);
  // Geography follows the country tile you selected (so KSA accounts aren't marked down for not being in the panel's default UAE).
  const scoreCriteria = useMemo<Criteria>(() => country === ALL ? criteria : { ...criteria, company: { ...criteria.company, countries: [country], regions: [] } }, [criteria, country]);
  const scores = useMemo(() => {
    const hires: Record<string, number> = {};
    data.history.forEach((h) => { if (/change|promot|join|hire/i.test(str(h.determination))) hires[h.company_id] = (hires[h.company_id] || 0) + 1; });
    const m: Record<string, Scores> = {};
    // Focus (platforms, ERP, triggers) comes from each account's region in Define ICP.
    A.forEach((a) => { const fz = rulesFor(icpDef, a.country).focus, x = icpMatch(a, scoreCriteria), o = opportunity(a, hires[a.id] || 0, fz), f = coupaFit(a, fz);
      m[a.id] = { m: x, o, f, rank: Math.round((x.total * pipe.w_match + o.total * pipe.w_opportunity + f.total * pipe.w_fit) / 100) }; });
    return m;
  }, [A, scoreCriteria, data.history, pipe, icpDef]);
  // Search found nothing → offer to research that company (Research Queue, pre-filled; paid) or to ask in a free Claude session.
  const notFound = (q: string) => {
    const inApp = all.accounts.find((a) => str(a.company_name).toLowerCase().includes(q.toLowerCase()));
    const cName = country === ALL ? "" : (COUNTRIES.find((c) => c.code === country)?.name || country);
    return (
      <div className="search-miss">
        {inApp ? <p><b>&quot;{q}&quot;</b> is in the app as <b>{inApp.company_name}</b> ({regionOf(inApp.country)}, {inApp.icp_status}) but not in this list. {tab === "pipeline" ? "The Pipeline only shows accounts that pass your ICP — look in Accounts." : "Check the country tile and filters."}</p>
          : <><p><b>&quot;{q}&quot;</b> isn&apos;t in {cName ? `your ${cName} accounts` : "the app"} yet.</p>
            <p className="acts"><a className="btn primary" href={`/research?company=${encodeURIComponent(q)}${cName ? `&country=${encodeURIComponent(cName)}` : ""}`}>Research &quot;{q}&quot;{cName ? ` in ${cName}` : ""} →</a>
              <span className="note">Adds it with revenue, ICP status, contacts and signals. Uses the Anthropic API (asks for the PIN). Free alternative: ask in a Claude session.</span></p></>}
      </div>
    );
  };
  const [open, setOpen] = useState<string | null>(null);
  const [contact, setContact] = useState<string | null>(null);
  const [drill, setDrill] = useState<{ title: string; kind: Kind; rows: Row[] } | null>(null);
  const byCo = useMemo(() => {
    const m: Record<string, Row[]> = {};
    P.forEach((p) => { (m[p.company_id] ||= []).push(p); });
    return m;
  }, [P]);
  const openRow = (r: Row) => setOpen(r.company_id);
  // Deep link: ?open=<slug or id> opens that account's page (used by "View in Accounts" links).
  const openParam = params.get("open");
  useEffect(() => { if (!openParam) return; const a = all.accounts.find((x) => x.slug === openParam || x.id === openParam); if (a) setOpen(a.id); }, [openParam, all.accounts]);
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
    view = <FilterTable unit="companies" title="Accounts" empty={notFound} note="ICP = net revenue ≥ $250M and 100+ employees (stock listing not required). ✓ Verified: confirmed from an official source · ● Likely: your data / Seamless say ≥ $250M, not yet confirmed · ! Needs check: sources disagree about $250M · ? Unknown: no revenue figure yet · ✕ Not ICP: below $250M. Hover a status for the reason; select a row to open the account brief."
      rows={[...A].sort((a, b) => icpRank(a.icp_status) - icpRank(b.icp_status) || sigRank(a.s2p_signal_level) - sigRank(b.s2p_signal_level) || (bestRevenue(b).v || 0) - (bestRevenue(a).v || 0))}
      search={(a) => [a.company_name, a.industry, a.erp, a.existing_s2p_product, a.s2p_strong_signals].join(" ")}
      filters={[{ label: "ICP status", get: (a) => a.icp_status }, { label: "Source", get: (a) => simpleOrigin(a), tip: "source" },
        { label: "Signal", get: (a) => a.s2p_signal_level }, { label: "S2P Platform", get: (a) => a.existing_s2p_product }, { label: "Industry", get: (a) => a.industry },
        { label: "Exchange", get: (a) => a.exchange, tip: "exchange" }, { label: "Country", get: (a) => a.country }]}
      cols={[{ h: "", cls: "logo-cell", cell: (a) => <CompanyLogo a={a} /> }, { h: "Company", field: "company_name", cell: (a) => <b>{a.company_name}</b> },
        { h: "Exchange", field: "exchange", tip: "exchange", cell: (a) => a.exchange ? <span className="mono">{a.exchange} {a.ticker}</span> : <span className="muted">—</span> },
        { h: "Industry", field: "industry", cell: (a) => a.industry },
        { h: "S2P Platform", field: "existing_s2p_product", cell: (a) => a.existing_s2p_product || <span className="muted">—</span> },
        { h: "Revenue", field: "revenue_usd_m", cell: (a) => { const r = bestRevenue(a); return r.v ? <><span className="mono">{usd(r.v)}</span>{r.src && <div className="rev-src">{r.src}</div>}</> : <span className="muted">—</span>; } },
        { h: "ICP status", tip: "icpStatus", field: "icp_status", cell: (a) => <><IcpTag s={a.icp_status} why={a.icp_fit_reason} /><div className="muted mono rec-since">since {statusSince(a) || "—"}</div></> },
        { h: "ICP match", tip: "icpMatch", cell: (a) => scores[a.id] && <ScoreChip s={scores[a.id].m} label="ICP Match" /> },
        { h: "Opportunity", tip: "opportunity", cell: (a) => scores[a.id] && <ScoreChip s={scores[a.id].o} label="Opportunity" /> },
        { h: "Coupa fit", tip: "coupaFit", cell: (a) => scores[a.id] && <ScoreChip s={scores[a.id].f} label="Coupa Fit" /> },
        { h: "Updated", field: "updated_at", cell: (a) => <Dates a={a} /> }, { h: "Lists", field: "lists", cell: (a) => <span className="muted">{(a.lists || []).join(", ")}</span> },
        { h: "Signal", field: "s2p_signal_level", cell: (a) => <Pill s={a.s2p_signal_level} /> },
        { h: "S2P status", field: "s2p_platform_status", cell: (a) => a.s2p_platform_status }, { h: "ERP", field: "erp", cell: (a) => a.erp }, { h: "Contacts", cell: (a) => <span className="mono">{(byCo[a.id] || []).length}</span> }]}
      onRow={openRow} />;
  } else if (tab === "pipeline") {
    const ranked = A.filter((a) => inPipe(a, scores[a.id])).sort((a, b) => scores[b.id].rank - scores[a.id].rank);
    view = <FilterTable unit="accounts" title="Ranked pipeline" tipW={pipe} empty={notFound} note={<>
        <div className="pipe-rank-row">
          <div><b>Rank</b> — which account to work first: <b>{pipe.w_match}% × ICP Match + {pipe.w_opportunity}% × Opportunity + {pipe.w_fit}% × Coupa Fit</b>.</div>
          {ranked[0] && (() => { const t = ranked[0], sc = scores[t.id], p1 = sc.m.total * pipe.w_match / 100, p2 = sc.o.total * pipe.w_opportunity / 100, p3 = sc.f.total * pipe.w_fit / 100;
            const n = (x: number) => (Math.round(x * 10) / 10).toLocaleString();
            return <div className="pipe-example"><b>Live example — {t.company_name} (#1):</b> {pipe.w_match}% × {sc.m.total}% (ICP Match) + {pipe.w_opportunity}% × {sc.o.total}% (Opportunity) + {pipe.w_fit}% × {sc.f.total}% (Coupa Fit)
              = {n(p1)} + {n(p2)} + {n(p3)} = {n(p1 + p2 + p3)} → <b>Rank {sc.rank}%</b>. Every other account is ranked the same way.</div>; })()}
        </div>
        <div className="pipe-def">
          <div><b>ICP Match</b> — how well it fits your ICP (revenue, size, industry, ownership…). Needs {pipe.min_match}%+ to be listed.</div>
          <div><b>Opportunity</b> — how likely it is to buy soon (S2P signals, transformation, your buying triggers).</div>
          <div><b>Coupa Fit</b> — how well Coupa fits it (five value areas, its ERP and platform, your focus platforms).</div>
        </div>
        <p className="note">Every % = points earned ÷ points available. {pipe.exclude_not_icp ? "Not ICP accounts are left out. " : ""}Weights are set per region in Setup → Define ICP. Hover a score for its breakdown, click <InfoTip k="percent" w={pipe} /> for more, or read <a href="/guide#pipeline">Setup → Learn Me → Pipeline</a>.</p>
      </>}
      rows={ranked} search={(a) => [a.company_name, a.industry, a.erp, a.existing_s2p_product].join(" ")}
      filters={[{ label: "ICP status", get: (a) => a.icp_status }, { label: "S2P", get: (a) => a.existing_s2p_product }, { label: "Industry", get: (a) => a.industry },
        { label: "Source", get: (a) => simpleOrigin(a), tip: "source" }, { label: "Exchange", get: (a) => a.exchange, tip: "exchange" }, { label: "Country", get: (a) => a.country }]}
      cols={[{ h: "Rank", tip: "rank", cell: (a) => <b className="mono" title={`Rank ${scores[a.id].rank}% = ${pipe.w_match}% of ICP Match + ${pipe.w_opportunity}% of Opportunity + ${pipe.w_fit}% of Coupa Fit`}>{scores[a.id].rank}%</b> }, { h: "", cls: "logo-cell", cell: (a) => <CompanyLogo a={a} /> }, { h: "Company", cls: "co-cell", field: "company_name", cell: (a) => <><b>{a.company_name}</b><div className="muted clamp2" title={`${a.industry} · ${a.country}`}>{a.industry} · {a.country}</div></> },
        { h: "ICP match", tip: "icpMatch", cell: (a) => <ScoreChip s={scores[a.id].m} label="ICP Match" /> }, { h: "Opportunity", tip: "opportunity", cell: (a) => <ScoreChip s={scores[a.id].o} label="Opportunity" /> },
        { h: "Coupa fit", tip: "coupaFit", cell: (a) => <ScoreChip s={scores[a.id].f} label="Coupa Fit" /> }, { h: "ICP status", tip: "icpStatus", field: "icp_status", cell: (a) => <IcpTag s={a.icp_status} why={a.icp_fit_reason} /> },
        { h: "Revenue", field: "revenue_usd_m", cell: (a) => <span className="mono">{usd(bestRevenue(a).v)}</span> }, { h: "Existing S2P", field: "existing_s2p_product", cell: (a) => a.existing_s2p_product },
        { h: "Exchange", field: "exchange", cell: (a) => a.exchange ? <span className="mono">{a.exchange} {a.ticker}</span> : <span className="muted">—</span> },
        { h: "Source", tip: "source", cell: (a) => simpleOrigin(a) },
        { h: "Contacts", cell: (a) => <span className="mono">{(byCo[a.id] || []).length}</span> }]}
      onRow={openRow} />;
  } else if (tab === "stakeholders") {
    const rows: Row[] = perPerson ? people : P;
    view = <>
      <div className="seg-toggle-row">
        <div className="seg-toggle" role="group" aria-label="Stakeholder view">
          <button type="button" aria-pressed={perPerson} onClick={() => setPerPerson(true)}>One row per person ({people.length})</button>
          <button type="button" aria-pressed={!perPerson} onClick={() => setPerPerson(false)}>All source rows ({P.length})</button>
        </div>
        <InfoTip k="stakeholderView" />
      </div>
      <FilterTable unit={perPerson ? "people" : "rows"} title="Stakeholders" note={perPerson
        ? "Ranked by Persona fit (your buyer personas in Setup → Define ICP), then trust. One row per person, merged from every source (your sheet's CoPilot, Claude in Copilot and Claude-Seamless rows, plus Claude checks). Trust shows how many independent sources agree; select a person to see what each source says. Emails are never guessed."
        : "Every source row as imported or added by a Claude check. Nothing is deleted when rows are merged into one person."}
      rows={[...rows].map((p): Row => ({ ...p, __pf: personaFit(p, personas) })).sort((a, b) => b.__pf.score - a.__pf.score || TRUST_ORDER.indexOf(a.trust) - TRUST_ORDER.indexOf(b.trust) || sigRank(a.account_s2p_signal) - sigRank(b.account_s2p_signal) || str(a.company).localeCompare(b.company))}
      search={(p) => [p.company, p.full_name, p.title_verbatim, p.email, p.notes_contact].join(" ")}
      filters={[...(perPerson ? [{ label: "Trust", get: (p: Row) => p.trust }, { label: "Sources", get: (p: Row) => (p.sources || []).join(" + ") }] : [{ label: "Source", get: (p: Row) => simpleOrigin(coById[p.company_id]), tip: "source" }]),
        { label: "Persona fit", get: (p) => p.__pf?.label }, { label: "Tier", get: (p) => p.contact_tier }, { label: "Role family", get: (p) => famKey(p.role_family) }, { label: "Email status", get: (p) => p.email_status }]}
      cols={[{ h: "Company", field: "company", cell: (p) => p.company }, { h: "Full name", field: "full_name", cell: (p) => <b>{p.full_name}</b> }, { h: "Title (verbatim)", field: "title_verbatim", cell: (p) => p.title_verbatim, wrap: true },
        { h: "Persona fit", tip: "personaFit", cell: (p) => p.__pf?.label === "No personas set" ? <span className="muted">—</span>
          : <span className={`pf ${p.__pf.score >= 99 ? "hi" : p.__pf.score >= 50 ? "mid" : "lo"}`} title={p.__pf.why}>{p.__pf.score}%<small>{p.__pf.label}</small></span> },
        ...(perPerson ? [{ h: "Trust", tip: "trust", field: "trust", cell: (p: Row) => <><TrustTag t={p.trust} why={p.trust_reason} /><div className="muted">{(p.sources || []).join(" + ")}</div></> }]
          : [{ h: "Source", tip: "source", cell: (p: Row) => <>{simpleOrigin(coById[p.company_id])}<div className="muted">{p.record_status}</div></> }]),
        { h: "Role family", field: "role_family", cell: (p) => p.role_family }, { h: "Tier", field: "contact_tier", cell: (p) => p.contact_tier },
        { h: "Email", field: "email", cell: (p) => <span className="mono">{p.email}</span> }, { h: "Email status", field: "email_status", cell: (p) => p.email_status },
        { h: "Phone", field: "phone", cell: (p) => <><span className="mono">{p.phone}</span> <span className="muted">{p.phone_type}</span></> },
        { h: "LinkedIn", field: "linkedin_url", cell: (p) => <Ext href={p.linkedin_url}>profile</Ext> }, { h: "S2P signal", field: "account_s2p_signal", cell: (p) => <Pill s={p.account_s2p_signal} /> }]}
      onRow={(p) => setContact(p.best_id || p.id)} /></>;
  } else if (tab === "signals") {
    view = <FilterTable unit="signals" title="S2P signals" note="Every signal carries its evidence and source. Follows the country tab above; existing Coupa customers are excluded — see Existing Coupa Customers on the Dashboard instead."
      rows={[...data.signals].filter(inScopeSignal).sort((a, b) => sigRank(a.level) - sigRank(b.level))}
      search={(s) => [s.company, s.signal, s.evidence, s.platform].join(" ")}
      filters={[{ label: "Level", get: (s) => s.level }, { label: "Category", get: (s) => s.category }, { label: "Platform", get: (s) => s.platform }]}
      cols={[{ h: "Company", field: "company", cell: (s) => <b>{s.company}</b> }, { h: "Level", field: "level", cell: (s) => <Pill s={s.level} /> }, { h: "Category", field: "category", cell: (s) => s.category },
        { h: "Platform", field: "platform", cell: (s) => s.platform }, { h: "Signal", field: "signal", cell: (s) => s.signal, wrap: true }, { h: "Evidence", field: "evidence", cell: (s) => s.evidence, wrap: true },
        { h: "Date", field: "date", cell: (s) => <span className="mono">{s.date}</span> }, { h: "Source", cell: (s) => <Ext href={s.source_url}>source</Ext> }]}
      onRow={openRow} />;
  } else if (tab === "erp") {
    view = <FilterTable title="ERP & third-party apps" note="FACT = directly sourced · LIKELY = several indirect signals · UNVERIFIED = one weak source, such as technographics."
      rows={data.apps} search={(r) => [r.company, r.name, r.category, r.evidence].join(" ")}
      filters={[{ label: "Category", get: (r) => r.category }, { label: "Status", get: (r) => r.status }]}
      cols={[{ h: "Company", field: "company", cell: (r) => <b>{r.company}</b> }, { h: "Application", field: "name", cell: (r) => r.name }, { h: "Category", field: "category", cell: (r) => r.category },
        { h: "Status", field: "status", cell: (r) => <StatusTag s={r.status} /> }, { h: "Evidence", field: "evidence", cell: (r) => r.evidence, wrap: true }, { h: "Source", cell: (r) => <Ext href={r.source_url}>source</Ext> }]}
      onRow={openRow} />;
  } else if (tab === "conflicts") {
    view = <ConflictGroupsView groups={groupConflicts(data.conflicts)} isSuper={isSuper} onResolved={() => router.refresh()} />;
  } else if (tab === "sources") {
    const region = country === ALL ? "All regions" : country;
    const idx = indexSources(A, data.sources.filter((s) => A.some((a) => a.id === s.company_id)), data.contacts);
    const perCountry = (rows: Row[]) => country === ALL ? countBy(rows, (a) => regionOf(a.country)).map(([k, n]) => `${k} ${n}`).join(" · ") : "";
    const tile = (key: string, name: string, color: string, rows: Row[], kind: Kind, sub: React.ReactNode, tip = "") => (
      <button type="button" key={key} className={`kpi src-tile${rows.length ? "" : " empty"}`} style={{ "--k": color } as React.CSSProperties} title={tip}
        onClick={() => rows.length && setDrill({ title: `${name} | ${region}`, kind, rows })}>
        <small>{name} <span className="src-region">| {region}</span></small><b>{rows.length.toLocaleString()}</b><em>{sub}</em><span className="kpi-go" aria-hidden="true">View →</span>
      </button>);
    const origins = SOURCES.filter((d) => d.group === "origin");
    const wbIds = new Set((idx.workbook || []).map((a) => a.id));
    const wbRows = data.contacts.filter((p) => p.is_reference && wbIds.has(p.company_id));
    const contrib = countBy(wbRows, contributorOf);
    const catalogue = (group: "origin" | "contributor" | "evidence", label: string) => (
      <details className="src-cat"><summary>{label}</summary>
        <div className="tablewrap"><table><thead><tr><th>Source</th><th>What it is</th><th>Provides</th><th>How it's collected</th><th>Reliability</th><th>Cost</th></tr></thead>
          <tbody>{SOURCES.filter((d) => d.group === group).map((d) => (
            <tr key={d.key}><td><span className="src-dot" style={{ background: d.color }} /> <b>{d.name}</b></td><td className="wrap">{d.what}</td><td className="wrap">{d.provides}</td>
              <td className="wrap">{d.how}</td><td className="wrap">{d.reliability}</td><td>{d.cost}</td></tr>))}</tbody></table></div></details>);
    const icpBuckets: [string, string, string[], string][] = [["Verified", "#2ECC8F", ["ICP — Verified"], "Revenue ≥ $250M confirmed from an official document (annual report, filing, company-quoted press)"],
      ["Likely", "#3AA0FF", ["ICP — Likely"], "An estimate says ≥ $250M (your workbook, Seamless with matching headcount, aggregators) — not yet checked against an official document"],
      ["Needs check / Unknown", "#F5A623", ["ICP — Needs check", "Unknown"], "Sources disagree across $250M, only an estimate below $250M, or no figure at all"],
      ["Not ICP", "#FF4D6A", ["Not ICP"], "Official revenue below $250M"]];
    const trustDef: Record<Trust, string> = { "Confirmed by 2+ sources": "Two or more independent sources agree on this person at this company (e.g. CoPilot and Seamless), or Claude verified them from an official page",
      "Single source": "Only one source has this person; nothing contradicts it yet", Conflicting: "Sources disagree (different emails or titles), a check flagged a conflict, or the person may have changed job" };
    const trustColor: Record<Trust, string> = { "Confirmed by 2+ sources": "#2ECC8F", "Single source": "#3AA0FF", Conflicting: "#FF4D6A" };
    view = <>
      <div className="panel src-panel">
        <h2>1 · Origin — where each company came from</h2>
        <p className="note">Every company has exactly one origin, so these tiles add up to the total: {origins.map((d) => (idx[d.key] || []).length).join(" + ")} = {A.length} companies. Select a tile to see them.</p>
        <div className="kpis src-tiles">{origins.map((d) => tile(d.key, d.name, d.color, idx[d.key] || [], "accounts",
          d.key === "workbook" && wbRows.length ? <>Contributors: {contrib.map(([k, n]) => `${k} ${n}`).join(" · ")} contact rows</> : <>companies{perCountry(idx[d.key] || []) && ` · ${perCountry(idx[d.key] || [])}`}</>, d.what))}</div>
        {catalogue("origin", "What each origin is")}{catalogue("contributor", "Contributors — who added or checked data inside an origin")}
      </div>
      <div className="panel src-panel">
        <h2>2 · Trust — how many independent sources agree</h2>
        <p className="note">Companies: revenue confirmed from an official source (Verified) or only estimated. Contacts: one record per person; Confirmed = two or more contributors agree (or Claude verified from an official source), Conflicting = sources disagree or the person may have moved.</p>
        <h3 className="src-h3">Companies</h3>
        <div className="kpis src-tiles">{icpBuckets.map(([n, c, st, def]) => { const rows = A.filter((a) => st.includes(a.icp_status || "Unknown"));
          return tile(n, n, c, rows, "accounts", <span className="src-def">{def}</span>, def); })}</div>
        <h3 className="src-h3">Contacts ({people.length} people)</h3>
        <div className="kpis src-tiles">{TRUST_ORDER.map((t) => { const rows = people.filter((p) => p.trust === t);
          return tile(t, t, trustColor[t], rows, "contacts", <span className="src-def">{trustDef[t]}</span>, trustDef[t]); })}</div>
      </div>
      <div className="panel src-panel">
        <h2>3 · Evidence — the documents behind the facts</h2>
        <p className="note">Companies with at least one fact from that type of document. Tier 1 = official (filings, company websites); Tier 3–4 = databases and estimates.</p>
        <div className="kpis src-tiles">{SOURCES.filter((d) => d.group === "evidence").map((d) => tile(d.key, d.name, d.color, idx[d.key] || [], "accounts", "companies", d.what))}</div>
        {catalogue("evidence", "What each evidence type is")}
      </div>
      <FilterTable unit="sources" title="Source evidence" note="The audit trail behind every fact: one row per source used, with what was found and how confident we are." rows={data.sources}
      search={(s) => [s.company, s.source, s.information_found, s.url].join(" ")}
      filters={[{ label: "Source group", get: (s) => evidenceGroup(s) }, { label: "Tier", get: (s) => s.source_tier }, { label: "Type", get: (s) => s.source_type }, { label: "Confidence", get: (s) => s.confidence }]}
      cols={[{ h: "Company", field: "company", cell: (s) => s.company }, { h: "Source", field: "source", cell: (s) => s.source }, { h: "Type", field: "source_type", cell: (s) => s.source_type }, { h: "Tier", field: "source_tier", cell: (s) => s.source_tier },
        { h: "Information found", field: "information_found", cell: (s) => s.information_found, wrap: true }, { h: "Published", field: "date_published", cell: (s) => <span className="mono">{s.date_published}</span> },
        { h: "Confidence", field: "confidence", cell: (s) => s.confidence }, { h: "URL", cell: (s) => <Ext href={s.url}>open</Ext> }]}
      onRow={openRow} /></>;
  } else if (tab === "reports") {
    const fmtM = (n: number | null) => n === null ? "—" : n >= 1000 ? `$${(n / 1000).toFixed(2).replace(/\.?0+$/, "")}B` : `$${Math.round(n)}M`;
    const byId = new Map(A.map((a) => [a.id, a]));
    const reportRows: Row[] = P.map((p) => {
      const a = byId.get(p.company_id);
      return { ...p, r_country: a ? regionOf(a.country) : "", r_icp: a?.icp_status || "Unknown", r_revenue: a ? fmtM(revenueOf(a)) : "—",
        r_employees: a?.employee_range || "—", r_listing: a?.listing_status || "—", r_erp: a ? erpKey(a.erp) : "—", r_signal: p.account_s2p_signal || "NO SIGNAL" };
    });
    view = <>
      <SavedReportsList items={savedReportItems}
        onOpen={(c, tf, name) => { setCriteria(c); setReportSeed(tf); setReportKey((k) => k + 1); notify(`Opened "${name}" — reapplying its filters.`, "ok"); }}
        onDelete={setSavedReportItems} />
      <FilterTable key={reportKey} unit="contacts" title="Search / Filter results" note="One row per contact, with the account context alongside — a ready list to call or email. Narrow it with the search box, dropdowns or + Custom filter below, or the Discovery panel on the left — saving a filter remembers whatever you've set, however you set it."
        toggleExtra={<SaveReportButton criteria={criteria} tableState={reportTableState} onSaved={setSavedReportItems} />}
        rows={reportRows} initial={reportSeed} onState={setReportTableState}
        search={(p) => [p.company, p.full_name, p.title_verbatim, p.email, p.r_country].join(" ")}
        filters={[{ label: "ICP status", get: (p) => p.r_icp }, { label: "Country", get: (p) => p.r_country }, { label: "S2P signal", get: (p) => p.r_signal }]}
        cols={[{ h: "Company", field: "company", cell: (p) => <b>{p.company}</b> }, { h: "Contact Name", field: "full_name", cell: (p) => p.full_name }, { h: "Job Title", field: "title_verbatim", cell: (p) => p.title_verbatim, wrap: true },
          { h: "Email", field: "email", cell: (p) => <span className="mono">{p.email}</span> }, { h: "Phone", field: "phone", cell: (p) => <span className="mono">{p.phone}</span> },
          { h: "Country", field: "r_country", cell: (p) => p.r_country }, { h: "ICP Status", field: "r_icp", cell: (p) => p.r_icp }, { h: "Revenue", field: "r_revenue", cell: (p) => p.r_revenue },
          { h: "Employees", field: "r_employees", cell: (p) => p.r_employees }, { h: "S2P Signal", field: "r_signal", cell: (p) => <Pill s={p.r_signal} /> }, { h: "ERP", field: "r_erp", cell: (p) => p.r_erp }]}
        onRow={(p) => setContact(p.best_id || p.id)} />
    </>;
  } else {
    const top = A.filter((a) => sigRank(a.s2p_signal_level) <= 1 && !/coupa/i.test(str(a.existing_s2p_product))).sort((a, b) => sigRank(a.s2p_signal_level) - sigRank(b.s2p_signal_level));
    const ACT = ["Evaluation", "RFP / Tender", "Currently Implementing", "Replacement / Transformation"];
    const notCoupa = (a: Row) => !/coupa/i.test(str(a.existing_s2p_product));
    const kpis: [string, Row[], Kind][] = [
      ["Accounts (all lists)", A, "accounts"], ["ICP — Verified", A.filter((a) => a.icp_status === "ICP — Verified" && notCoupa(a)), "accounts"],
      ["ICP — Likely", A.filter((a) => a.icp_status === "ICP — Likely" && notCoupa(a)), "accounts"],
      ["ICP — Needs check", A.filter((a) => (a.icp_status === "ICP — Needs check" || a.icp_status === "Unknown") && notCoupa(a)), "accounts"],
      ["Strong / very strong", top, "accounts"], ["Contacts (people)", people, "contacts"],
      ["Confirmed by 2+ sources", people.filter((p) => p.trust === "Confirmed by 2+ sources" && notCoupa(coById[p.company_id])), "contacts"], ["Contacts with email", people.filter((p) => p.email), "contacts"],
      ["Signals logged", data.signals.filter(inScopeSignal), "signals"], ["Conflicts retained", data.conflicts, "conflicts"],
      ["Employment changes", data.history.filter((h) => /change/i.test(str(h.determination))), "history"],
      ["Possible new S2P projects", A.filter((a) => ACT.includes(a.s2p_platform_status)), "accounts"],
    ];
    // Existing platform holders get a different sales lens than a prospect: not "should we target them" (ICP
    // status) but "what do we sell them next". Coupa customers are the agent's own install base (upsell / module
    // cross-sell / managed services) and come out of Pipeline — see inPipe — since they're not a new-business
    // target. Ariba and the other platforms stay in Pipeline (still a Coupa-displacement prospect) and additionally
    // get a managed-services angle, since SCP can service any S2P platform's implementation, not only Coupa's.
    const coupaCustomers = A.filter((a) => /coupa/i.test(str(a.existing_s2p_product)));
    const aribaCustomers = A.filter((a) => /ariba/i.test(str(a.existing_s2p_product)));
    const otherPlatformCustomers = A.filter((a) => /oracle procurement|ivalua|jaggaer|\bgep\b|zycus/i.test(str(a.existing_s2p_product)));

    view = (
      <>
        <div className="kpis">{kpis.map(([l, rows, kind], i) => (
          <button type="button" key={l} className={`kpi c${(i % 8) + 1}`} onClick={() => setDrill({ title: l, kind, rows })} title={`Show the ${rows.length.toLocaleString()} records`}>
            <small>{l}</small><b>{rows.length.toLocaleString()}</b><span className="kpi-go" aria-hidden="true">View →</span>
          </button>))}</div>
        <div className="panel" style={{ marginTop: 16 }}>
          <h2>Existing Customers — Expansion &amp; Services</h2>
          <p className="note">Separate from ICP status above (that's for prospects still being evaluated) — these already run an S2P platform, so the question is what to sell them next, not whether to pursue them.</p>
          <div className="kpis">
            <button type="button" className="kpi" style={{ "--k": "#2ECC8F" } as React.CSSProperties}
              onClick={() => setDrill({ title: "Existing Coupa Customers", kind: "accounts", rows: coupaCustomers })} title={`Show the ${coupaCustomers.length.toLocaleString()} records`}>
              <small>Existing Coupa Customers</small><b>{coupaCustomers.length.toLocaleString()}</b>
              <em>Upsell, cross-sell &amp; managed services opportunities</em><span className="kpi-go" aria-hidden="true">View →</span>
            </button>
            <button type="button" className="kpi" style={{ "--k": "#7CC4FF" } as React.CSSProperties}
              onClick={() => setDrill({ title: "Ariba Customers", kind: "accounts", rows: aribaCustomers })} title={`Show the ${aribaCustomers.length.toLocaleString()} records`}>
              <small>Ariba Customers</small><b>{aribaCustomers.length.toLocaleString()}</b>
              <em>Managed services opportunity — still a Coupa prospect</em><span className="kpi-go" aria-hidden="true">View →</span>
            </button>
            <button type="button" className="kpi" style={{ "--k": "#F2C46B" } as React.CSSProperties}
              onClick={() => setDrill({ title: "Other Platform Customers", kind: "accounts", rows: otherPlatformCustomers })} title={`Show the ${otherPlatformCustomers.length.toLocaleString()} records`}>
              <small>Other Platforms</small><b>{otherPlatformCustomers.length.toLocaleString()}</b>
              <em>GEP, Jaggaer, Ivalua, Zycus — managed services opportunity, still a Coupa prospect</em><span className="kpi-go" aria-hidden="true">View →</span>
            </button>
          </div>
        </div>
        <div className="grid2">
          <div className="panel"><h2>Accounts by S2P signal</h2><Bars entries={countBy(A, (a) => a.s2p_signal_level)} order={sigRank} signal /></div>
          <div className="panel"><h2>Existing S2P platform</h2><Bars entries={countBy(A, (a) => a.existing_s2p_product)} /></div>
          <div className="panel"><h2>ERP landscape</h2><Bars entries={countBy(A, (a) => erpKey(a.erp)).slice(0, 10)} /></div>
          <div className="panel"><h2>Contacts by role family</h2><Bars entries={countBy(people, (p) => famKey(p.role_family))} /></div>
          <div className="panel"><h2>Contact trust</h2><Bars entries={countBy(people, (p) => p.trust)} order={(k) => TRUST_ORDER.indexOf(k as Trust)} /></div>
          <div className="panel"><h2>Accounts by origin</h2><Bars entries={countBy(A, originName)} /></div>
          <div className="panel"><h2>Accounts by ICP status</h2><Bars entries={countBy(A.filter(notCoupa), (a) => a.icp_status || "Unknown")} order={(k) => icpRank(k)} /></div>
        </div>
        <div className="panel" style={{ marginTop: 16 }}>
          <h2 className="with-count">Priority accounts <span className="count">{top.length} {top.length === 1 ? "account" : "accounts"}</span></h2>
          <p className="note">Accounts with strong or very strong S2P signals. Select a row to open the account brief.</p>
          <div className="tablewrap"><table>
            <thead><tr><th className="num">#</th><th className="logo-cell"></th><th>Company</th><th>Signal</th><th>Existing S2P</th><th>Status</th><th>ERP</th><th>Why</th></tr></thead>
            <tbody>{top.map((a, i) => (
              <tr key={a.id} className="click" tabIndex={0} onClick={() => setOpen(a.id)} onKeyDown={(e) => e.key === "Enter" && setOpen(a.id)}>
                <td className="num mono">{i + 1}</td><td className="logo-cell"><CompanyLogo a={a} /></td><td><b>{a.company_name}</b></td><td><Pill s={a.s2p_signal_level} /></td><td>{a.existing_s2p_product}</td><td>{a.s2p_platform_status}</td>
                <td>{a.erp}</td><td className="wrap">{str(a.s2p_strong_signals).slice(0, 260)}</td>
              </tr>))}
            </tbody></table></div>
        </div>
      </>
    );
  }

  return (
    <div className={`app-shell${collapsed ? " dp-closed" : ""}`}>
    <DiscoveryPanel criteria={criteria} onApply={setCriteria} onSave={saveCriteria} savedMeta={savedMeta} teamCriteria={teamCriteria} collapsed={collapsed} onToggle={toggle}
      country={country} researchTargets={researchTargets} onResearch={researchMore} researchMsg={researchMsg} isSuper={isSuper} />
    <div className="app-main">
      <Hero title={tab === "dashboard" && country !== ALL ? `Dashboard-${COUNTRIES.find((c) => c.code === country)?.name || country}` : (HERO[tab] || HERO.dashboard)[0]}
        text={tab === "dashboard"
          ? `A live snapshot of ${country === ALL ? "" : `${COUNTRIES.find((c) => c.code === country)?.name || country} `}target accounts, S2P signals, ERP landscape and decision makers.`
          : (HERO[tab] || HERO.dashboard)[1]} />
      <section className="view">{A.length === 0
        ? <div className="panel"><h2>No {COUNTRIES.find((c) => c.code === country)?.name || country} accounts yet</h2>
            <p>This market is next on the roadmap. Add companies from the Research Queue (choose the country there), or pick another country above.</p></div>
        : view}</section>
      {drill && <DrillDown d={drill} byCo={byCo} coById={coById} onClose={() => setDrill(null)} onAccount={setOpen} onContact={setContact} />}
      {open && A.find((x) => x.id === open) && <Brief a={A.find((x) => x.id === open)!} data={data} people={byCo[open] || []} onClose={() => setOpen(null)} onContact={setContact}
        scores={scores[open]} criteria={criteria} isSuper={isSuper} />}
      {contact && (() => { const p = P.find((x) => x.id === contact); return p ? <ContactCard p={p} data={data} onClose={() => setContact(null)} onAccount={(id) => { setContact(null); setOpen(id); }} /> : null; })()}
    </div>
    </div>
  );
}

function Fact({ l, children }: { l: string; children: React.ReactNode }) {
  if (children === null || children === undefined || children === "") return null;
  return <div className="fact"><small>{l}</small><div>{children}</div></div>;
}

function Brief({ a, data, people, onClose, onContact, scores, criteria, isSuper }: { a: Row; data: AllData; people: Row[]; onClose: () => void; onContact: (id: string) => void;
  scores?: Scores; criteria: Criteria; isSuper: boolean }) {
  const router = useRouter();
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
      const r = await paidFetch("/api/pitch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(facts) }, "Drafting a pitch plan");
      const j = await r.json();
      setPitch(j.text || j.error || "Could not draft the pitch plan.");
    } catch { setPitch("Could not reach the server. Try again."); } finally { setBusy(false); }
  }
  async function refreshResearch() {
    setRefresh("Starting…");
    const r = await paidFetch("/api/research", { method: "POST", headers: { "Content-Type": "application/json" },
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
            <h3 className="drawer-title-logo"><CompanyLogo a={a} size={30} />{a.company_name}</h3>
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
                <div key={l} className="score-card"><small>{l}<InfoTip k={l === "ICP Match" ? "icpMatch" : l === "Opportunity" ? "opportunity" : "coupaFit"} /></small><b className={sc.total >= 70 ? "hi" : sc.total >= 45 ? "mid" : "lo"}>{sc.total}%</b>
                  <ul>{sc.parts.map((x) => <li key={x.label}><span>{x.label}</span><span className="mono" title="points earned of the points available">{x.score} of {x.max} pts</span><em>{x.why}</em></li>)}</ul></div>))}
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
          {a.profile?.["HubSpot"] && <HubSpotBlock hs={a.profile["HubSpot"]} />}
          {a.profile && <Profile profile={a.profile} />}
          <div className="block"><h4>Opportunity observations</h4><p>{a.potential_opportunity || "—"}</p>{a.account_notes && <p className="note">{a.account_notes}</p>}</div>
          {(() => {
            const prod = str(a.existing_s2p_product);
            const isCoupa = /coupa/i.test(prod);
            const isOtherPlatform = !isCoupa && /ariba|oracle procurement|ivalua|jaggaer|\bgep\b|zycus/i.test(prod);
            if (!isCoupa && !isOtherPlatform) return null;
            // Reuses the Coupa Fit scoring already computed for Pipeline ranking (lib/icp.ts coupaFit) — just
            // surfaced here as a to-do list instead of a buried score. Source-to-Pay (their core usage) reads as
            // Upsell; the other value areas that still score well read as Cross-sell candidates — a suggestion to
            // explore, not a confirmed gap, since the app doesn't track which modules an account already owns.
            // Managed Services is offered unconditionally to any existing-platform account, Coupa or not.
            const parts = scores?.f.parts || [];
            const core = parts.find((p) => p.label === "Source-to-Pay");
            const crossSell = parts.filter((p) => p.label !== "Source-to-Pay" && p.label !== "Your platform focus" && p.score >= p.max * 0.75);
            return (
              <div className="block">
                <h4>{isCoupa ? "Expansion & Services Opportunity" : "Managed Services Opportunity"}</h4>
                {isCoupa ? (
                  <>
                    <p className="note">Existing Coupa customer — not a new-business pitch. Upsell and cross-sell reasoning reuses the same Coupa Fit scoring used for Pipeline ranking; Managed Services is offered to any existing-platform account regardless of score.</p>
                    {core && <p className="opp-line"><span className="tag opp-upsell">Upsell</span> <b>Expand core Source-to-Pay usage</b><br /><span className="note">{core.why}</span></p>}
                    {crossSell.map((p) => (
                      <p key={p.label} className="opp-line"><span className="tag opp-cross">Cross-sell</span> <b>{p.label}</b><br /><span className="note">{p.why} — worth checking whether this module is already in place.</span></p>
                    ))}
                    <p className="opp-line"><span className="tag opp-mgd">Managed Services</span> <b>Ongoing admin &amp; optimisation</b><br />
                      <span className="note">Keep the Coupa estate tuned as the business changes — new entities, categories, suppliers and process changes.</span></p>
                  </>
                ) : (
                  <p className="opp-line"><span className="tag opp-mgd">Managed Services</span> <b>Runs {a.existing_s2p_product} today</b><br />
                    <span className="note">SCP can offer managed services on the existing estate regardless of platform. This account also remains a Coupa-displacement prospect in Pipeline — not excluded like a Coupa customer would be.</span></p>
                )}
              </div>
            );
          })()}
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
            <ConflictGroupsView groups={groupConflicts(conf)} isSuper={isSuper} onResolved={() => router.refresh()} byCompany={false} /></div>}
          <div className="block"><h4>Evidence ({srcs.length} sources)</h4>
            {srcs.map((s) => <p key={s.id} className="note"><span className="tag">{s.source_tier}</span> <b>{s.source}</b> {s.date_published && `(${s.date_published})`} — {s.information_found} <Ext href={s.url}>open</Ext></p>)}</div>
        </div>
      </aside>
    </>
  );
}

/** HubSpot match (read-only from SCP HubSpot; kept inside this app). */
function HubSpotBlock({ hs }: { hs: Record<string, any> }) {
  const deals: Record<string, any>[] = hs.deals || [];
  return (
    <div className="block"><h4>HubSpot (read-only) · checked {String(hs.checked_at || "").slice(0, 10)}</h4>
      {!hs.in_hubspot ? <p className="note">Not in HubSpot. Safe to import as a new company.</p> : <>
        <p><b>{hs.hubspot_name}</b> · Stage: <b>{hs.stage || "—"}</b> · Owner: {hs.owner || "—"}{hs.records > 1 ? ` · ${hs.records} HubSpot records share this domain` : ""}</p>
        {deals.length > 0 ? deals.map((x, i) => <p key={i} className="note">{x.name} · {x.stage}{x.amount != null ? ` · $${Number(x.amount).toLocaleString("en-US")}` : ""} · {x.close}</p>)
          : <p className="note">No deals.</p>}
        {(hs.contact_emails || []).length > 0 && <p className="note">{hs.contact_emails.length} of this company&apos;s contacts already in HubSpot.</p>}
      </>}
    </div>
  );
}

function Profile({ profile }: { profile: Record<string, Record<string, unknown>> }) {
  const sheets = Object.entries(profile).filter(([k, v]) => k !== "HubSpot" && v && Object.keys(v).length);
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

function DrillDown({ d, byCo, coById, onClose, onAccount, onContact }: { d: { title: string; kind: Kind; rows: Row[] }; byCo: Record<string, Row[]>; coById: Record<string, Row>;
  onClose: () => void; onAccount: (id: string) => void; onContact: (id: string) => void }) {
  let table: React.ReactNode;
  if (d.kind === "accounts") {
    table = <FilterTable unit="companies" title={d.title} rows={[...d.rows].sort((a, b) => icpRank(a.icp_status) - icpRank(b.icp_status) || (bestRevenue(b).v || 0) - (bestRevenue(a).v || 0))}
      search={(a) => [a.company_name, a.industry, a.erp, a.existing_s2p_product].join(" ")}
      filters={[{ label: "ICP status", get: (a) => a.icp_status }, { label: "Signal", get: (a) => a.s2p_signal_level }, { label: "Industry", get: (a) => a.industry }, { label: "Platform", get: (a) => a.existing_s2p_product }]}
      cols={[{ h: "", cls: "logo-cell", cell: (a) => <CompanyLogo a={a} /> }, { h: "Company", cell: (a) => <b>{a.company_name}</b> }, { h: "Revenue", cell: (a) => <span className="mono">{usd(bestRevenue(a).v)}</span> },
        { h: "ICP status", cell: (a) => <IcpTag s={a.icp_status} why={a.icp_fit_reason} /> }, { h: "Updated", cell: (a) => <Dates a={a} /> }, { h: "Signal", cell: (a) => <Pill s={a.s2p_signal_level} /> },
        { h: "S2P", cell: (a) => a.existing_s2p_product }, { h: "ERP", cell: (a) => a.erp }, { h: "Contacts", cell: (a) => <span className="mono">{(byCo[a.id] || []).length}</span> }]}
      onRow={(a) => onAccount(a.id)} />;
  } else if (d.kind === "contacts") {
    const s2p = (p: Row) => coById[p.company_id]?.existing_s2p_product || "";
    table = <FilterTable unit="contacts" title={d.title} rows={d.rows} search={(p) => [p.company, p.full_name, p.title_verbatim, p.email].join(" ")}
      filters={[{ label: "Tier", get: (p) => p.contact_tier }, { label: "Role family", get: (p) => famKey(p.role_family) }, { label: "Channel", get: (p) => p.channel_state }, { label: "S2P Platform", get: (p) => s2p(p) }]}
      cols={[{ h: "Name", cell: (p) => <b>{p.full_name}</b> }, { h: "Company", cell: (p) => p.company }, { h: "Title", cell: (p) => p.title_verbatim, wrap: true },
        { h: "Email", cell: (p) => <span className="mono">{p.email}</span> }, { h: "Channel", cell: (p) => p.channel_state },
        { h: "S2P Platform", cell: (p) => s2p(p) || <span className="muted">—</span> }]}
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
  const person = buildPeople([p, ...others.filter((o) => o.company_id === p.company_id)])[0] as Person | undefined;
  const same = (a: unknown, b: unknown) => !str(a) || !str(b) ? "" : str(a).trim().toLowerCase() === str(b).trim().toLowerCase() ? " ✓" : " ≠";
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
            {person && <div style={{ marginTop: 6 }}><TrustTag t={person.trust} why={person.trust_reason} /> <span className="muted">{person.trust_reason}</span></div>}
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
          <div className="block"><h4>What each source says ({1 + others.length} record{others.length ? "s" : ""})</h4>
            <p className="note">✓ = agrees with the record shown above · ≠ = differs · blank = not provided by that source.</p>
            <div className="tablewrap"><table><thead><tr><th>Source</th><th>Title</th><th>Email</th><th>Phone</th><th>LinkedIn</th><th>Status</th></tr></thead>
              <tbody>{[p, ...others].map((o) => <tr key={o.id}><td><b>{contributorOf(o)}</b>{o.id === p.id && <div className="muted">shown above</div>}</td>
                <td>{o.title_verbatim}{o.id !== p.id && same(o.title_verbatim, p.title_verbatim)}</td>
                <td className="mono">{o.email}{o.id !== p.id && same(o.email, p.email)}<div className="muted">{o.email_status}</div></td>
                <td className="mono">{o.phone}{o.id !== p.id && same(o.phone, p.phone)}</td><td><Ext href={o.linkedin_url}>profile</Ext></td>
                <td className="muted">{[o.verification_status, o.employment_status, o.record_status].filter(Boolean).join(" · ")}</td></tr>)}</tbody></table></div></div>
          {hist.length > 0 && <div className="block"><h4>Employment history ({hist.length})</h4>
            {hist.slice(0, 12).map((h) => <p key={h.id} className="note"><b>{h.title}</b> · {h.company} <span className="muted">— {h.determination}{h.evidence ? ` (${h.evidence})` : ""}</span></p>)}</div>}
        </div>
      </aside>
    </>
  );
}
