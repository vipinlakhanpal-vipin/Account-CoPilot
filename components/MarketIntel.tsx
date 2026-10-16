"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { notify } from "@/components/Confirm";
import { logActivity } from "@/lib/activityClient";
import type { MContact, PCustomer, Partner, Vendor } from "@/lib/market";

type Cust = PCustomer & { in_app: boolean };
type Job = { mode: string; vendor?: string; region: string; status: string; requested_at: string };
type Data = { vendors: Vendor[]; regions: string[]; partners: Partner[]; customers: Cust[]; scans: Record<string, string>; jobs: Job[] };
const ago = (iso?: string) => { if (!iso) return "not scanned yet"; const h = Math.round((Date.now() - new Date(iso).getTime()) / 36e5); return h < 1 ? "just now" : h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`; };
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

  const scan = async (region: string, v: string) => {
    setBusy(`${v}|${region}`); logActivity("scan", `Market intelligence: ${v} · ${region}`);
    const r = await fetch("/api/engine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "queue", region, count: 1, mode: "market", vendor: v }) });
    const j = await r.json().catch(() => ({}));
    setBusy("");
    if (r.ok) { notify(`${v === "all" ? "Market" : v} scan for ${region} queued. Results appear here when it finishes.`, "ok"); load(); }
    else notify(j.error || "Could not start the scan.", r.status === 409 ? "ok" : "error");
  };
  const download = () => {
    const rows = [["Vendor", "Region", "Partner", "Customer", "Project", "Customer in your app", "Contact", "Title", "Email", "Phone", "LinkedIn", "Source"]];
    for (const c of custs) { if (c.contacts.length) for (const k of c.contacts) rows.push([c.vendor, c.region, c.partner, c.customer, c.project, c.in_app ? "Yes" : "No", k.name, k.title, k.email, k.phone, k.linkedin_url, c.source_url]);
      else rows.push([c.vendor, c.region, c.partner, c.customer, c.project, c.in_app ? "Yes" : "No", "", "", "", "", "", c.source_url]); }
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + csv(rows)], { type: "text/csv" })); a.download = `market-intelligence-${vendor}.csv`; a.click();
  };
  const addLink = (c: Cust) => `/find?mode=new&company=${encodeURIComponent(c.customer)}&region=${encodeURIComponent(c.region)}`;

  return (
    <div className="mkt">
      <section className="hero mkt-hero"><h1>Market intelligence</h1><p>Who implements SAP, Coupa, Oracle and Microsoft in your regions, and the customers they publish. Every row links to its source.</p></section>
      <div className="sig-lanes" role="group" aria-label="Vendor">
        {(data?.vendors || (["SAP", "Coupa", "Oracle", "Microsoft"] as Vendor[])).map((v) => (
          <button type="button" key={v} className="sig-lane" aria-pressed={vendor === v} onClick={() => { setVendor(v); setOpenP(null); }}><b>{countP(v)}</b><span>{v} partners</span></button>))}
      </div>
      <div className="sig-body">
        <aside className="sig-side">
          <h3>Regions</h3>
          {regionList.length === 0 ? <p className="note">No active region.</p> : regionList.map((r) => (
            <label key={r}><input type="checkbox" checked={active.includes(r)} onChange={() => setRegions(toggle(active, r))} /> {r} <small>{ago(data?.scans[`${vendor}|${r}`])}</small></label>))}
          <h3>View</h3>
          <label><input type="radio" name="mkview" checked={view === "partners"} onChange={() => setView("partners")} /> By partner</label>
          <label><input type="radio" name="mkview" checked={view === "customers"} onChange={() => setView("customers")} /> All customers</label>
          <h3>Customers</h3>
          <label><input type="checkbox" checked={notInApp} onChange={() => setNotInApp(!notInApp)} /> Not in my accounts</label>
          <label><input type="checkbox" checked={withContacts} onChange={() => setWithContacts(!withContacts)} /> With contact details</label>
          <h3>Scan now</h3>
          {regionList.slice(0, 4).map((r) => <button type="button" key={r} className="btn tiny" disabled={busy === `${vendor}|${r}`} onClick={() => scan(r, vendor)}>{vendor} · {r}</button>)}
          {regionList.length > 0 && <button type="button" className="btn tiny" disabled={busy === `all|${regionList[0]}`} onClick={() => regionList.forEach((r) => scan(r, "all"))}>All vendors, all regions</button>}
          <p className="note">Free. Public web pages only. A scheduled Claude session runs it, usually a few minutes per region.</p>
        </aside>
        <section className="sig-main">
          <div className="mkt-tools">
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${vendor} partners, customers, projects`} aria-label="Search" />
            <button type="button" className="btn tiny" disabled={!custs.length} onClick={download}>Download customers (CSV)</button>
            <span className="note">{partners.length} partners · {custs.length} customers</span>
          </div>
          {pending.length > 0 && <div className="sig-pending" role="status"><span className="fcj-dot" aria-hidden="true" /> <b className="fcj-flash">Scanning {pending.map((j) => `${j.vendor === "all" || !j.vendor ? "all vendors" : j.vendor} · ${j.region}`).join(", ")}…</b> Results appear here by themselves.</div>}
          {!data && <p className="note">Loading…</p>}
          {data && partners.length === 0 && view === "partners" && (
            <div className="sig-empty"><h3>No {vendor} partners yet</h3><p>The daily run adds a few vendor and region pairs each day. Scan {vendor} for a region from the left panel to start now.</p></div>)}
          {view === "partners" && partners.map((p) => {
            const cs = custOf(p), isOpen = openP === p.id;
            return (
              <article key={p.id} className="sig-card mkt-card">
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
                      <tr key={c.id}><td><b>{c.customer}</b> {c.in_app ? <Link className="mkt-in" href={`/?open=${encodeURIComponent(c.slug)}&country=${encodeURIComponent(c.region)}`}>In your accounts</Link> : <Link className="mkt-add" href={addLink(c)}>Add as account</Link>}</td>
                        <td>{c.project}</td><td>{c.contacts.length ? c.contacts.map((k, i) => <Who key={i} c={k} />) : <span className="muted">none published</span>}</td>
                        <td><a href={c.source_url} target="_blank" rel="noopener noreferrer">open</a></td></tr>))}
                  </tbody></table></div>))}
              </article>);
          })}
          {view === "customers" && (custs.length === 0 ? <div className="sig-empty"><h3>No customers to show</h3><p>Partners often publish few customers. Try another vendor or loosen the filters.</p></div> : (
            <div className="tablewrap"><table><thead><tr><th>Customer</th><th>Partner</th><th>Project</th><th>Contact</th><th>Source</th></tr></thead><tbody>
              {custs.map((c) => (
                <tr key={c.id}><td><b>{c.customer}</b><div className="muted">{c.region}</div>{c.in_app ? <Link className="mkt-in" href={`/?open=${encodeURIComponent(c.slug)}&country=${encodeURIComponent(c.region)}`}>In your accounts</Link> : <Link className="mkt-add" href={addLink(c)}>Add as account</Link>}</td>
                  <td>{c.partner}</td><td>{c.project}</td><td>{c.contacts.length ? c.contacts.map((k, i) => <Who key={i} c={k} />) : <span className="muted">none published</span>}</td><td><a href={c.source_url} target="_blank" rel="noopener noreferrer">open</a></td></tr>))}
            </tbody></table></div>))}
        </section>
      </div>
    </div>
  );
}
