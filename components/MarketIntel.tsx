"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ask, notify } from "@/components/Confirm";
import FindContactsButton from "@/components/FindContactsButton";
import { ScanGauge, DoneTick } from "@/components/ScanGauge";
import { expectedSecs } from "@/lib/scanTime";
import { logActivity } from "@/lib/activityClient";
import { PARTNERS_TIP, CUSTOMERS_TIP, regionOfCountry, type MContact, type PCustomer, type Partner, type Vendor } from "@/lib/market";

type Cust = PCustomer & { in_app: boolean; people_on_file: number };
type Job = { mode: string; started_at?: string; phase?: string; seamless?: boolean; vendor?: string; customer?: string; partner?: string; slug?: string; contacts_only?: boolean; region: string; status: string; requested_at: string };
type Data = { vendors: Vendor[]; custom_vendors: string[]; is_super: boolean; defaults: string[]; regions: string[]; partners: Partner[]; customers: Cust[]; scans: Record<string, string>; jobs: Job[] };
// One place format for every partner: Region-City, for example UAE-Dubai. A city that is just the country name becomes the capital; no city shows as Unknown until a scan finds it.
const CAPITAL: Record<string, string> = { Kuwait: "Kuwait City", Qatar: "Doha", Bahrain: "Manama", Oman: "Muscat" };
const place = (region: string, city?: string, hqCountry?: string, branch?: boolean, coverageOnly?: boolean) => {
  if (coverageOnly && !hqCountry && !city) return `Serves ${region} · base not stated`;
  if (branch && !hqCountry) return `Branch in ${region}`;
  const rc = regionOfCountry(hqCountry);
  if (hqCountry && rc && rc !== region) return `${branch ? `Branch in ${region} · HQ` : `Serves ${region} · based`} ${[(city || "").split(/[,(]/)[0].trim(), hqCountry].filter(Boolean).join(", ")}`; // headquartered elsewhere: say so
  let c = (city || "").split(/[,(]/)[0].trim();
  if (c.toLowerCase() === region.toLowerCase()) c = CAPITAL[region] || "";
  return `${region}-${c || "Unknown"}`;
};
const webUrl = (w: string) => (/^https?:\/\//.test(w) ? w : `https://${w}`);
const ago = (iso?: string) => { if (!iso) return "never"; const h = Math.round((Date.now() - new Date(iso).getTime()) / 36e5); return h < 1 ? "just now" : h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`; };
const csv = (rows: string[][]) => rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");

function Tip({ text }: { text: string }) {
  return <span className="find-i" tabIndex={0} role="note" aria-label={text}>i<span className="find-i-pop">{text}</span></span>;
}
function Who({ c }: { c: MContact }) {
  return (
    <div className="mkt-contact"><b>{c.name}</b>{c.title && <span> · {c.title}</span>}
      <div>{c.email && <a href={`mailto:${c.email}`}>{c.email}</a>}{c.phone && <span> · {c.phone}</span>}{c.linkedin_url && <> · <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer">LinkedIn</a></>}
        <> · <a href={c.source_url} target="_blank" rel="noopener noreferrer">source</a></></div></div>);
}

export default function MarketIntel({ embedded = false }: { embedded?: boolean }) {
  const [data, setData] = useState<Data | null>(null);
  const [vendor, setVendor] = useState<Vendor>("SAP");
  const [adding, setAdding] = useState(false);
  const [newVendor, setNewVendor] = useState("");
  const [addingP, setAddingP] = useState(false);
  const [pf, setPf] = useState({ name: "", website: "", region: "" });
  const [regions, setRegions] = useState<string[] | null>(null); // null = not chosen yet: UAE is ticked by default
  const [q, setQ] = useState("");
  const [view, setView] = useState<"partners" | "customers">("partners");
  const [notInApp, setNotInApp] = useState(false);
  const [showPending, setShowPending] = useState(false); // partners whose base or office in the region is not confirmed yet
  const [withContacts, setWithContacts] = useState(false);
  const [openP, setOpenP] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  // A green tick that stays for 12 seconds when a search finishes
  const [flash, setFlash] = useState<Record<string, string>>({});
  const showFlash = (key: string, text: string) => { setFlash((f) => ({ ...f, [key]: text })); setTimeout(() => setFlash((f) => { const n = { ...f }; delete n[key]; return n; }), 12000); };

  const load = useCallback(() => fetch("/api/market", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j: Data | null) => { if (j) setData(j); }).catch(() => {}), []);
  useEffect(() => { load(); const t = setInterval(load, 25000); return () => clearInterval(t); }, [load]);

  const regionList = data?.regions || [];
  const active = regions ?? (regionList.includes("UAE") ? ["UAE"] : regionList.slice(0, 1));
  const needle = q.trim().toLowerCase();
  const partners = useMemo(() => (data?.partners || []).filter((p) => p.vendor === vendor && active.includes(p.region) && (showPending || !p.presence_pending) && (!needle || `${p.name} ${p.services} ${p.tier}`.toLowerCase().includes(needle))), [data, vendor, active, needle]);
  const custs = useMemo(() => (data?.customers || []).filter((c) => c.vendor === vendor && active.includes(c.region) && (!notInApp || !c.in_app) && (!withContacts || c.contacts.length > 0)
    && (!needle || `${c.customer} ${c.partner} ${c.project}`.toLowerCase().includes(needle))), [data, vendor, active, notInApp, withContacts, needle]);
  const custOf = (p: Partner) => custs.filter((c) => c.partner_id === p.id);
  const countP = (v: Vendor) => (data?.partners || []).filter((p) => p.vendor === v && active.includes(p.region) && (showPending || !p.presence_pending)).length;
  const pendingN = (data?.partners || []).filter((p) => p.vendor === vendor && active.includes(p.region) && p.presence_pending).length;
  const allPending = (data?.jobs || []).filter((j) => j.status === "queued" || j.status === "running");
  const pending = allPending.filter((j) => j.mode === "market" && !j.customer && !j.partner && !j.contacts_only); // vendor scans: shown on the vendor tile
  const scanningRegions = (v: string) => [...new Set(pending.filter((j) => j.vendor === v || j.vendor === "all" || !j.vendor).map((j) => j.region))];
  const jobOfVendor = (v: string) => { const js = pending.filter((j) => j.vendor === v || j.vendor === "all" || !j.vendor); return js.find((j) => j.status === "running") || js[0]; };
  const wasScanning = useRef<Record<string, boolean>>({});
  useEffect(() => {
    const now: Record<string, boolean> = {};
    for (const v of data?.vendors || []) if (scanningRegions(v).length) now[v] = true;
    for (const v of Object.keys(wasScanning.current)) if (!now[v]) showFlash(`v:${v}`, "Scan finished");
    wasScanning.current = now;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
  // A contact search shows on the customer's own row (a flashing orange dot), not in the bar
  const jobFor = (c: Cust) => allPending.find((j) => (j.mode === "market" && j.customer === c.customer) || (j.mode === "contacts" && !!j.slug && j.slug === c.slug)
    || (j.mode === "market" && j.contacts_only && j.vendor === c.vendor && j.region === c.region && c.contacts.length === 0));
  const searching = (c: Cust) => !!jobFor(c);
  const wasSearching = useRef<Record<string, string>>({});
  useEffect(() => {
    const now: Record<string, string> = {};
    for (const c of data?.customers || []) if (searching(c)) now[c.id] = c.customer;
    for (const [id, name] of Object.entries(wasSearching.current)) if (!(id in now)) { const c = data?.customers.find((x) => x.id === id); showFlash(`c:${id}`, c && (c.contacts.length || c.people_on_file) ? "Done" : "Done · none found"); void name; }
    wasSearching.current = now;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const addVendor = async () => {
    const r = await fetch("/api/market", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "add_vendor", name: newVendor }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { notify(j.error || "Could not add the vendor.", "error"); return; }
    const name = newVendor.trim().replace(/\s+/g, " ");
    setAdding(false); setNewVendor(""); await load(); setVendor(name);
    notify(`${name} added. Use Scan now to find its partners and customers.`, "ok");
  };
  const removeVendor = async (v: string) => {
    if (!(await ask({ title: `Remove ${v}?`, body: "It disappears from this list. Partners and customers already found stay saved and come back if you add the vendor again.", confirm: "Remove", tone: "danger" }))) return;
    const r = await fetch("/api/market", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "remove_vendor", name: v }) });
    if (r.ok) { if (vendor === v) setVendor("SAP"); load(); } else notify("Could not remove it.", "error");
  };
  const findFor = async (c: Cust) => {
    setBusy(`c|${c.id}`); logActivity("contacts", `${c.customer} (${c.partner})`);
    const r = await fetch("/api/engine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "queue", region: c.region, count: 1, mode: "market", vendor: c.vendor, customer: c.customer, partner: c.partner }) });
    const j = await r.json().catch(() => ({}));
    setBusy("");
    if (r.ok || r.status === 409) load(); else notify(j.error || "Could not start the search.", "error");
  };
  const stopScans = async () => {
    if (!(await ask({ title: "Stop scanning?", body: "Waiting scans are removed and running ones are marked stopped. A scan that is already mid-way in the cloud may finish the page it is on, but its job is closed. Partners and customers already found stay saved.", confirm: "Stop scanning", tone: "danger" }))) return;
    setBusy("stop");
    const r = await fetch("/api/engine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "stop_scans", mode: "market" }) });
    const j = await r.json().catch(() => ({}));
    setBusy("");
    if (r.ok) { notify(`Stopped: ${j.removed || 0} waiting scan${j.removed === 1 ? "" : "s"} removed, ${j.stopped || 0} running marked stopped.`, "ok"); load(); } else notify(j.error || "Could not stop the scans.", "error");
  };
  const addPartner = async () => {
    const region = pf.region || active[0] || "";
    const r = await fetch("/api/market", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "add_partner", vendor, region, name: pf.name, website: pf.website }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { notify(j.error || "Could not add the partner.", "error"); return; }
    logActivity("scan", `Added partner ${pf.name} (${vendor} · ${region})`);
    setAddingP(false); setPf({ name: "", website: "", region: "" }); await load();
    if (!active.includes(region)) setRegions([...active, region]);
    notify(`${pf.name} added to ${vendor} · ${region}. Click Find more customers on its card to search its customers.`, "ok");
  };
  const moreFor = async (p: Partner) => {
    setBusy(`p|${p.id}`); logActivity("scan", `More customers: ${p.name}`);
    const r = await fetch("/api/engine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "queue", region: p.region, count: 1, mode: "market", vendor: p.vendor, partner: p.name }) });
    const j = await r.json().catch(() => ({}));
    setBusy("");
    if (r.ok || r.status === 409) load(); else notify(j.error || "Could not start the search.", "error");
  };
  const partnerJob = (p: Partner) => allPending.find((j) => j.mode === "market" && j.partner === p.name && !j.customer && j.region === p.region);
  const wasPartner = useRef<Record<string, boolean>>({});
  useEffect(() => {
    const now: Record<string, boolean> = {};
    for (const p of data?.partners || []) if (partnerJob(p)) now[p.id] = true;
    for (const id of Object.keys(wasPartner.current)) if (!now[id]) showFlash(`p:${id}`, "Customers updated");
    wasPartner.current = now;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
  const findAll = async () => {
    for (const r of active) {
      setBusy(`ca|${r}`);
      const res = await fetch("/api/engine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "queue", region: r, count: 1, mode: "market", vendor, contacts_only: true }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 409) notify(j.error || "Could not start the search.", "error");
    }
    setBusy(""); load();
  };
  const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return "source"; } };
  // One table for every partner's customers: Customer | Project (two lines) | In database? | Contact | Find contacts (only when there is nobody yet) | Source (the website)
  const custTable = (cs: Cust[]) => (
    <div className="tablewrap"><table className="mkt-table">
      <colgroup><col style={{ width: "17%" }} /><col style={{ width: "27%" }} /><col style={{ width: "13%" }} /><col style={{ width: "20%" }} /><col style={{ width: "11%" }} /><col style={{ width: "12%" }} /></colgroup>
      <thead><tr><th>Customer</th><th>Project</th><th>In database?</th><th>Contact</th><th>Find contacts</th><th>Source</th></tr></thead>
      <tbody>{cs.map((c) => {
        const noOne = c.contacts.length === 0 && !(c.in_app && c.people_on_file > 0);
        return (
          <tr key={c.id}>
            <td>{c.customer_website ? <a className="mkt-site" href={webUrl(c.customer_website)} target="_blank" rel="noopener noreferrer" title={`Open ${c.customer_website.replace(/^https?:\/\//, "")} in a new tab`}><b>{c.customer}</b><i aria-hidden="true">↗</i></a> : <b>{c.customer}</b>}<div className="muted">{c.region}</div></td>
            <td><div className="clamp2" title={c.project}>{c.project || <span className="muted">—</span>}</div></td>
            <td>{c.in_app ? <Link className="mkt-in" href={`/?open=${encodeURIComponent(c.slug)}&country=${encodeURIComponent(c.region)}`}>In database</Link>
              : <><span className="mkt-add">Not in database</span><div><Link className="mkt-addlink" href={addLink(c)}>+ Add</Link></div></>}</td>
            <td>{c.contacts.length > 0 ? c.contacts.map((k, i) => <Who key={i} c={k} />)
              : c.in_app && c.people_on_file > 0 ? <span className="muted">{c.people_on_file} people on file · <Link href={`/?open=${encodeURIComponent(c.slug)}&country=${encodeURIComponent(c.region)}`}>see account</Link></span>
              : <span className="muted">None yet</span>}</td>
            <td>{(() => { const j = jobFor(c); return j ? <ScanGauge compact label="Searching" requestedAt={j.requested_at} startedAt={j.started_at} expectedSecs={expectedSecs(j)} /> : flash[`c:${c.id}`] ? <DoneTick compact text={flash[`c:${c.id}`]} /> : null; })()}
              {searching(c) || flash[`c:${c.id}`] ? null
              : noOne ? (c.in_app ? <FindContactsButton slug={c.slug} region={c.region} company={c.customer} quiet onQueued={load} />
              : <button type="button" className="btn tiny nowrap" disabled={busy === `c|${c.id}`} onClick={() => findFor(c)} title="Free: searches public web pages for named people at this customer">{busy === `c|${c.id}` ? "Queuing…" : "Find contacts"}</button>) : <span className="muted">—</span>}</td>
            <td><a href={c.source_url} target="_blank" rel="noopener noreferrer" title={c.source_url}>{host(c.source_url)}</a></td>
          </tr>);
      })}</tbody></table></div>
  );
  const scan = async (region: string, v: string) => {
    setBusy(`${v}|${region}`); logActivity("scan", `Market intelligence: ${v} · ${region}`);
    const r = await fetch("/api/engine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "queue", region, count: 1, mode: "market", vendor: v }) });
    const j = await r.json().catch(() => ({}));
    setBusy("");
    if (r.ok) { notify(`${v === "all" ? "Market" : v} scan for ${region} queued. Results appear here when it finishes.`, "ok"); load(); }
    else notify(j.error || "Could not start the scan.", r.status === 409 ? "ok" : "error");
  };
  // one after another: each queue call rewrites the shared job list, so parallel calls could overwrite each other
  const scanAll = async (pairs: [string, string][]) => { for (const [r, v] of pairs) await scan(r, v); };
  // Scan Partners / Scan Customers (header buttons): the ticked regions and either this vendor or every vendor. One job per vendor and region for partners; for customers
  // one job per batch of 8 partners whose customers were never searched (or not in 45 days), at most 6 batches per vendor and region per click.
  const [allVendors, setAllVendors] = useState(false);
  const due = (v: string, r: string) => (data?.partners || []).filter((p) => p.vendor === v && p.region === r && (!p.customers_scanned_at || Date.now() - new Date(p.customers_scanned_at).getTime() > 45 * 864e5)).length;
  const scanPhase = async (phase: "partners" | "customers") => {
    const vs = allVendors ? data?.vendors || [] : [vendor];
    const jobs: [string, string][] = active.flatMap((r) => vs.flatMap((v) => phase === "partners" ? [[r, v] as [string, string]] : Array.from({ length: Math.min(6, Math.ceil(due(v, r) / 8)) }, () => [r, v] as [string, string])));
    if (!jobs.length) { notify(phase === "customers" ? "Every partner shown already has its customers searched. Use Scan Partners to find more partners first." : "Tick a region first.", "ok"); return; }
    if (!(await ask({ title: phase === "partners" ? "Scan partners?" : "Scan customers?",
      body: phase === "partners" ? `This queues ${jobs.length} free scan${jobs.length === 1 ? "" : "s"} that find ${allVendors ? "every vendor's" : `${vendor}'s`} partners in ${active.join(", ")}. Customers are not searched in this step.`
        : `This queues ${jobs.length} free scan${jobs.length === 1 ? "" : "s"}. Each searches the published customers of up to 8 partners (${allVendors ? "all vendors" : vendor}, ${active.join(", ")}) that have not been searched yet. Click again for the next batch.`,
      confirm: "Queue them" }))) return;
    setBusy(`phase|${phase}`); logActivity("scan", `Market intelligence: ${phase}, ${allVendors ? "all vendors" : vendor}, ${active.join(", ")}`);
    let ok = 0;
    for (const [r, v] of jobs) { const res = await fetch("/api/engine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "queue", region: r, count: 1, mode: "market", vendor: v, phase }) }); if (res.ok || res.status === 409) ok++; }
    setBusy(""); notify(`${ok} scan${ok === 1 ? "" : "s"} queued. The vendor tiles flash while they run.`, "ok"); load();
  };
  useEffect(() => {
    if (!embedded) return;
    const on = (e: Event) => { const d = (e as CustomEvent<string>).detail; if (d === "market-partners") scanPhase("partners"); else if (d === "market-customers") scanPhase("customers"); };
    window.addEventListener("appwin-scan", on);
    return () => window.removeEventListener("appwin-scan", on);
  });
  const download = () => {
    const rows = [["Vendor", "Region", "Partner", "Customer", "Project", "Customer in your app database", "Contact", "Title", "Email", "Phone", "LinkedIn", "Source"]];
    for (const c of custs) { if (c.contacts.length) for (const k of c.contacts) rows.push([c.vendor, c.region, c.partner, c.customer, c.project, c.in_app ? "Yes" : "No", k.name, k.title, k.email, k.phone, k.linkedin_url, c.source_url]);
      else rows.push([c.vendor, c.region, c.partner, c.customer, c.project, c.in_app ? "Yes" : "No", "", "", "", "", "", c.source_url]); }
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + csv(rows)], { type: "text/csv" })); a.download = `market-intelligence-${vendor}.csv`; a.click();
  };
  const addLink = (c: Cust) => `/find?mode=new&company=${encodeURIComponent(c.customer)}&region=${encodeURIComponent(c.region)}`;

  return (
    <div className="mkt">
      <section className="hero mkt-hero"><h1>Market intelligence</h1><p>Who implements SAP, Coupa, Oracle, Microsoft, Boomi, MuleSoft, Ivalua, GEP, Jaggaer and any vendor you add, in your regions, and the customers they publish. Every row links to its source.</p></section>
      {allPending.length > 0 && (
        <div className="mkt-stopbar" role="status"><span className="fcj-dot" aria-hidden="true" /><span>{allPending.length} scan{allPending.length === 1 ? "" : "s"} running or waiting</span>
          <button type="button" className="btn tiny danger" disabled={busy === "stop"} onClick={stopScans}>■ Stop scanning</button></div>)}
      <div className="sig-lanes" role="group" aria-label="Vendor">
        {(data?.vendors || ["SAP", "Coupa", "Oracle", "Microsoft"]).map((v, i) => {
          const custom = !!data?.custom_vendors?.includes(v);
          return (
            <span key={v} className="vendor-tile">
              <button type="button" className={`sig-lane ${["c1", "c2", "c6", "c7", "c3", "c4", "c5", "c8"][i % 8]}`} aria-pressed={vendor === v} onClick={() => { setVendor(v); setOpenP(null); }}><span className="tile-top"><b>{countP(v)}</b>{(() => { const j = jobOfVendor(v); const n = pending.filter((x) => x.vendor === v || x.vendor === "all" || !x.vendor).length; const r = scanningRegions(v);
                  return j ? <ScanGauge tile label={`Scanning ${r.join(", ")}`} requestedAt={j.requested_at} startedAt={j.started_at} expectedSecs={expectedSecs(j)} extra={n > 1 ? ` · ${n - 1} more waiting` : ""} />
                    : flash[`v:${v}`] ? <DoneTick tile text="Done" /> : null; })()}</span>{(() => { const j = jobOfVendor(v); return <span className="tile-lbl"><span>{v} partners</span>{j && <em>{j.started_at ? `usually about ${Math.max(1, Math.round(expectedSecs(j) / 60))} min` : `waiting for a session, then about ${Math.max(1, Math.round(expectedSecs(j) / 60))} min`}</em>}</span>; })()}</button>
              {custom && data?.is_super && <button type="button" className="vendor-x" aria-label={`Remove ${v}`} title={`Remove ${v} from the list`} onClick={() => removeVendor(v)}>×</button>}
            </span>);
        })}
        {data?.is_super && (adding ? (
          <form className="sig-lane vendor-add" onSubmit={(e) => { e.preventDefault(); addVendor(); }}>
            <input autoFocus value={newVendor} onChange={(e) => setNewVendor(e.target.value)} placeholder="Vendor name, e.g. Zycus" maxLength={30} aria-label="New vendor name" />
            <span className="vendor-add-acts"><button type="submit" className="btn tiny primary">Add</button><button type="button" className="btn tiny" onClick={() => { setAdding(false); setNewVendor(""); }}>Cancel</button></span>
          </form>
        ) : <button type="button" className="sig-lane vendor-plus" onClick={() => setAdding(true)} title="Add another vendor to track, for example a competitor or integration platform"><b>+</b><span>Add vendor</span></button>)}
      </div>
      <div className="sig-body">
        <aside className="sig-side">
          <h3>Regions</h3>
          {regionList.length === 0 ? <p className="note">No active region.</p> : regionList.map((r) => (
            <label key={r}><input type="checkbox" checked={active.includes(r)} onChange={() => setRegions(toggle(active, r))} /> {r} <small>{ago(data?.scans[`${vendor}|${r}`])}</small></label>))}
          <h3>View</h3>
          <label><input type="radio" name="mkview" checked={view === "partners"} onChange={() => setView("partners")} /> By partner</label>
          <label><input type="radio" name="mkview" checked={view === "customers"} onChange={() => setView("customers")} /> All Partners' Customers</label>
          <h3>Partner Customers</h3>
          <label><input type="checkbox" checked={notInApp} onChange={() => setNotInApp(!notInApp)} /> Not in my app database</label>
          <label><input type="checkbox" checked={withContacts} onChange={() => setWithContacts(!withContacts)} /> With contact details</label>
          <h3>Partners</h3>
          <label title="Partners listed by the vendor whose base or office in the region is not confirmed yet"><input type="checkbox" checked={showPending} onChange={() => setShowPending(!showPending)} /> Show partners without a confirmed office{pendingN ? ` (${pendingN})` : ""}</label>
          <h3>Scan scope</h3>
          <label><input type="checkbox" checked={allVendors} onChange={() => setAllVendors(!allVendors)} /> Include all vendors</label>
          <p className="note">Free. Public web pages only. Use Scan Partners and Scan Customers at the top. Scan again to find more: each scan adds partners it had not found before.</p>
        </aside>
        <section className="sig-main">
          <div className="mkt-tools">
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${vendor} partners, customers, projects`} aria-label="Search" />
            {!embedded && <span className="mkt-phase">
              <button type="button" className="btn tiny primary" disabled={!!busy || regionList.length === 0} onClick={() => scanPhase("partners")}>Scan Partners</button>
              <Tip text={PARTNERS_TIP} />
              <button type="button" className="btn tiny primary" disabled={!!busy || regionList.length === 0} onClick={() => scanPhase("customers")}>Scan Customers</button>
              <Tip text={CUSTOMERS_TIP} />
            </span>}
            <button type="button" className="btn tiny" onClick={() => setAddingP((v) => !v)} aria-expanded={addingP} title="Add a partner the scans missed">+ Add partner</button>
            <button type="button" className="btn tiny" disabled={!custs.length || !!busy} onClick={findAll} title="Free: searches for contacts at up to 10 customers of this vendor that have none yet">Find customer contacts</button>
            <button type="button" className="btn tiny" disabled={!custs.length} onClick={download}>Download customers (CSV)</button>
            <span className="note">{partners.length} partners · {custs.length} customers</span>
          </div>
          {addingP && (
            <form className="mkt-addp" onSubmit={(e) => { e.preventDefault(); addPartner(); }}>
              <b>Add a {vendor} partner</b>
              <input autoFocus value={pf.name} onChange={(e) => setPf({ ...pf, name: e.target.value })} placeholder="Partner name, e.g. MDSap" aria-label="Partner name" maxLength={140} />
              <input value={pf.website} onChange={(e) => setPf({ ...pf, website: e.target.value })} placeholder="Website (optional)" aria-label="Website" maxLength={200} />
              <select value={pf.region || active[0] || ""} onChange={(e) => setPf({ ...pf, region: e.target.value })} aria-label="Region">{regionList.map((r) => <option key={r}>{r}</option>)}</select>
              <button type="submit" className="btn tiny primary">Add</button><button type="button" className="btn tiny" onClick={() => setAddingP(false)}>Cancel</button>
            </form>)}
          {!data && <p className="note">Loading…</p>}
          {data && active.length === 0 && <div className="sig-empty"><h3>Tick a region</h3><p>Choose one or more regions on the left to see their partners and customers.</p></div>}
          {data && partners.length === 0 && view === "partners" && (
            <div className="sig-empty"><h3>No {vendor} partners yet</h3><p>Nothing has been scanned yet. The daily 6am run adds four vendor and region pairs each day, so all regions take about nine days. You do not have to wait: scan now (free, usually a few minutes per region).</p>
              <div className="sig-scanbar">{active.map((r) => <button type="button" key={r} className="btn primary" disabled={busy === `${vendor}|${r}`} onClick={() => scan(r, vendor)}>{busy === `${vendor}|${r}` ? "Queuing…" : `Scan ${vendor} · ${r} now`}</button>)}</div></div>)}
          {view === "partners" && <div className="mkt-grid">{partners.map((p) => {
            const cs = custOf(p), isOpen = openP === p.id;
            return (
              <article key={p.id} className={`sig-card mkt-card${isOpen ? " open" : ""}`}>
                <div className="sig-row">
                  <a className="sig-co mkt-site" href={p.website ? webUrl(p.website) : p.source_url} target="_blank" rel="noopener noreferrer" title={p.website ? `Open ${p.website.replace(/^https?:\/\//, "")} in a new tab` : "No website saved; opens the page that lists this partner"}>{p.name}<i aria-hidden="true">↗</i></a><span className="sig-meta">{place(p.region, p.hq_city, p.hq_country, p.branch, p.coverage_only)}</span>
                  {p.tier && <span className="sig-pill">{p.tier}</span>}<span className={`sig-pill lab-${p.label.toLowerCase()}`}>{p.label}</span>
                </div>
                {p.services && <p className="sig-ev">{p.services}</p>}
                {p.scope_note && <p className="sig-scope">{p.scope_note}{p.branch_source && <> <a href={p.branch_source} target="_blank" rel="noopener noreferrer">source</a></>}</p>}
                <p className="sig-src">{p.website && <><a href={/^https?:/.test(p.website) ? p.website : `https://${p.website}`} target="_blank" rel="noopener noreferrer">{p.website.replace(/^https?:\/\//, "")}</a> · </>}Listed on: <a href={p.source_url} target="_blank" rel="noopener noreferrer">source</a></p>
                {p.contacts.map((c, i) => <Who key={i} c={c} />)}
                <div className="sig-acts">{partnerJob(p) ? <ScanGauge compact label="Finding customers" requestedAt={partnerJob(p)!.requested_at} startedAt={partnerJob(p)!.started_at} expectedSecs={expectedSecs(partnerJob(p)!)} />
                  : flash[`p:${p.id}`] ? <DoneTick compact text={flash[`p:${p.id}`]} />
                  : <button type="button" className="btn tiny" disabled={busy === `p|${p.id}`} onClick={() => moreFor(p)} title="Free: reads this partner's whole published customer list and adds the ones not saved yet">Find more customers</button>}
                  <button type="button" className="btn tiny" onClick={() => setOpenP(isOpen ? null : p.id)} aria-expanded={isOpen}>{cs.length} published customer{cs.length === 1 ? "" : "s"} {isOpen ? "▴" : "▾"}</button></div>
                {isOpen && (cs.length === 0 ? <p className="note">No customers published by this partner (or none match the filters).</p> : (
                  custTable(cs)))}
              </article>);
          })}</div>}
          {view === "customers" && (custs.length === 0 ? <div className="sig-empty"><h3>No partner customers to show</h3><p>Partners often publish few customers. Try another vendor or loosen the filters.</p></div> : (
            partners.filter((p) => custOf(p).length > 0).sort((x, y) => custOf(y).length - custOf(x).length).map((p, i) => {
              const cs = custOf(p);
              return (
                <details key={p.id} className="mkt-group" open={i === 0 || !!needle}>
                  <summary><a className="mkt-site" href={p.website ? webUrl(p.website) : p.source_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} title={p.website ? `Open ${p.website.replace(/^https?:\/\//, "")} in a new tab` : "No website saved; opens the page that lists this partner"}><b>{p.name}</b><i aria-hidden="true">↗</i></a><span className="sig-meta">{place(p.region, p.hq_city, p.hq_country, p.branch, p.coverage_only)}{p.tier ? ` · ${p.tier}` : ""}</span><em>{cs.length} customer{cs.length === 1 ? "" : "s"}</em></summary>
                  {custTable(cs)}
                </details>);
            })))}
        </section>
      </div>
    </div>
  );
}
