"use client";
import { useMemo, useState } from "react";
import { ask, notify } from "@/components/Confirm";
import type { ConflictGroup } from "@/lib/conflicts";

const FIELD_CLASS: Record<string, string> = { Title: "title", Name: "name" };

function FieldBadge({ field }: { field: string }) {
  return <span className={`conflict-field ${FIELD_CLASS[field] || "other"}`}>conflict with {field}s</span>;
}

function Group({ g, isSuper, onResolved }: { g: ConflictGroup; isSuper: boolean; onResolved: () => void }) {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState(g.suggestedIndex >= 0 ? g.suggestedIndex : 0);
  const [busy, setBusy] = useState(false);
  const canResolve = isSuper && g.candidates.length > 1 && !g.resolved;

  async function apply() {
    const c = g.candidates[pick];
    if (!c) return;
    if (!(await ask({
      title: "Apply this value?", body: `${g.entity} — ${g.field}`,
      points: [`New value: "${c.value}"`, `Source${c.sources.length > 1 ? "s" : ""}: ${c.sources.join(", ")}`,
        "This updates the real record everywhere it's used (Accounts, Pipeline, Stakeholders) and clears this conflict."],
      confirm: "Apply", tone: "primary",
    }))) return;
    setBusy(true);
    try {
      const res = await fetch("/api/conflicts", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve", company_id: g.company_id, entity: g.entity, field: g.field, value: c.value, sources: c.sources }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) notify(j.error || "Could not apply.", "error"); else { notify("Resolved.", "ok"); onResolved(); }
    } catch { notify("Could not reach the server.", "error"); }
    setBusy(false);
  }

  return (
    <div className={`conflict-group${g.resolved ? " resolved" : ""}`}>
      <div className="conflict-group-head">
        <b>{g.entity}</b> <FieldBadge field={g.field} />
        {g.candidates.length > 1 && <span className="note conflict-merged">· {g.rowIds.length > 1 ? `${g.rowIds.length} reports merged` : "1 report"}</span>}
        {g.resolved && <span className="conflict-resolved-tag">✓ Resolved</span>}
      </div>
      <div className="conflict-candidates">
        {g.candidates.map((c, i) => (
          <div key={c.value} className={`conflict-candidate${i === g.suggestedIndex ? " suggested" : ""}`}>
            {canResolve && open && <input type="radio" name={g.key} checked={pick === i} onChange={() => setPick(i)} />}
            <div>
              <p>&ldquo;{c.value}&rdquo; {i === g.suggestedIndex && <span className="suggested-tag">Suggested</span>}</p>
              <p className="note">{c.sources.length > 1 ? <b>{c.sources.length} sources agree: </b> : null}{c.sources.join(", ") || "Source not recorded"}</p>
            </div>
          </div>
        ))}
      </div>
      {g.suggestedIndex === -1 && g.candidates.length > 1 && !g.resolved
        && <p className="note conflict-tied">No source outweighs the other here — pick based on judgment.</p>}
      {g.resolution && <p className="note">{g.resolution}</p>}
      {canResolve && (open
        ? <button type="button" className="btn tiny primary" disabled={busy} onClick={apply}>{busy ? "Applying…" : "Apply"}</button>
        : <button type="button" className="btn tiny" onClick={() => setOpen(true)}>Review &amp; resolve →</button>)}
    </div>
  );
}

/** Flat list (used inside the account brief, already scoped to one company) or grouped-by-company (the Conflicts tab). */
export default function ConflictGroupsView({ groups, isSuper, onResolved, byCompany = true }:
  { groups: ConflictGroup[]; isSuper: boolean; onResolved: () => void; byCompany?: boolean }) {
  const [q, setQ] = useState("");
  const [field, setField] = useState("");
  const fields = useMemo(() => [...new Set(groups.map((g) => g.field))], [groups]);
  const filtered = useMemo(() => groups.filter((g) =>
    (!field || g.field === field) && (!q || `${g.company} ${g.entity} ${g.field}`.toLowerCase().includes(q.toLowerCase()))), [groups, q, field]);
  const companies = useMemo(() => {
    const m = new Map<string, ConflictGroup[]>();
    for (const g of filtered) { const arr = m.get(g.company_id) || []; arr.push(g); m.set(g.company_id, arr); }
    return [...m.entries()];
  }, [filtered]);

  if (!byCompany) return <div className="conflicts-list">{filtered.map((g) => <Group key={g.key} g={g} isSuper={isSuper} onResolved={onResolved} />)}</div>;

  const unresolved = groups.filter((g) => !g.resolved).length;
  return (
    <div className="conflicts-panel">
      <div className="conflicts-head">
        <h3>Conflicts <span className="conflicts-count">{unresolved} unresolved · {companies.length} compan{companies.length === 1 ? "y" : "ies"}</span></h3>
        <p className="note">Grouped by company, then by person. <span className="conflict-field title">conflict with Title</span> and <span className="conflict-field name">conflict with Name</span> are colored differently so the type reads at a glance.</p>
      </div>
      <div className="conflicts-toolbar">
        <input type="text" placeholder="Search conflicts…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={field} onChange={(e) => setField(e.target.value)}>
          <option value="">Field: all</option>
          {fields.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>
      {companies.length === 0 && <p className="note">No conflicts match.</p>}
      {companies.map(([cid, gs]) => (
        <div key={cid} className="block conflict-company">
          <h4>{gs[0].company}</h4>
          <p className="note">{gs.filter((g) => !g.resolved).length} unresolved conflict{gs.filter((g) => !g.resolved).length === 1 ? "" : "s"}</p>
          {gs.map((g) => <Group key={g.key} g={g} isSuper={isSuper} onResolved={onResolved} />)}
        </div>
      ))}
    </div>
  );
}
