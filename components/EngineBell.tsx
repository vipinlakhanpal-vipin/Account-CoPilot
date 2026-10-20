"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import DailyRunLocalTime from "@/components/DailyRunLocalTime";
import { fmtDateTime } from "@/lib/dates";
import { REGIONS } from "@/lib/icpDefinition.mjs";

const KNOWN_REGIONS = new Set<string>(REGIONS.map((r: { key: string }) => r.key));

type Detail = { name: string; status: string; revenue?: string; region?: string; entity_type?: "Regional HQ" | "Branch" | "Foreign Branch" | "Unknown" };
type Entry = { at: string; summary: string; verified: number; new_companies: string[]; details?: Detail[]; region?: string };
const statusTag = (s: string) => (/verified/i.test(s) ? "fact" : /likely/i.test(s) ? "likely" : /not icp/i.test(s) ? "conflict" : "unv");
// Short label for the bell's tight table — the full "Regional HQ" / "Branch" / "Foreign Branch" wording lives in Accounts/Pipeline.
const entityShort = (t?: string) => t === "Regional HQ" ? "HQ" : t === "Branch" ? "Branch" : t === "Foreign Branch" ? "Foreign" : "—";
const entityTitle = (t?: string) => t === "Branch" ? "Local branch or subsidiary of another Middle East company" : t === "Foreign Branch" ? "Local branch or subsidiary of a company headquartered outside the Middle East" : t === "Regional HQ" ? "Headquartered in the Middle East" : "Not yet determined";
// A scheduled session can spell the same company slightly differently between its new_companies list and its
// details rows (e.g. an apostrophe present in one but not the other) — normalize before matching so a one-character
// difference doesn't silently drop that row's "New" flag and undercount the region's new-company total.
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

