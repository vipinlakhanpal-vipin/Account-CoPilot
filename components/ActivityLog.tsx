"use client";
import { useCallback, useEffect, useState } from "react";
import { KIND_LABEL } from "@/lib/activity";

type Sum = { email: string; name: string; last_sign_in: string | null; last_seen: string | null; visits: number; actions: number; top_pages: string[] };
type Row = { id: number; at: string; email: string; kind: string; detail: string; page: string };
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "never");

// Setup → Team (Super Admin): who opened the app and what they did, by person and by day.
export default function ActivityLog() {
  const [days, setDays] = useState(7);
  const [who, setWho] = useState("");
  const [data, setData] = useState<{ ready: boolean; summary: Sum[]; feed: Row[] } | null>(null);
  const [show, setShow] = useState(40);
  const load = useCallback(() => fetch(`/api/activity?days=${days}${who ? `&user=${encodeURIComponent(who)}` : ""}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then(setData).catch(() => {}), [days, who]);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);
  const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

  return (
    <section className="panel" style={{ marginTop: 16 }}>
      <h2>Activity</h2>
      <p className="note">Who opened the app and what they did. Page opens, searches, report downloads, Find contacts, scans and Aria questions. Visible to Super Admins only.</p>
      <div className="act-tools">
        <label>Period <select value={days} onChange={(e) => { setDays(Number(e.target.value)); setShow(40); }}>{[[1, "Today"], [7, "Last 7 days"], [30, "Last 30 days"], [90, "Last 90 days"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label>Person <select value={who} onChange={(e) => { setWho(e.target.value); setShow(40); }}><option value="">Everyone</option>{(data?.summary || []).map((s) => <option key={s.email} value={s.email}>{s.name || s.email}</option>)}</select></label>
      </div>
      {data && !data.ready && <p className="note">Activity tracking is not set up in the database yet (migration 0007).</p>}
      {data?.ready && (<>
        <div className="tablewrap"><table className="act-sum"><thead><tr><th>Person</th><th>Last seen</th><th>Last sign-in</th><th>Visits</th><th>Actions</th><th>Most used pages</th></tr></thead><tbody>
          {data.summary.map((s) => (<tr key={s.email}><td><b>{s.name || s.email.split("@")[0]}</b><div className="muted">{s.email}</div></td><td className="mono">{when(s.last_seen)}</td><td className="mono">{when(s.last_sign_in)}</td><td>{s.visits}</td><td>{s.actions}</td><td>{s.top_pages.join(", ") || "—"}</td></tr>))}
        </tbody></table></div>
        <h3 style={{ margin: "16px 0 6px" }}>Feed</h3>
        {data.feed.length === 0 ? <p className="note">Nothing recorded in this period yet.</p> : (
          <div className="tablewrap"><table className="act-feed"><thead><tr><th>Time</th><th>Person</th><th>What</th><th>Detail</th><th>Where</th></tr></thead><tbody>
            {data.feed.filter((r) => r.kind !== "page" || true).slice(0, show).flatMap((r, i, arr) => [
              (i === 0 || day(arr[i - 1].at) !== day(r.at)) && <tr key={`d${r.id}`}><td colSpan={5} className="act-day">{day(r.at)}</td></tr>,
              <tr key={r.id}><td className="mono">{new Date(r.at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</td><td>{r.email.split("@")[0]}</td><td>{KIND_LABEL[r.kind] || r.kind}</td><td className="wrap">{r.detail}</td><td>{r.page}</td></tr>])}
          </tbody></table></div>)}
        {data.feed.length > show && <p><button type="button" className="btn" onClick={() => setShow((n) => n + 60)}>Show more</button></p>}
      </>)}
    </section>
  );
}
