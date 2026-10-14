"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { ask, paidFetch, notify } from "@/components/Confirm";
import { downloadReport } from "@/components/ReportDialog";
import { fmtDateTime } from "@/lib/dates";

// Find company: the one place to search. "Search Company" looks through what is already in the app (ranked, with filters
// and counts, and a PDF / Excel button per company). "Find New Company" researches companies that are not in the app yet,
// region by region, free (a scheduled Claude session) or paid (instant, PIN). Both read the same scoped data as the rest of the app.
type Mode = "search" | "new";
type RegionInfo = { key: string; name: string; status: string; revenue_min_usd_m: number; employees_min: number; listing: string; entity_level: string };
type Detail = { name: string; status?: string; why_icp?: string; revenue?: string; decided?: "added" | "ignored" };
type Job = { id: string; region: string; count: number | "max"; mode: string; company_name?: string; slug?: string; requested_by: string; requested_at: string; status: string; result?: string; details?: Detail[]; company_names?: string[] };
type Info = { regions: RegionInfo[]; jobs: Job[]; est: { update: number }; isSuper: boolean };
type Item = { id: string; slug: string; company_name: string; country: string; region: string; hq_city: string; industry: string; icp_status: string; revenue: string; revenue_note: string;
  employees: string; erp: string; platform: string; signal: string; listing: string; contacts: number; coupa_customer: boolean; matched: string[] };
type Facet = { value: string; count: number };
type Found = { total: number; items: Item[]; ids: string[]; understood: { label: string; without: string }[]; suggestions: { company_name: string; slug: string; region: string }[]; relaxed?: string; similar?: (Item & { why: string })[];
  facets: { region: Facet[]; status: Facet[]; listing: Facet[]; signal: Facet[]; platform: Facet[]; withContacts: number } };
type Sel = { region: string[]; status: string[]; listing: string[]; signal: string[]; platform: string[]; contacts: boolean };
const EMPTY_SEL: Sel = { region: [], status: [], listing: [], signal: [], platform: [], contacts: false };
const EXAMPLES = ["SAP verified KSA", "revenue > 1B", "coupa", "oracle listed", "icp = likely signal = strong", "dubai logistics", "has contacts verified"];
const ST_CLASS: Record<string, string> = { "ICP — Verified": "st-v", "ICP — Likely": "st-l", "ICP — Needs check": "st-l", "Not ICP": "st-n" };
const parseNames = (v: string) => [...new Set(v.split(/[,\n]/).map((x) => x.trim()).filter((x) => x.length >= 2))].slice(0, 30);
const STATUS_TXT: Record<string, string> = { active: "Active · daily run", paused: "Paused", next: "Next phase" };
const nextRun = () => { const n = new Date(), t = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), 2, 0, 0)); if (t <= n) t.setUTCDate(t.getUTCDate() + 1);
  return t.toLocaleString("en-US", { weekday: "short", hour: "2-digit", minute: "2-digit", hour12: true }); };

