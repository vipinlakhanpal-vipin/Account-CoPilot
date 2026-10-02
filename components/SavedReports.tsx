"use client";
import { useEffect, useState } from "react";
import { fmtDateTime } from "@/lib/dates";
import type { Criteria } from "@/lib/icp";
import type { CustomFilter } from "@/components/CustomFilters";

type TableFilters = { q: string; fv: string[]; cf: CustomFilter[] };
type SavedReport = { id: string; name: string; criteria: Criteria; table_filters?: TableFilters; created_by: string; created_at: string; match_count: number };

// Dashboard → Reports: save the current search/filter under a name, and revisit it later — re-run live against
// current data (not a frozen snapshot), so a saved report's numbers stay current. Captures both the Discovery
// panel's criteria AND the table's own search box / dropdowns / custom filter (table_filters), since the table
// often does all the narrowing on its own — a save that dropped that part would reopen as if nothing was filtered.
export default function SavedReports({ criteria, tableState, onOpen }:
  { criteria: Criteria; tableState: TableFilters & { count: number }; onOpen: (c: Criteria, tf: TableFilters) => void }) {
  const [items, setItems] = useState<SavedReport[]>([]);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => fetch("/api/reports").then((r) => (r.ok ? r.json() : null)).then((j) => j && setItems(j.items || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/reports", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", name: name.trim(), criteria,
          table_filters: { q: tableState.q, fv: tableState.fv, cf: tableState.cf }, match_count: tableState.count }) });
      const j = await res.json();
      if (res.ok) { setItems(j.items); setNaming(false); setName(""); }
    } catch { /* best-effort */ }
    setBusy(false);
  }

  return (
    <div className="saved-reports">
      <div className="saved-reports-head">
        <h4>Saved reports</h4>
        {naming ? (
          <div className="saved-reports-naming">
            <input type="text" placeholder="Name this report" value={name} onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()} autoFocus />
            <button type="button" className="btn tiny primary" disabled={busy || !name.trim()} onClick={save}>{busy ? "Saving…" : "Save"}</button>
            <button type="button" className="btn tiny ghost" onClick={() => { setNaming(false); setName(""); }}>Cancel</button>
          </div>
        ) : <button type="button" className="btn tiny primary" onClick={() => setNaming(true)}>💾 Save this report</button>}
      </div>
      {items.length === 0 ? <p className="note">No saved reports yet.</p> : (
        <div className="tablewrap">
          <table><thead><tr><th>Name</th><th>Created by</th><th>Created</th><th>Contacts</th><th></th></tr></thead>
            <tbody>{items.map((it) => (
              <tr key={it.id}>
                <td><b>{it.name}</b></td>
                <td className="muted">{it.created_by}</td>
                <td className="muted">{fmtDateTime(it.created_at)}</td>
                <td className="muted">{it.match_count}</td>
                <td><button type="button" className="btn tiny" onClick={() => onOpen(it.criteria, it.table_filters || { q: "", fv: [], cf: [] })}>Open →</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
