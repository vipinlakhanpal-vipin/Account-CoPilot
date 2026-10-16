"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ask, notify } from "@/components/Confirm";
import FindContactsButton from "@/components/FindContactsButton";
import { logActivity } from "@/lib/activityClient";
import type { MContact, PCustomer, Partner, Vendor } from "@/lib/market";

type Cust = PCustomer & { in_app: boolean; people_on_file: number };
type Job = { mode: string; vendor?: string; customer?: string; region: string; status: string; requested_at: string };
type Data = { vendors: Vendor[]; custom_vendors: string[]; is_super: boolean; defaults: string[]; regions: string[]; partners: Partner[]; customers: Cust[]; scans: Record<string, string>; jobs: Job[] };
const ago = (iso?: string) => { if (!iso) return "never"; const h = Math.round((Date.now() - new Date(iso).getTime()) / 36e5); return h < 1 ? "just now" : h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`; };
const csv = (rows: string[][]) => rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");

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
  const [regions, setRegions] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [view, setView] = useState<"partners" | "customers">("partners");
  const [notInApp, setNotInApp] = useState(false);
  const [withContacts, setWithContacts] = useState(false);
  const [openP, setOpenP] = useState<string | null>(null);
  const [busy, setBusy] = useState("");

  const load = useCallback(() => fetch("/api/market", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j: Data | null) => { if (j) setData(j); }).catch(() => {}), []);
  useEffect(() => { load(); const t = setInterval(load, 25000); return () => clearInterval(t); }, [load]);

  const regionList = data?.regions || [];
  const active = regions.length ? regions : regionList;
  const needle = q.trim().toLowerCase();
  const partners = useMemo(() => (data?.partners || []).filter((p) => p.vendor === vendor && active.includes(p.region) && (!needle || `${p.name} ${p.services} ${p.tier}`.toLowerCase().includes(needle))), [data, vendor, active, needle]);
  const custs = useMemo(() => (data?.customers || []).filter((c) => c.vendor === vendor && active.includes(c.region) && (!notInApp || !c.in_app) && (!withContacts || c.contacts.length > 0)
    && (!needle || `${c.customer} ${c.partner} ${c.project}`.toLowerCase().includes(needle))), [data, vendor, active, notInApp, withContacts, needle]);
  const custOf = (p: Partner) => custs.filter((c) => c.partner_id === p.id);
  const countP = (v: Vendor) => (data?.partners || []).filter((p) => p.vendor === v && active.includes(p.region)).length;
  const pending = (data?.jobs || []).filter((j) => j.status === "queued" || j.status === "running");
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
    if (r.ok) { notify(`Searching ${c.customer} contacts. They appear here when the search finishes.`, "ok"); load(); } else notify(j.error || "Could not start the search.", r.status === 409 ? "ok" : "error");
  };
  const findAll = async () => {
    for (const r of active) {
      setBusy(`ca|${r}`);
      const res = await fetch("/api/engine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "queue", region: r, count: 1, mode: "market", vendor, contacts_only: true }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 409) notify(j.error || "Could not start the search.", "error");
    }
    setBusy(""); notify(`Searching contacts for ${vendor} customers that have none. They appear here when it finishes.`, "ok"); load();
  };
  const contactCell = (c: Cust) => (
    <>
      {c.contacts.map((k, i) => <Who key={i} c={k} />)}
      {c.contacts.length === 0 && (c.in_app && c.people_on_file > 0
        ? <span className="muted">{c.people_on_file} people on file · <Link href={`/?open=${encodeURIComponent(c.slug)}&country=${encodeURIComponent(c.region)}`}>see in account</Link></span>
        : <span className="muted">none yet</span>)}
      {c.in_app ? <div><FindContactsButton slug={c.slug} region={c.region} company={c.customer} /></div>
        : <div><button type="button" className="btn tiny" disabled={busy === `c|${c.id}`} onClick={() => findFor(c)} title="Free: searches public web pages for named people at this customer">{busy === `c|${c.id}` ? "Queuing…" : "Find contacts"}</button></div>}
    </>
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
  useEffect(() => {
    if (!embedded) return;
    const on = (e: Event) => { if ((e as CustomEvent<string>).detail === "market") scanAll(active.map((r) => [r, vendor] as [string, string])); };
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
      <div className="sig-lanes" role="group" aria-label="Vendor">
        {(data?.vendors || ["SAP", "Coupa", "Oracle", "Microsoft"]).map((v, i) => {
          const custom = !!data?.custom_vendors?.includes(v);
          return (
            <span key={v} className="vendor-tile">
              <button type="button" className={`sig-lane ${["c1", "c2", "c6", "c7", "c3", "c4", "c5", "c8"][i % 8]}`} aria-pressed={vendor === v} onClick={() => { setVendor(v); setOpenP(null); }}><b>{countP(v)}</b><span>{v} partners</span></button>
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
          <p className="note">Free. Public web pages only. Use Scan now at the top. Scan again to find more: each scan adds partners it had not found before.</p>
        </aside>
        <section className="sig-main">
          <div className="mkt-tools">
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${vendor} partners, customers, projects`} aria-label="Search" />
            <button type="button" className="btn tiny primary" disabled={!!busy || regionList.length === 0} onClick={() => scanAll(active.map((r) => [r, vendor] as [string, string]))}>Scan {vendor} now</button>
            <button type="button" className="btn tiny" disabled={!custs.length || !!busy} onClick={findAll} title="Free: searches for contacts at up to 10 customers of this vendor that have none yet">Find customer contacts</button>
            <button type="button" className="btn tiny" disabled={!custs.length} onClick={download}>Download customers (CSV)</button>
            <span className="note">{partners.length} partners · {custs.length} customers</span>
          </div>
          {pending.length > 0 && <div className="sig-pending" role="status"><span className="fcj-dot" aria-hidden="true" /> <b className="fcj-flash">Scanning {pending.map((j) => (j.customer ? `contacts for ${j.customer}` : `${j.vendor === "all" || !j.vendor ? "all vendors" : j.vendor} · ${j.region}`)).join(", ")}…</b> Results appear here by themselves.</div>}
          {!data && <p className="note">Loading…</p>}
          {data && partners.length === 0 && view === "partners" && (
            <div className="sig-empty"><h3>No {vendor} partners yet</h3><p>Nothing has been scanned yet. The daily 6am run adds four vendor and region pairs each day, so all regions take about nine days. You do not have to wait: scan now (free, usually a few minutes per region).</p>
              <div className="sig-scanbar">{regionList.map((r) => <button type="button" key={r} className="btn primary" disabled={busy === `${vendor}|${r}`} onClick={() => scan(r, vendor)}>{busy === `${vendor}|${r}` ? "Queuing…" : `Scan ${vendor} · ${r} now`}</button>)}
                <button type="button" className="btn" onClick={() => scanAll(regionList.map((r) => [r, "all"] as [string, string]))}>All vendors, all regions</button></div></div>)}
          {view === "partners" && <div className="mkt-grid">{partners.map((p) => {
            const cs = custOf(p), isOpen = openP === p.id;
            return (
              <article key={p.id} className={`sig-card mkt-card${isOpen ? " open" : ""}`}>
                <div className="sig-row">
                  <b className="sig-co">{p.name}</b><span className="sig-meta">{p.region}{p.hq_city ? ` · ${p.hq_city}` : ""}</span>
                  {p.tier && <span className="sig-pill">{p.tier}</span>}<span className={`sig-pill lab-${p.label.toLowerCase()}`}>{p.label}</span>
                </div>
                {p.services && <p className="sig-ev">{p.services}</p>}
                <p className="sig-src">{p.website && <><a href={/^https?:/.test(p.website) ? p.website : `https://${p.website}`} target="_blank" rel="noopener noreferrer">{p.website.replace(/^https?:\/\//, "")}</a> · </>}Listed on: <a href={p.source_url} target="_blank" rel="noopener noreferrer">source</a></p>
                {p.contacts.map((c, i) => <Who key={i} c={c} />)}
                <div className="sig-acts"><button type="button" className="btn tiny" onClick={() => setOpenP(isOpen ? null : p.id)} aria-expanded={isOpen}>{cs.length} published customer{cs.length === 1 ? "" : "s"} {isOpen ? "▴" : "▾"}</button></div>
                {isOpen && (cs.length === 0 ? <p className="note">No customers published by this partner (or none match the filters).</p> : (
                  <div className="tablewrap"><table><thead><tr><th>Customer</th><th>Project</th><th>Contact</th><th>Source</th></tr></thead><tbody>
                    {cs.map((c) => (
                      <tr key={c.id}><td><b>{c.customer}</b> {c.in_app ? <Link className="mkt-in" href={`/?open=${encodeURIComponent(c.slug)}&country=${encodeURIComponent(c.region)}`}>In your app database</Link> : <Link className="mkt-add" href={addLink(c)}>Not in your database · Add</Link>}</td>
                        <td>{c.project}</td><td>{contactCell(c)}</td>
                        <td><a href={c.source_url} target="_blank" rel="noopener noreferrer">open</a></td></tr>))}
                  </tbody></table></div>))}
              </article>);
          })}</div>}
          {view === "customers" && (custs.length === 0 ? <div className="sig-empty"><h3>No partner customers to show</h3><p>Partners often publish few customers. Try another vendor or loosen the filters.</p></div> : (
            partners.filter((p) => custOf(p).length > 0).sort((x, y) => custOf(y).length - custOf(x).length).map((p, i) => {
              const cs = custOf(p);
              return (
                <details key={p.id} className="mkt-group" open={i === 0 || !!needle}>
                  <summary><b>{p.name}</b><span className="sig-meta">{p.region}{p.tier ? ` · ${p.tier}` : ""}</span><em>{cs.length} customer{cs.length === 1 ? "" : "s"}</em></summary>
                  <div className="tablewrap"><table><thead><tr><th>Customer</th><th>Project</th><th>Contact details</th><th>Source</th></tr></thead><tbody>
                    {cs.map((c) => (
                      <tr key={c.id}><td><b>{c.customer}</b><div className="muted">{c.region}</div>{c.in_app ? <Link className="mkt-in" href={`/?open=${encodeURIComponent(c.slug)}&country=${encodeURIComponent(c.region)}`}>In your app database</Link> : <Link className="mkt-add" href={addLink(c)}>Not in your database · Add</Link>}</td>
                        <td>{c.project}</td><td>{contactCell(c)}</td><td><a href={c.source_url} target="_blank" rel="noopener noreferrer">open</a></td></tr>))}
                  </tbody></table></div>
                </details>);
            })))}
        </section>
      </div>
    </div>
  );
}