// Bell in the top bar: notifications from the scheduled engine runs (6am daily). Unread = newer than the last time you opened it.
export default function EngineBell() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [myRegions, setMyRegions] = useState<{ key: string; name: string; status: string; priority?: string; market?: boolean; plan_new?: number; plan_verify?: number }[]>([]);
  const [seen, setSeen] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try { setSeen(localStorage.getItem("engine-seen") || ""); } catch {}
    // Check now, every minute, and whenever the tab regains focus, so a run that finishes while the page is open still shows the red badge.
    const load = () => fetch("/api/engine?only=log", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j) { setEntries(j.entries || []); setMyRegions(j.regions || []); } }).catch(() => {});
    load();
    const t = setInterval(load, 60000);
    const onFocus = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    // mousedown (not click) — a resize-corner drag reliably starts with mousedown on the element itself, so this
    // doesn't misfire the way "click" can once a native CSS resize drag changes what ends up under the cursor.
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onFocus); window.removeEventListener("focus", onFocus); document.removeEventListener("mousedown", close); };
  }, []);
  const unread = entries.filter((e) => e.at > seen).length;
  // "" = nothing chosen yet → default to the region of the latest run. "All" = every region, grouped by day (the original view).
  const [picked, setPicked] = useState("");
  useEffect(() => { try { setPicked(localStorage.getItem("bell-region") || ""); } catch {} }, []);
  // One block per (run, region), so a single region's history can be read on its own.
  const blocks = entries.flatMap((e) => {
    const regionField = e.region || e.summary.match(/^([^—]+)—/)?.[1]?.trim() || "—";
    const listed = regionField.split(",").map((r) => r.trim()).filter(Boolean);
    const newSet = new Set(e.new_companies.map(norm));
    const rows = (e.details || []).map((d) => ({ ...d, isNew: newSet.has(norm(d.name)), isVerified: !/unknown/i.test(d.status) }));
    const split = rows.some((d) => d.region);
    // Instant lookups ("Company lookup: …") and free-text lines aren't regions — group them so the dropdown stays a clean region list.
    const known = (r: string) => KNOWN_REGIONS.has(r) || r.includes(" + ");
    const regs = (split ? [...new Set(rows.map((d) => d.region).filter(Boolean) as string[])] : [listed.length > 1 ? listed.join(" + ") : listed[0] || "—"])
      .map((r) => (known(r) ? r : "Instant lookups"));
    return regs.map((r) => ({ at: e.at, region: r, rows: split ? rows.filter((d) => d.region === r) : rows, summary: e.summary }));
  });
  // every region this person may see is listed, even one that has not had a run yet (it then explains how to start one)
  const nameOf = (k: string) => myRegions.find((m) => m.key === k)?.name || k;
  const regionList = [...new Set([...blocks.map((b) => b.region), ...myRegions.map((m) => m.key)])].sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  const selected = picked === "All" || regionList.includes(picked) ? picked : blocks[0]?.region || "All";
  const choose = (r: string) => { setPicked(r); try { localStorage.setItem("bell-region", r); } catch {} };
  const toggle = () => {
    setOpen((o) => !o);
    if (!open && entries[0]) { try { localStorage.setItem("engine-seen", entries[0].at); } catch {} setTimeout(() => setSeen(entries[0].at), 1500); }
  };
  return (
    <div className="bell" ref={ref}>
      <button type="button" className="bell-btn notif-btn" onClick={toggle} aria-label={`Engine notifications${unread ? `, ${unread} new` : ""}`}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.2a4 4 0 0 0-4 4v2.3L2.8 11h10.4L12 8.5V6.2a4 4 0 0 0-4-4ZM6.5 13a1.5 1.5 0 0 0 3 0" fill="none" stroke="var(--teal)" strokeWidth="1.4" strokeLinejoin="round" /></svg>
        {unread > 0 && <span className="bell-dot">{unread}</span>}
        <span className="tip-pill" role="tooltip"><span className="tip-dot" aria-hidden="true" />Engine notifications - what the daily run did</span>
      </button>
      {open && (
        <div className="bell-pop" role="dialog" aria-label="Engine notifications">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span className="bell-title-row"><b>Scheduled runs</b>
              {regionList.length > 0 && <label className="bell-region-select"><span className="sr-only">Select region</span>
                <select value={selected} onChange={(e) => choose(e.target.value)} aria-label="Select region">
                  <option value="All">All regions</option>
                  {regionList.map((r) => <option key={r} value={r}>{nameOf(r)}</option>)}
                </select></label>}
            </span>
            <button type="button" className="btn tiny btn-close" onClick={() => setOpen(false)}>Close</button>
          </div>
          {regionList.length > 0 && <div className="bell-region-name">{selected === "All" ? "All regions" : nameOf(selected)}</div>}
          {(() => {
            // Today's plan: what the engine intends for each Active region today (the Define ICP counts times its priority) next to what the latest run has done.
            const todayKey = new Date().toDateString(), order = ["high", "medium", "low"];
            const rows = myRegions.filter((m) => m.status === "active" && (selected === "All" || m.key === selected))
              .sort((a, b) => order.indexOf(a.priority || "medium") - order.indexOf(b.priority || "medium") || nameOf(a.key).localeCompare(nameOf(b.key)))
              .map((m) => {
                const today = blocks.filter((b) => b.region === m.key && new Date(b.at).toDateString() === todayKey).flatMap((b) => b.rows);
                const ran = blocks.some((b) => b.region === m.key && new Date(b.at).toDateString() === todayKey);
                const newN = today.filter((d) => d.isNew).length, verN = today.filter((d) => d.isVerified && !/market|pitch|contact|signal/i.test(d.status || "")).length;
                const pn = m.plan_new ?? 0, pv = m.plan_verify ?? 0;
                const state = !ran ? "Not run yet" : newN >= pn && verN >= pv ? "Done" : `Partly: ${Math.max(0, pn - newN)} new and ${Math.max(0, pv - verN)} checks go to tomorrow`;
                return { m, newN, verN, pn, pv, state, ran };
              });
            if (!rows.length) return null;
            return (
              <div className="bell-plan">
                <p className="bell-plan-h">Today&apos;s plan <small>what the engine intends for each Active region today, and what it has done</small></p>
                <table className="bell-table"><thead><tr><th>Region</th><th>Priority</th><th>Plan: new / checks</th><th>Done</th><th>Status</th></tr></thead>
                  <tbody>{rows.map(({ m, newN, verN, pn, pv, state, ran }) => (
                    <tr key={m.key}><td>{nameOf(m.key)}</td><td><span className={`bell-prio p-${m.priority || "medium"}`}>{m.priority === "high" ? "High" : m.priority === "low" ? "Low" : "Medium"}</span></td>
                      <td>{pn} / {pv}</td><td>{ran ? `${newN} / ${verN}` : "—"}</td><td className={state === "Done" ? "ok" : "muted"}>{state}</td></tr>))}</tbody></table>
              </div>);
          })()}
          {selected !== "All" && (() => {
            // One line under the region name: what the latest run day did for it (new companies and companies verified), and its priority.
            const mine = blocks.filter((b) => b.region === selected);
            const meta = myRegions.find((m) => m.key === selected);
            if (meta?.status === "active") return null; // an Active region is already in Today's plan above
            const chip = meta?.priority ? <span className={`bell-prio p-${meta.priority}`}>{meta.priority === "high" ? "High" : meta.priority === "medium" ? "Medium" : "Low"} priority</span> : null;
            if (!mine.length) return chip ? <p className="bell-oneline">No run yet {chip}</p> : null;
            const day = new Date(mine[0].at).toDateString(), sameDay = mine.filter((b) => new Date(b.at).toDateString() === day);
            const rows = sameDay.flatMap((b) => b.rows);
            const newN = rows.filter((d) => d.isNew).length;
            const verN = rows.filter((d) => d.isVerified && !/market|pitch|contact|signal/i.test(d.status || "")).length;
            const when = day === new Date().toDateString() ? "Today" : new Date(mine[0].at).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
            return <p className="bell-oneline"><b>{when}:</b> {newN} new {newN === 1 ? "company" : "companies"} · {verN} verified {chip}</p>;
          })()}
          <p className="bell-resize-hint">Drag the bottom-right corner to expand ↘</p>
          {entries.length === 0 && selected === "All" ? <p className="note">No runs yet. The engine runs every day at <DailyRunLocalTime /> and posts a summary here.</p>
            : selected !== "All" && !blocks.some((b) => b.region === selected) ? (() => {
              const st = myRegions.find((m) => m.key === selected)?.status;
              return (<div className="bell-item" role="status">
                <small>{nameOf(selected)}: no run yet</small>
                {st === "active" ? <p className="note">{nameOf(selected)} is Active, so the daily run at <DailyRunLocalTime /> will look for its first companies and post the result here. To start now, use the button below, or open <b>Home → Find and search</b> and choose <b>Find New Company</b>, pick {nameOf(selected)} and ask for companies (free, usually about 2 minutes once a session picks it up).</p>
                  : <p className="note">{nameOf(selected)} is not Active yet ({st || "paused"}), so nothing runs for it. A Super Admin can activate it in Setup → Define ICP.</p>}
                {st === "active" && <Link href={`/find?mode=new&region=${encodeURIComponent(selected)}`} className="btn tiny primary" onClick={() => setOpen(false)}>Find companies in {nameOf(selected)} →</Link>}
              </div>);
            })()
            : selected !== "All" ? (() => {
              const mine = blocks.filter((b) => b.region === selected).slice(0, 6);
              const lastAny = entries[0]?.at, lastMine = mine[0]?.at;
              // The newest run of ANY region is a day or more after this region's newest run → it was left out of the latest run.
              const skipped = !!lastAny && !!lastMine && new Date(lastAny).getTime() - new Date(lastMine).getTime() > 12 * 3600 * 1000;
              return (<>
                {skipped && <p className="bell-skip" role="status">Not included in the latest run ({fmtDateTime(lastAny!)}). Last run for {selected}: {fmtDateTime(lastMine!)}.</p>}
                {mine.map((b, bi) => {
                  const verifiedCt = b.rows.filter((d) => /verified/i.test(d.status)).length;
                  const newCt = b.rows.filter((d) => d.isNew).length;
                  return (
                    <div key={bi} className={`bell-item${b.at > seen ? " new" : ""}`}>
                      <small>{fmtDateTime(b.at)}{b.rows.length > 0 && <> — {newCt} new, {b.rows.length} checked: {verifiedCt} Verified</>}</small>
                      {b.rows.length > 0 && (
                        <table className="bell-table"><thead><tr><th>Company</th><th>New</th><th>Verified</th><th>Entity</th><th>Status</th><th>Revenue</th><th></th></tr></thead>
                          <tbody>{b.rows.slice(0, 24).map((d, i) => (
                            <tr key={i}><td>{d.name}</td><td>{d.isNew ? "✓" : ""}</td><td>{d.isVerified ? "✓" : ""}</td>
                              <td className="muted" title={entityTitle(d.entity_type)}>{entityShort(d.entity_type)}</td>
                              <td><span className={`tag ${statusTag(d.status)}`}>{d.status}</span></td><td className="muted">{d.revenue || "—"}</td>
                              <td>{/^held/i.test(d.status) && <a className="job-link" href="/settings#engine-pending" onClick={() => setOpen(false)}>Activate →</a>}</td></tr>
                          ))}</tbody></table>
                      )}
                      <p className="note bell-note">{b.summary}</p>
                    </div>
                  );
                })}
              </>);
            })()
            : (() => {
              // Group by day, then by region within the day, so each region reads as its own labelled section
              // (new/verified counts, then its own company table) instead of one combined Region column that's
              // hard to scan when several regions ran together.
              const shown = entries.slice(0, 8);
              const days = new Map<string, Entry[]>();
              for (const e of shown) { const d = new Date(e.at).toDateString(); (days.get(d) || days.set(d, []).get(d)!).push(e); }
              return [...days.entries()].map(([day, group]) => {
                const anyNew = group.some((e) => e.at > seen);
                return (
                  <div key={day} className={`bell-item${anyNew ? " new" : ""}`}>
                    <small>{fmtDateTime(group[0].at)}</small>
                    {group.map((e, ei) => {
                      const regionField = e.region || e.summary.match(/^([^—]+)—/)?.[1]?.trim() || "—";
                      const regions = regionField.split(",").map((r) => r.trim()).filter(Boolean);
                      const newSet = new Set(e.new_companies.map(norm));
                      const rows = (e.details || []).map((d) => ({ ...d, isNew: newSet.has(norm(d.name)), isVerified: !/unknown/i.test(d.status) }));
                      // More than one region in this entry: if each row already carries its own real region
                      // (resolved server-side from the company record), split into one section per region.
                      // Otherwise there's nothing to split by — show the rows once under a heading naming them all.
                      const canSplit = regions.length > 1 && rows.some((d) => d.region);
                      const sections = canSplit
                        ? regions.map((r) => ({ region: r, rows: rows.filter((d) => d.region === r) })).filter((s) => s.rows.length > 0)
                        : [{ region: regions.length <= 1 ? regionField : regions.join(" + "), rows }];
                      return (
                        <div key={ei}>
                          {sections.map((s, si) => {
                            const verifiedCt = s.rows.filter((d) => /verified/i.test(d.status)).length;
                            const newCt = s.rows.filter((d) => d.isNew).length;
                            return (
                              <div key={si} className="bell-region">
                                <div className="bell-region-head"><b>{s.region}</b>
                                  <span className="muted bell-region-time"> · {fmtDateTime(e.at)}</span>
                                  {s.rows.length > 0 && <span className="muted"> — {newCt} new, {s.rows.length} checked: {verifiedCt} Verified</span>}</div>
                                {s.rows.length > 0 && (
                                  <table className="bell-table"><thead><tr><th>Company</th><th>New</th><th>Verified</th><th>Entity</th><th>Status</th><th>Revenue</th><th></th></tr></thead>
                                    <tbody>{s.rows.slice(0, 24).map((d, i) => (
                                      <tr key={i}><td>{d.name}</td><td>{d.isNew ? "✓" : ""}</td><td>{d.isVerified ? "✓" : ""}</td>
                                        <td className="muted" title={entityTitle(d.entity_type)}>{entityShort(d.entity_type)}</td>
                                        <td><span className={`tag ${statusTag(d.status)}`}>{d.status}</span></td><td className="muted">{d.revenue || "—"}</td>
                                        <td>{/^held/i.test(d.status) && <a className="job-link" href="/settings#engine-pending" onClick={() => setOpen(false)}>Activate →</a>}</td></tr>
                                    ))}</tbody></table>
                                )}
                              </div>
                            );
                          })}
                          <p className="note bell-note">{e.summary}</p>
                        </div>
                      );
                    })}
                  </div>
                );
              });
            })()}
          <div className="bell-foot">
            <Link href="/?tab=reports&view=activity" className="btn tiny primary" onClick={() => setOpen(false)}>Full report: Engine activity →</Link>
            <Link href="/settings#engine" className="btn tiny" onClick={() => setOpen(false)}>Open engine settings</Link>
          </div>
        </div>)}
    </div>
  );
}
