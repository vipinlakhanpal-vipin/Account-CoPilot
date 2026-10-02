"use client";
import { useState } from "react";
import { fmtDateTime } from "@/lib/dates";
import { ask } from "@/components/Confirm";
import type { Criteria } from "@/lib/icp";
import type { CustomFilter } from "@/components/CustomFilters";

export type TableFilters = { q: string; fv: string[]; cf: CustomFilter[] };
export type SavedReport = { id: string; name: string; criteria: Criteria; table_filters?: TableFilters; created_by: string; created_at: string; match_count: number };

const ViewIcon = () => <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 8s2.5-4.5 7-4.5S15 8 15 8s-2.5 4.5-7 4.5S1 8 1 8Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><circle cx="8" cy="8" r="2" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>;
const DeleteIcon = () => <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4.5h10M6 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M6.5 7.5v4.5M9.5 7.5v4.5M4 4.5l.6 8.4a1.2 1.2 0 0 0 1.2 1.1h4.4a1.2 1.2 0 0 0 1.2-1.1l.6-8.4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;

// Dashboard → Reports: save the current search/filter under a name, and revisit it later — re-run live against
// current data (not a frozen snapshot), so a saved report's numbers stay current. Captures both the Discovery
// panel's criteria AND the table's own search box / dropdowns / custom filter (table_filters), since the table
// often does all the narrowing on its own — a save that dropped that part would reopen as if nothing was filtered.
//
// Split in two so Save can sit right next to the live filtered count (inside the table's own toggle row), while
// the list of saved reports stays in its own box above — both share `items` via the parent (tab === "reports").

export function SaveReportButton({ criteria, tableState, onSaved }:
  { criteria: Criteria; tableState: TableFilters & { count: number }; onSaved: (items: SavedReport[]) => void }) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/reports", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", name: name.trim(), criteria,
          table_filters: { q: tableState.q, fv: tableState.fv, cf: tableState.cf }, match_count: tableState.count }) });
      const j = await res.json();
      if (res.ok) { onSaved(j.items); setNaming(false); setName(""); }
    } catch { /* best-effort */ }
    setBusy(false);
  }

  return naming ? (
    <div className="saved-reports-naming saved-reports-naming-inline">
      <input type="text" placeholder="Name this report" value={name} onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()} autoFocus />
      <button type="button" className="btn tiny primary" disabled={busy || !name.trim()} onClick={save}>{busy ? "Saving…" : "Save"}</button>
      <button type="button" className="btn tiny ghost" onClick={() => { setNaming(false); setName(""); }}>Cancel</button>
    </div>
  ) : <button type="button" className="btn tiny primary" onClick={() => setNaming(true)}>💾 Save this report ({tableState.count.toLocaleString()})</button>;
}

export default function SavedReportsList({ items, onOpen, onDelete }:
  { items: SavedReport[]; onOpen: (c: Criteria, tf: TableFilters, name: string) => void; onDelete: (items: SavedReport[]) => void }) {
  async function del(it: SavedReport) {
    if (!(await ask({ title: "Delete this saved report?", body: it.name, points: ["This can't be undone."], confirm: "Delete", tone: "danger" }))) return;
    try {
      const res = await fetch("/api/reports", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: it.id }) });
      const j = await res.json();
      if (res.ok) onDelete(j.items);
    } catch { /* best-effort */ }
  }

  return (
    <div className="saved-reports">
      <div className="saved-reports-head"><h4>Saved reports</h4></div>
      {items.length === 0 ? <p className="note">No saved reports yet — use &quot;Save this report&quot; next to the filtered count below.</p> : (
        <div className="tablewrap">
          <table><thead><tr><th>Name</th><th>Created by</th><th>Created</th><th>Contacts</th><th></th></tr></thead>
            <tbody>{items.map((it) => (
              <tr key={it.id}>
                <td><b>{it.name}</b></td>
                <td className="muted">{it.created_by}</td>
                <td className="muted">{fmtDateTime(it.created_at)}</td>
                <td className="muted">{it.match_count}</td>
                <td className="saved-reports-row-actions">
                  <button type="button" className="btn icon" title="Open this report" aria-label="Open this report"
                    onClick={() => onOpen(it.criteria, it.table_filters || { q: "", fv: [], cf: [] }, it.name)}><ViewIcon /></button>
                  <button type="button" className="btn icon danger" title="Delete this report" aria-label="Delete this report" onClick={() => del(it)}><DeleteIcon /></button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
