"use client";
import { useEffect, useRef, useState } from "react";
import { fmtDateTime } from "@/lib/dates";

type Suggestion = { id: string; where: string; category: string; description: string; submitted_by: string; submitted_at: string;
  status: "received" | "pending" | "in_progress" | "completed"; note?: string; updated_by?: string; updated_at?: string };
const WHERE = ["Home", "Dashboard", "Accounts", "Stakeholders", "Data", "Setup", "Other"];
const CATEGORY = ["Bug", "Improvement", "New feature", "Question", "Other"];
const STATUS_LABEL: Record<Suggestion["status"], string> = { received: "Request received", pending: "Pending", in_progress: "In progress", completed: "Completed" };
const STATUS_CLASS: Record<Suggestion["status"], string> = { received: "sg-received", pending: "sg-pending", in_progress: "sg-progress", completed: "sg-done" };

// Header button: raise a suggestion (what to improve, and where), tracked through Received -> Pending -> In
// progress -> Completed. Anyone can submit and see the list; only a Super Admin can move the status along.
export default function SuggestionsButton() {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [isSuper, setIsSuper] = useState(false);
  const [open, setOpen] = useState(false);
  const [where, setWhere] = useState(WHERE[0]);
  const [category, setCategory] = useState(CATEGORY[0]);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const load = () => fetch("/api/suggestions").then((r) => (r.ok ? r.json() : null)).then((j) => { if (j) { setItems(j.items || []); setIsSuper(!!j.isSuper); } }).catch(() => {});
  useEffect(() => {
    load();
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  async function submit() {
    if (description.trim().length < 3) { setMsg({ ok: false, text: "Say a bit more about what needs improving." }); return; }
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/suggestions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "submit", where, category, description: description.trim() }) });
      const j = await res.json();
      if (res.ok) { setItems(j.items); setDescription(""); setMsg({ ok: true, text: "Thanks — request received." }); }
      else setMsg({ ok: false, text: j.error || "Could not submit." });
    } catch { setMsg({ ok: false, text: "Could not reach the server." }); }
    setBusy(false);
  }
  async function updateStatus(id: string, status: Suggestion["status"], note: string) {
    const res = await fetch("/api/suggestions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update_status", id, status, note }) });
    const j = await res.json();
    if (res.ok) setItems(j.items);
  }

  return (
    <div className="bell" ref={ref}>
      <button type="button" className="bell-btn suggest-btn" onClick={() => setOpen((o) => !o)} aria-label="Suggest an improvement" title="Suggest an improvement">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <g stroke="#F2A93B" strokeWidth="1.6" strokeLinecap="round">
            <path d="M12 1v2M4.6 4.6l1.4 1.4M1 12h2M4.6 19.4l1.4-1.4M19.4 19.4l-1.4-1.4M23 12h-2M19.4 4.6l-1.4 1.4" />
          </g>
          <path d="M12 4.2a5.8 5.8 0 0 0-3.4 10.5c.5.4.8 1 .8 1.7v.5h5.2v-.5c0-.7.3-1.3.8-1.7A5.8 5.8 0 0 0 12 4.2Z" fill="#FFD569" stroke="#E8971A" strokeWidth="1.1" strokeLinejoin="round" />
          <path d="M10.2 8.6 12 10.4l2.2-2.2M12 10.4v3.2" stroke="#8A5A00" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M9.3 18.4h5.4M9.7 20h4.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className="bell-pop suggest-pop" role="dialog" aria-label="Suggest an improvement">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <b>Suggest an improvement</b>
            <button type="button" className="btn tiny" onClick={() => setOpen(false)}>Close</button>
          </div>
          <p className="bell-resize-hint">Drag the bottom-right corner to expand ↘</p>

          <div className="suggest-form">
            <div className="suggest-form-row">
              <label>Where<select value={where} onChange={(e) => setWhere(e.target.value)}>{WHERE.map((w) => <option key={w}>{w}</option>)}</select></label>
              <label>Category<select value={category} onChange={(e) => setCategory(e.target.value)}>{CATEGORY.map((c) => <option key={c}>{c}</option>)}</select></label>
            </div>
            <textarea rows={3} placeholder="What needs to be improved, and why?" value={description} onChange={(e) => setDescription(e.target.value)} />
            <button type="button" className="btn primary tiny" disabled={busy} onClick={submit}>{busy ? "Submitting…" : "Submit"}</button>
            {msg && <p className={`now-msg ${msg.ok ? "ok" : "err"}`} style={{ marginTop: 6 }}>{msg.text}</p>}
          </div>

          {items.length === 0 ? <p className="note">No suggestions yet — be the first.</p> : (
            <div className="tablewrap suggest-tablewrap">
              <table className="suggest-table">
                <thead><tr><th>Sl#</th><th>Suggestion Request</th><th>User</th><th>Date &amp; Time</th><th>Action</th></tr></thead>
                <tbody>{items.slice(0, 30).map((it, i) => <SuggestionRow key={it.id} n={i + 1} item={it} isSuper={isSuper} onUpdate={updateStatus} />)}</tbody>
              </table>
            </div>
          )}
        </div>)}
    </div>
  );
}

function SuggestionRow({ n, item, isSuper, onUpdate }: { n: number; item: Suggestion; isSuper: boolean; onUpdate: (id: string, status: Suggestion["status"], note: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState(item.status);
  const [note, setNote] = useState(item.note || "");
  return (
    <>
      <tr>
        <td className="muted">{n}</td>
        <td className="wrap">{item.description}<div className="muted" style={{ fontSize: 11 }}>{item.where} · {item.category}</div></td>
        <td>{item.submitted_by.split("@")[0]}<div className="muted" style={{ fontSize: 11 }}>{item.submitted_by}</div></td>
        <td className="muted">{fmtDateTime(item.submitted_at)}</td>
        <td>{isSuper
          ? <button type="button" className="btn tiny ghost" onClick={() => setEditing((v) => !v)}><span className={`status-plain ${STATUS_CLASS[item.status]}`}>{STATUS_LABEL[item.status]}</span></button>
          : <span className={`status-plain ${STATUS_CLASS[item.status]}`}>{STATUS_LABEL[item.status]}</span>}
          {item.note && <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{item.note}</div>}
        </td>
      </tr>
      {editing && (
        <tr>
          <td colSpan={5} className="suggest-edit-row">
            <select value={status} onChange={(e) => setStatus(e.target.value as Suggestion["status"])}>
              {(["received", "pending", "in_progress", "completed"] as const).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
            <input type="text" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <button type="button" className="btn tiny" onClick={() => { onUpdate(item.id, status, note); setEditing(false); }}>Save</button>
            <button type="button" className="btn tiny ghost" onClick={() => setEditing(false)}>Cancel</button>
          </td>
        </tr>
      )}
    </>
  );
}
