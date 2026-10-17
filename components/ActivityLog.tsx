"use client";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { KIND_LABEL, fmtDuration } from "@/lib/activity";

type Sum = { email: string; name: string; last_sign_in: string | null; last_seen: string | null; visits: number; actions: number; time_secs: number; top_pages: string[] };
type Row = { id: number; at: string; day: string; email: string; kind: string; detail: string; page: string; secs: number };
type Tot = { day: string; email: string; secs: number };
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Dubai", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "never");
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Asia/Dubai", hour: "2-digit", minute: "2-digit" });
const dayName = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const who = (s: Sum | undefined, email: string) => s?.name || email.split("@")[0];

// Setup → Team (Super Admin): who opened the app, what they opened, how long they stayed, and what they did, by person and by day.
export default function ActivityLog() {
  const [days, setDays] = useState(7);
  const [user, setUser] = useState("");
  const [data, setData] = useState<{ ready: boolean; summary: Sum[]; feed: Row[]; totals: Tot[] } | null>(null);
  const [showDays, setShowDays] = useState(14);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (d: string) => setOpen((o) => { const n = new Set(o); if (n.has(d)) n.delete(d); else n.add(d); return n; });
  const load = useCallback(() => fetch(`/api/activity?days=${days}${user ? `&user=${encodeURIComponent(user)}` : ""}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then(setData).catch(() => {}), [days, user]);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  // day -> person -> entries in time order
  const blocks = useMemo(() => {
    const byDay = new Map<string, Map<string, Row[]>>();
    for (const r of [...(data?.feed || [])].reverse()) {
      if (r.kind === "ping") continue;
      const d = byDay.get(r.day) || byDay.set(r.day, new Map()).get(r.day)!;
      (d.get(r.email) || d.set(r.email, []).get(r.email)!).push(r);
    }
    return [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [data]);
  const total = (day: string, email: string) => data?.totals.find((t) => t.day === day && t.email === email)?.secs || 0;
  const sums = new Map((data?.summary || []).map((s) => [s.email, s]));

  return (
    <section className="panel" style={{ marginTop: 16 }}>
      <h2>Log Activity</h2>
      <p className="note">Who opened the app, which tab or page they used, how long they stayed, and what they did. Super Admins only. Times are Dubai time.</p>
      <div className="act-tools">
        <label>Period <select value={days} onChange={(e) => { setDays(Number(e.target.value)); setShowDays(14); }}>{[[1, "Today"], [7, "Last 7 days"], [30, "Last 30 days"], [90, "Last 90 days"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label>Person <select value={user} onChange={(e) => { setUser(e.target.value); setShowDays(14); }}><option value="">Everyone</option>{(data?.summary || []).map((s) => <option key={s.email} value={s.email}>{s.name || s.email}</option>)}</select></label>
      </div>
      {data && !data.ready && <p className="note">Activity tracking is not set up in the database yet.</p>}
      {data?.ready && (<>
        <div className="tablewrap"><table className="act-sum"><thead><tr><th>Person</th><th>Last seen</th><th>Last sign-in</th><th>Visits</th><th>Time in app</th><th>Actions</th><th>Where they spend most time</th></tr></thead><tbody>
          {data.summary.map((s) => (<tr key={s.email}><td><b>{who(s, s.email)}</b><div className="muted">{s.email}</div></td><td className="mono">{when(s.last_seen)}</td><td className="mono">{when(s.last_sign_in)}</td><td>{s.visits}</td><td>{fmtDuration(s.time_secs)}</td><td>{s.actions}</td><td>{s.top_pages.join(", ") || "—"}</td></tr>))}
        </tbody></table></div>

        <h3 style={{ margin: "18px 0 2px" }}>Day by day</h3>
        <p className="note" style={{ margin: "0 0 8px" }}>One line per day. Click a day to see who was in the app, where they went, what they did and how long they stayed.</p>
        {blocks.length === 0 && <p className="note">Nothing recorded in this period yet.</p>}
        {blocks.length > 0 && (
          <div className="tablewrap"><table className="act-days">
            <thead><tr><th>Day</th><th>People</th><th>Places opened</th><th>Actions</th><th>Total time in the app</th></tr></thead>
            <tbody>
              {blocks.slice(0, showDays).map(([day, people]) => {
                const isOpen = open.has(day);
                const all = [...people.values()].flat();
                const dayTotal = [...people.keys()].reduce((n, e) => n + total(day, e), 0);
                return (
                  <Fragment key={day}>
                    <tr className={`act-daybar${isOpen ? " open" : ""}`} onClick={() => toggle(day)}>
                      <td><button type="button" className="act-tog" aria-expanded={isOpen} onClick={(e) => { e.stopPropagation(); toggle(day); }}>{isOpen ? "▾" : "▸"} {dayName(day)}</button></td>
                      <td>{people.size === 1 ? who(sums.get([...people.keys()][0]), [...people.keys()][0]) : `${people.size} people`}</td>
                      <td>{all.filter((r) => r.kind === "page").length}</td>
                      <td>{all.filter((r) => r.kind !== "page" && r.kind !== "visit").length}</td>
                      <td>{fmtDuration(dayTotal)}</td>
                    </tr>
                    {isOpen && [...people.entries()].map(([email, rows]) => (
                      <Fragment key={email}>
                        <tr className="act-person"><td colSpan={4}>{who(sums.get(email), email)}</td><td>{fmtDuration(total(day, email))}</td></tr>
                        {rows.map((r) => (
                          <tr key={r.id} className="act-line">
                            <td className="mono">{clock(r.at)}</td>
                            <td colSpan={2}>{r.kind === "page" ? <>Opened <b>{r.page}</b></> : r.kind === "visit" ? "Opened the app" : KIND_LABEL[r.kind] || r.kind}{r.detail ? <span className="muted"> · {r.detail}</span> : null}</td>
                            <td></td>
                            <td>{r.kind === "page" ? fmtDuration(r.secs) : ""}</td>
                          </tr>))}
                      </Fragment>))}
                  </Fragment>);
              })}
            </tbody></table></div>)}
        {blocks.length > showDays && <p><button type="button" className="btn" onClick={() => setShowDays((n) => n + 14)}>Show earlier days</button></p>}
      </>)}
    </section>
  );
}