export default function FindCompany({ initialMode, initialQuery, initialRegion }: { initialMode: Mode; initialQuery: string; initialRegion: string }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [info, setInfo] = useState<Info | null>(null);
  // ── Search Company
  const [q, setQ] = useState(initialMode === "search" ? initialQuery : "");
  const [sel, setSel] = useState<Sel>(EMPTY_SEL);
  const [sort, setSort] = useState<"best" | "revenue" | "name">("best");
  const [limit, setLimit] = useState(25);
  const [found, setFound] = useState<Found | null>(null);
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  // ── Find New Company
  const [names, setNames] = useState(initialMode === "new" ? initialQuery : "");
  const [region, setRegion] = useState(initialRegion);
  const [website, setWebsite] = useState("");
  const [suggestN, setSuggestN] = useState("5");
  const [dupes, setDupes] = useState<{ input: string; possible?: boolean; match: { slug: string; company_name: string; region: string; icp_status: string } }[] | null>(null);
  const [pendingKind, setPendingKind] = useState<"free" | "paid" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: ReactNode } | null>(null);
  const [working, setWorking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // regions this user can use, each region's rules, and only their regions' jobs
  const loadInfo = useCallback(() => fetch("/api/engine?only=find").then((r) => (r.ok ? r.json() : null)).then((j: Info | null) => { if (j) setInfo(j); }).catch(() => {}), []);
  useEffect(() => { loadInfo(); }, [loadInfo]);
  const busyJobs = !!info?.jobs.some((j) => j.status === "queued" || j.status === "running");
  useEffect(() => { const t = setInterval(loadInfo, busyJobs ? 8000 : 30000); return () => clearInterval(t); }, [loadInfo, busyJobs]);
  useEffect(() => { if (info && !info.regions.some((r) => r.key === region)) setRegion(info.regions.find((r) => r.status === "active")?.key || info.regions[0]?.key || ""); }, [info, region]);
  useEffect(() => { try { setRecent(JSON.parse(localStorage.getItem("find:recent") || "[]")); } catch {} }, []);
  const remember = (v: string) => { const t = v.trim(); if (t.length < 2) return; const next = [t, ...recent.filter((x) => x !== t)].slice(0, 6);
    setRecent(next); try { localStorage.setItem("find:recent", JSON.stringify(next)); } catch {} };

  // Nothing is listed until the user picks a region, types a search or taps a filter. Until then only the counts are loaded.
  const scoped = q.trim().length > 0 || sel.region.length > 0 || sel.status.length + sel.listing.length + sel.signal.length + sel.platform.length > 0 || sel.contacts;
  const [open, setOpen] = useState<Record<string, boolean>>({ "ICP status": true });
  // search as you type (debounced), and again whenever a chip, the sort or the page size changes
  useEffect(() => {
    if (mode !== "search") return;
    const ac = new AbortController();
    const t = setTimeout(async () => {
      setBusy(true);
      const p = new URLSearchParams({ q, sort, limit: String(scoped ? limit : 0) });
      (["region", "status", "listing", "signal", "platform"] as const).forEach((k) => sel[k].length && p.set(k, sel[k].join("||")));
      if (sel.contacts) p.set("contacts", "1");
      try { const r = await fetch(`/api/find?${p}`, { signal: ac.signal }); if (r.ok) setFound(await r.json()); } catch {}
      if (!ac.signal.aborted) setBusy(false);
    }, q ? 280 : 0);
    return () => { clearTimeout(t); ac.abort(); };
  }, [mode, q, sel, sort, limit, scoped]);

  const toggle = (k: Exclude<keyof Sel, "contacts">, v: string) => { setLimit(25); setSel((s) => ({ ...s, [k]: s[k].includes(v) ? s[k].filter((x) => x !== v) : [...s[k], v] })); };
  const anyChip = sel.region.length + sel.status.length + sel.listing.length + sel.signal.length + sel.platform.length > 0 || sel.contacts;
  const chipGroup = (label: string, k: Exclude<keyof Sel, "contacts">, facet: Facet[] | undefined) => {
    const rows = (facet || []).filter((f) => f.count > 0 || sel[k].includes(f.value));
    if (!rows.length) return null;
    const picked = sel[k].length;
    return (
      <div className="find-facet">
        <button type="button" className="find-facet-h" aria-expanded={!!open[label]} onClick={() => setOpen((o) => ({ ...o, [label]: !o[label] }))}>
          <span>{label}{picked > 0 && <b className="find-picked">{picked}</b>}</span><span className="find-chev" aria-hidden="true">{open[label] ? "▾" : "▸"}</span>
        </button>
        {open[label] && <div className="find-facet-chips">{rows.map((f) => <button type="button" key={f.value} className="find-chip" aria-pressed={sel[k].includes(f.value)} onClick={() => toggle(k, f.value)}>
          {f.value.replace(/^ICP — /, "").replace(/ SIGNAL$/, "")} <em>{f.count}</em></button>)}</div>}
      </div>);
  };

  // ── Find New Company actions
  const list = parseNames(names);
  const regionInfo = info?.regions.find((r) => r.key === region);
  const per = info?.est.update ?? 0.55;
  async function queueFree(use: string[]) {
    if (!region || !use.length) return;
    setWorking(true);
    const body = use.length === 1 ? { action: "queue", region, count: 1, mode: "company", company_name: use[0], website: website.trim() }
      : { action: "queue", region, count: use.length, mode: "discover", company_names: use };
    const r = await fetch("/api/engine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setWorking(false);
    if (r.ok) { setMsg({ ok: true, text: `Searching ${use.length === 1 ? use[0] : `${use.length} companies`} in ${region} now, free. Usually a minute or two (the next daily run, ${nextRun()}, picks it up if that doesn't fire). Follow it under "Your searches" below.` }); setNames(""); setWebsite(""); loadInfo(); }
    else setMsg({ ok: false, text: j.error || "Could not start the search." });
  }
  async function runPaid(use: string[]) {
    if (!region || !use.length) return;
    if (!(await ask({ title: `Research ${use.length === 1 ? use[0] : `${use.length} companies`} now?`, tone: "cost", confirm: "Run now",
      points: [`Researches ${use.length === 1 ? "it" : "each one"} straight away (about 1–2 minutes) and adds ${use.length === 1 ? "it" : "them"} to ${region}.`, "Free alternative: Search free — done in a minute or two by a scheduled session."],
      cost: `≈ $${(use.length * per).toFixed(2)} (Quick research${use.length > 1 ? ` × ${use.length}` : ""})` }))) return;
    setWorking(true);
    let ok = 0;
    for (const name of use) {
      const r = await paidFetch("/api/research", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company: use.length === 1 && website.trim() ? `${name} (${website.trim()})` : name, country: region, depth: "quick" }) }, `Researching ${name}`);
      if (r.ok) ok++;
    }
    setWorking(false);
    setMsg(ok ? { ok: true, text: <>In progress: researching {ok === 1 ? use[0] : `${ok} companies`} (about 1–2 minutes each). <Link href="/research">Follow it in Data → Research Queue →</Link> When it finishes it appears in your {region} accounts.</> }
      : { ok: false, text: "Could not start the research." });
    if (ok) { setNames(""); setWebsite(""); }
  }
  // Both buttons first check the names against what the app already holds, so nothing is researched twice.
  async function start(kind: "free" | "paid") {
    if (!list.length) { setMsg({ ok: false, text: "Type at least one company name." }); return; }
    setMsg(null); setWorking(true);
    let hits: { input: string; possible?: boolean; match: { slug: string; company_name: string; region: string; icp_status: string } | null }[] = [];
    try { const r = await fetch(`/api/find?exists=${encodeURIComponent(list.join("||"))}`); if (r.ok) hits = (await r.json()).results || []; } catch {}
    setWorking(false);
    const have = hits.filter((h) => h.match) as { input: string; possible?: boolean; match: { slug: string; company_name: string; region: string; icp_status: string } }[];
    if (have.length) { setDupes(have); setPendingKind(kind); return; }
    kind === "free" ? queueFree(list) : runPaid(list);
  }
  const resume = (skipExisting: boolean) => {
    const skip = new Set((dupes || []).map((d) => d.input));
    const use = skipExisting ? list.filter((n) => !skip.has(n)) : list;
    const kind = pendingKind; setDupes(null); setPendingKind(null);
    if (!use.length) { setMsg({ ok: true, text: "Everything you typed is already in the app. Use Search Company to open it." }); return; }
    kind === "free" ? queueFree(use) : runPaid(use);
  };
  async function suggest() {
    if (!region) return;
    setWorking(true); setMsg(null);
    const r = await fetch("/api/engine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "queue", region, count: Number(suggestN), mode: "discover" }) });
    const j = await r.json().catch(() => ({}));
    setWorking(false);
    if (r.ok) { setMsg({ ok: true, text: `Looking for ${suggestN} new ${region} companies that fit the ICP, free. Usually a minute or two; results appear under "Your searches" below.` }); loadInfo(); }
    else setMsg({ ok: false, text: j.error || "Could not start the search." });
  }
  async function act(body: unknown, ok: string) {
    const r = await fetch("/api/engine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (r.ok) { notify(ok); loadInfo(); } else notify(j.error || "Something went wrong.", "error");
  }
  const jobs = (info?.jobs || []).filter((j) => j.region === region).slice(0, 8);

  const openAccount = (it: { slug: string; region: string }) => `/?open=${encodeURIComponent(it.slug)}&country=${encodeURIComponent(it.region)}`;
  const goNew = (name: string) => { setNames(name); setMode("new"); setMsg(null); setDupes(null);
    const pick = sel.region[0] || found?.facets.region[0]?.value; if (pick && info?.regions.some((r) => r.key === pick)) setRegion(pick); };

  const regionRows: { key: string; name: string; status: string }[] = info?.regions.length ? info.regions
    : (found?.facets.region || []).map((f) => ({ key: f.value, name: f.value, status: "active" }));
  const side = (
    <aside className="find-side" aria-label="Regions and filters">
      <h2>Region</h2>
      <div className="find-reglist" role={mode === "new" ? "tablist" : undefined}>
        {mode === "search" && (
          <button type="button" className="find-reg" aria-pressed={sel.region.length === 0} onClick={() => { setLimit(25); setSel((x) => ({ ...x, region: [] })); }}>
            <span>All regions</span>{found && <em>{found.facets.region.reduce((t, f) => t + f.count, 0)}</em>}
          </button>)}
        {regionRows.map((r) => {
          const n = found?.facets.region.find((f) => f.value === r.key)?.count;
          const on = mode === "search" ? sel.region.includes(r.key) : r.key === region;
          return (
            <button type="button" key={r.key} className={`find-reg${r.status !== "active" ? " dim" : ""}`} aria-pressed={on} role={mode === "new" ? "tab" : undefined} aria-selected={mode === "new" ? on : undefined}
              title={STATUS_TXT[r.status] || r.status}
              onClick={() => { if (mode === "search") toggle("region", r.key); else { setRegion(r.key); setMsg(null); setDupes(null); } }}>
              <span>{r.name}{r.status !== "active" && <i> · {r.status === "next" ? "next phase" : "paused"}</i>}</span>
              {mode === "search" && n !== undefined && <em>{n}</em>}
            </button>);
        })}
      </div>
      {mode === "new" && regionInfo && (
        <div className="find-rules">
          <b>What the engine looks for in {regionInfo.name}</b>
          <ul>
            <li>Revenue of ${regionInfo.revenue_min_usd_m >= 1000 ? `${regionInfo.revenue_min_usd_m / 1000}B` : `${regionInfo.revenue_min_usd_m}M`} or more</li>
            <li>{regionInfo.employees_min}+ staff</li>
            <li>{regionInfo.entity_level === "group_hq" ? "Group headquarters only" : regionInfo.entity_level === "any" ? "Any legal entity" : "Group HQ and major subsidiaries"}</li>
            <li>{regionInfo.listing === "listed_only" ? "Listed companies only" : regionInfo.listing === "private_only" ? "Private companies only" : "Listing not required"}</li>
          </ul>
          {regionInfo.status !== "active" && <p>This region is <b>{STATUS_TXT[regionInfo.status]?.toLowerCase()}</b>. Companies found are held until a Super Admin activates it in Setup → Define ICP.</p>}
        </div>)}
      {mode === "search" && found && (
        <div className="find-facets">
          {chipGroup("ICP status", "status", found.facets.status)}
          {chipGroup("Listing", "listing", found.facets.listing)}
          {chipGroup("S2P signal", "signal", found.facets.signal)}
          {chipGroup("Platform", "platform", found.facets.platform)}
          <div className="find-facet">
            <button type="button" className="find-facet-h" aria-expanded={!!open.People} onClick={() => setOpen((o) => ({ ...o, People: !o.People }))}>
              <span>People{sel.contacts && <b className="find-picked">1</b>}</span><span className="find-chev" aria-hidden="true">{open.People ? "▾" : "▸"}</span></button>
            {open.People && <div className="find-facet-chips"><button type="button" className="find-chip" aria-pressed={sel.contacts} onClick={() => { setLimit(25); setSel((x) => ({ ...x, contacts: !x.contacts })); }}>Has contacts <em>{found.facets.withContacts}</em></button></div>}
          </div>
          {anyChip && <button type="button" className="btn tiny ghost find-clearall" onClick={() => setSel(EMPTY_SEL)}>Clear all filters</button>}
        </div>)}
    </aside>
  );

  return (
    <div className="find">
      <div className="find-head">
        <h1>Find a company</h1>
        <p>The one place to search. Look through what is already in your data, or research a company that is not in the app yet.</p>
        <div className="find-modes" role="tablist" aria-label="What do you want to do?">
          <button type="button" role="tab" aria-selected={mode === "new"} onClick={() => { setMode("new"); setMsg(null); }}><b>Find New Company</b><small>Not in the app yet. Research it and add it to a region.</small></button>
          <button type="button" role="tab" aria-selected={mode === "search"} onClick={() => { setMode("search"); setTimeout(() => inputRef.current?.focus(), 0); }}><b>Search Company</b><small>Already in your data. Filter, open and download reports.</small></button>
        </div>
      </div>

      <div className="find-layout">
      {side}
      <div className="find-mid">
      {mode === "search" && (
        <section className="find-pane" aria-label="Search companies already in the app">
          <div className="find-box">
            <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M11 11l3.3 3.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            <input ref={inputRef} autoFocus type="search" value={q} onChange={(e) => { setQ(e.target.value); setLimit(25); }} onKeyDown={(e) => e.key === "Enter" && remember(q)}
              placeholder="Company, city, industry, ERP… or try: SAP verified KSA, revenue > 1B" aria-label="Search companies already in the app" />
            {busy && <span className="find-spin" aria-hidden="true" />}
            {q && <button type="button" className="find-clear" onClick={() => setQ("")} aria-label="Clear search">×</button>}
          </div>
          {!q && (
            <div className="find-hints">
              <span>Try</span>{EXAMPLES.map((e) => <button type="button" key={e} onClick={() => { setQ(e); remember(e); }}>{e}</button>)}
              {recent.length > 0 && <><span className="find-hints-sep">Recent</span>{recent.map((e) => <button type="button" key={e} className="recent" onClick={() => setQ(e)}>{e}</button>)}</>}
            </div>
          )}
          {!scoped && (
            <div className="find-prompt">
              <h3>Pick a region to start</h3>
              <p>Choose a region in the panel on the left, then search. Or just type a company, a city, an ERP or something like <i>revenue &gt; 1B</i>.</p>
            </div>)}
          {scoped && (<>
          {found?.relaxed && <p className="find-relaxed">{found.relaxed}</p>}
          {found && found.understood.length > 0 && (
            <p className="find-understood">Understood as {found.understood.map((u) => <span key={u.label}>{u.label}<button type="button" aria-label={`Remove ${u.label}`} onClick={() => setQ(u.without)}>×</button></span>)}</p>)}
          {found && (
            <div className="find-bar">
              <span><b>{found.total.toLocaleString()}</b> {found.total === 1 ? "company" : "companies"}{found.total > found.items.length ? `, showing ${found.items.length}` : ""}</span>
              <span className="find-bar-r">
                {anyChip && <button type="button" className="btn tiny ghost" onClick={() => setSel(EMPTY_SEL)}>Clear filters</button>}
                <label>Sort <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}><option value="best">Best match</option><option value="revenue">Revenue, high to low</option><option value="name">Name A–Z</option></select></label>
                {found.total > 0 && <button type="button" className="btn tiny" onClick={() => downloadReport({ companyIds: found.ids.slice(0, 10), region: "All", title: "Search results" }, "pdf")}>PDF, top {Math.min(10, found.ids.length)}</button>}
                {found.total > 0 && <button type="button" className="btn tiny" onClick={() => downloadReport({ companyIds: found.ids, region: "All", emailOnly: true, rank: "revenue" }, "xlsx")}>Excel contact list{found.ids.length < found.total ? ` (first ${found.ids.length})` : ""}</button>}
              </span>
            </div>)}
          {found && found.items.length > 0 && (
            <ul className="find-list">
              {found.items.map((it) => (
                <li key={it.id} className="find-row">
                  <div className="find-main">
                    <div className="find-name">
                      <Link href={openAccount(it)}>{it.company_name}</Link>
                      <span className={`status-plain ${ST_CLASS[it.icp_status] || "st-u"}`}>{it.icp_status}</span>
                      {it.coupa_customer && <span className="find-tag">Coupa customer</span>}
                    </div>
                    <div className="find-meta">{[it.region, it.hq_city, it.industry, it.listing !== "Unknown" ? it.listing : ""].filter(Boolean).join(" · ")}</div>
                    <div className="find-facts">
                      <span><i>Revenue</i>{it.revenue ? <>{it.revenue} <small>({it.revenue_note})</small></> : "not on file"}</span>
                      {it.employees && <span><i>Staff</i>{it.employees}</span>}
                      {it.erp && <span><i>ERP</i>{it.erp}</span>}
                      <span><i>S2P</i>{it.platform}{it.signal ? ` · ${it.signal.toLowerCase()}` : ""}</span>
                      <span><i>People</i>{it.contacts || "none on file"}</span>
                    </div>
                    {it.matched.length > 0 && <div className="find-why">Matched on {it.matched.join(", ")}</div>}
                  </div>
                  <div className="find-acts">
                    <Link className="btn tiny" href={openAccount(it)}>Open</Link>
                    <button type="button" className="btn tiny" onClick={() => downloadReport({ companyId: it.id }, "pdf")}>PDF</button>
                    {it.contacts > 0 && <button type="button" className="btn tiny" onClick={() => downloadReport({ companyIds: [it.id], region: "All", emailOnly: true }, "xlsx")}>Excel</button>}
                  </div>
                </li>))}
            </ul>)}
          {found && found.total > found.items.length && (
            <p className="find-more"><button type="button" className="btn" onClick={() => setLimit((l) => Math.min(l + 25, 100))} disabled={limit >= 100}>Show more</button>
              {limit >= 100 && <span className="note"> Narrow the search with the filters above to see the rest.</span>}</p>)}
          {found && found.total === 0 && (
            <div className="find-empty">
              <h3>{q.trim() ? <>&quot;{q.trim()}&quot; isn&apos;t in your data yet</> : "Nothing matches these filters"}</h3>
              {found.similar && found.similar.length > 0 && (
                <div className="find-options">
                  <p>Closest companies in your data. Pick one:</p>
                  {found.similar.map((o) => (
                    <button type="button" key={o.id} className="find-option" onClick={() => setQ(o.company_name)}>
                      <b>{o.company_name}</b>
                      <span>{[o.region, o.hq_city, o.icp_status.replace("ICP — ", "")].filter(Boolean).join(" · ")}</span>
                      <small>{o.why}</small>
                    </button>))}
                </div>)}
              {q.trim() && !found.understood.length && <button type="button" className="btn primary" onClick={() => goNew(q.trim())}>Find &quot;{q.trim()}&quot; as a new company →</button>}
              {(anyChip || found.understood.length > 0) && <p className="note">Nothing matches all of these together. Tap × on a chip above to drop one. Everything you typed or tapped is combined with AND.</p>}
            </div>)}
          {q.trim() && found && found.total > 0 && found.total <= 3 && !found.understood.length && (
            <p className="find-newhint">Not the company you meant? <button type="button" className="link" onClick={() => goNew(q.trim())}>Find &quot;{q.trim()}&quot; as a new company →</button></p>)}
          </>)}
        </section>
      )}

      {mode === "new" && (
        <section className="find-pane" aria-label="Find a company that is not in the app yet">
          {!info ? <p className="note">Loading your regions…</p> : info.regions.length === 0 ? (
            <p className="note">No region is assigned to you yet. Ask a Super Admin to add one in Setup → Team.</p>
          ) : (<>
            <div className="find-box big">
              <textarea rows={Math.min(Math.max(list.length, 2), 6)} value={names} onChange={(e) => { setNames(e.target.value); setDupes(null); }} autoFocus
                placeholder={"One company, or several. One per line or separated by commas.\ne.g. Almarai, Gulf Steel Works, Emirates Bio Farm"} aria-label="Company names" />
            </div>
            {list.length > 0 && (
              <div className="find-names">{list.map((n) => <span key={n}>{n}<button type="button" aria-label={`Remove ${n}`} onClick={() => setNames(list.filter((x) => x !== n).join("\n"))}>×</button></span>)}
                <em>{list.length} {list.length === 1 ? "company" : "companies"} · {region}</em></div>)}
            {list.length === 1 && <label className="find-site">Website (optional, helps find the right company)<input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="e.g. almarai.com" /></label>}

            {dupes && (
              <div className="find-dupes" role="alert">
                <b>{dupes.length === 1 ? "This company is" : `${dupes.length} of these are`} already in the app</b>
                <ul>{dupes.map((d) => <li key={d.input}>{d.input} <small>{d.possible ? "looks like" : "is"}</small> <Link href={openAccount({ slug: d.match.slug, region: d.match.region })}>{d.match.company_name}</Link> <small>({d.match.region} · {d.match.icp_status})</small></li>)}</ul>
                <span>
                  {list.length > dupes.length && <button type="button" className="btn primary" onClick={() => resume(true)}>Skip these, continue with the other {list.length - dupes.length}</button>}
                  <button type="button" className="btn" onClick={() => resume(false)}>Search anyway</button>
                  <button type="button" className="btn ghost" onClick={() => { setDupes(null); setPendingKind(null); }}>Cancel</button>
                </span>
              </div>)}

            <div className="find-cards">
              <div className="find-card">
                <h3>Search free</h3>
                <p>A scheduled Claude session checks official sources and adds the company. Included in your Claude plan, no API cost. Usually a minute or two.</p>
                <button type="button" className="btn primary" disabled={working || !list.length} onClick={() => start("free")}>{working ? <span className="btn-spin">Working…</span> : `Search free${list.length > 1 ? ` (${list.length})` : ""}`}</button>
              </div>
              <div className="find-card paid">
                <h3>Research now</h3>
                <p>Instant, full profile: revenue, ERP and S2P signals. Uses the Anthropic API and asks for your PIN. <b>≈ ${Math.max(list.length, 1) * per < 10 ? (Math.max(list.length, 1) * per).toFixed(2) : Math.round(list.length * per)}</b>{list.length > 1 ? ` for ${list.length} companies` : " per company"}.</p>
                <button type="button" className="btn" disabled={working || !list.length} onClick={() => start("paid")}>Research now</button>
              </div>
            </div>
            {msg && <p className={`find-msg ${msg.ok ? "ok" : "err"}`} role="status">{msg.text}</p>}

            <div className="find-suggest">
              <span>No name in mind? Let the engine suggest companies that fit {regionInfo?.name || "the region"}&apos;s ICP:</span>
              <select value={suggestN} onChange={(e) => setSuggestN(e.target.value)} aria-label="How many">{["5", "10", "30"].map((n) => <option key={n} value={n}>{n} companies</option>)}</select>
              <button type="button" className="btn" disabled={working} onClick={suggest}>Suggest new companies (free)</button>
            </div>

            <div className="find-jobs">
              <h3>Your searches in {regionInfo?.name || region}</h3>
              {jobs.length === 0 ? <p className="note">Nothing yet. Searches you start here show up with their progress.</p> : (
                <div className="tablewrap"><table className="jobs-table">
                  <thead><tr><th>Company</th><th>Status</th><th>Requested</th><th>Result</th><th></th></tr></thead>
                  <tbody>{jobs.flatMap((j) => {
                    const st = <span className={`job-st ${j.status}`}>{j.status === "queued" ? "Waiting" : j.status === "running" ? "In progress" : j.status === "done" ? "Completed" : j.status === "error" ? "Failed" : j.status === "cancelled" ? "Cancelled" : j.status}</span>;
                    const when = <>{fmtDateTime(j.requested_at)}<div className="muted">{j.requested_by}</div></>;
                    if (j.mode === "discover" && j.details && j.details.length > 0) {
                      const pending = j.details.filter((d) => !d.decided).length;
                      return [...j.details.map((d, i) => (
                        <tr key={`${j.id}-${i}`} className={i === 0 ? "run-group-top" : undefined}>
                          <td className="wrap">{d.name}</td>
                          {i === 0 && <td rowSpan={j.details!.length}>{st}</td>}
                          {i === 0 && <td className="muted" rowSpan={j.details!.length}>{when}</td>}
                          <td className="wrap">{d.status}{d.why_icp && <div className="muted">{d.why_icp}</div>}</td>
                          <td className="wrap">{!d.decided ? <>
                            <button type="button" className="btn-check ok" onClick={() => act({ action: "add_found", job_id: j.id, name: d.name }, `${d.name} added.`)}><span className="btn-check-box">✓</span> Add</button>
                            <button type="button" className="btn-check no" onClick={() => act({ action: "ignore_found", job_id: j.id, name: d.name }, `${d.name} ignored. It resurfaces in 180 days if it grows.`)}><span className="btn-check-box">✓</span> Ignore</button>
                          </> : <span className="muted">{d.decided === "added" ? "Added" : "Ignored"}</span>}</td>
                        </tr>)),
                        pending > 1 && <tr key={`${j.id}-all`}><td colSpan={5} className="jobs-addall"><button type="button" className="btn tiny" onClick={() => act({ action: "add_all_found", job_id: j.id }, `${pending} companies added.`)}>Add all {pending} to the app</button></td></tr>];
                    }
                    const label = j.mode === "company" ? j.company_name || "One company" : j.company_names?.length ? `${j.company_names.length} companies` : `Suggest ${j.count} new`;
                    const parsed = String(j.result || "").match(/^(.+)\(([A-Za-z ]+)\):\s*(.+)$/);
                    return [<tr key={j.id}>
                      <td className="wrap">{parsed ? parsed[1].trim() : label}</td><td>{st}{j.status === "queued" && <div className="muted">usually a minute or two</div>}</td><td className="muted">{when}</td>
                      <td className="wrap">{j.result}{j.status === "done" && j.slug && <div><Link className="job-link" href={openAccount({ slug: j.slug, region: parsed ? parsed[2].trim() : j.region })}>View account →</Link></div>}</td>
                      <td>{j.status === "queued" && <button type="button" className="btn tiny ghost" onClick={() => act({ action: "cancel", id: j.id }, "Search cancelled.")}>Cancel</button>}</td></tr>];
                  })}</tbody>
                </table></div>)}
            </div>
          </>)}
        </section>
      )}
      </div>
      </div>
    </div>
  );
}
