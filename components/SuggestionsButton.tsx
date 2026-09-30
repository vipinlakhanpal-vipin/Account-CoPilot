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
      <button type="button" className="bell-btn" onClick={() => setOpen((o) => !o)} aria-label="Suggest an improvement" title="Suggest an improvement">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.6a4.4 4.4 0 0 0-2.6 7.9c.4.3.6.8.6 1.3v.4h4v-.4c0-.5.2-1 .6-1.3A4.4 4.4 0 0 0 8 1.6Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /><path d="M6 13.4h4M6.5 14.6h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
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

          <div className="suggest-list">
            {items.length === 0 ? <p className="note">No suggestions yet — be the first.</p>
              : items.slice(0, 30).map((it) => <SuggestionRow key={it.id} item={it} isSuper={isSuper} onUpdate={updateStatus} />)}
          </div>
        </div>)}
    </div>
  );
}

function SuggestionRow({ item, isSuper, onUpdate }: { item: Suggestion; isSuper: boolean; onUpdate: (id: string, status: Suggestion["status"], note: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState(item.status);
  const [note, setNote] = useState(item.note || "");
  return (
    <div className="suggest-item">
      <div className="suggest-item-head">
        <span className={`status-plain ${STATUS_CLASS[item.status]}`}>{STATUS_LABEL[item.status]}</span>
        <span className="hint">{item.where} · {item.category}</span>
      </div>
      <p className="wrap">{item.description}</p>
      <small className="muted">{item.submitted_by} · {fmtDateTime(item.submitted_at)}</small>
      {item.note && <p className="note" style={{ marginTop: 4 }}>{item.note}</p>}
      {isSuper && (editing ? (
        <div className="suggest-edit">
          <select value={status} onChange={(e) => setStatus(e.target.value as Suggestion["status"])}>
            {(["received", "pending", "in_progress", "completed"] as const).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
          <input type="text" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <button type="button" className="btn tiny" onClick={() => { onUpdate(item.id, status, note); setEditing(false); }}>Save</button>
          <button type="button" className="btn tiny ghost" onClick={() => setEditing(false)}>Cancel</button>
        </div>
      ) : <button type="button" className="btn tiny ghost" onClick={() => setEditing(true)}>Update status</button>)}
    </div>
  );
}
