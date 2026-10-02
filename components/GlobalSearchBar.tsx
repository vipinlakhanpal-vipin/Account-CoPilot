"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { OPS, ACCOUNT_FIELDS, labelOf, type CustomFilter, type Op } from "@/components/CustomFilters";

const EXAMPLES = ["ADCB", "Dubai", "revenue > 250M", "employees > 500", "icp = verified", "listing = listed", "signal = strong"];
type Item = { slug: string; company_name: string; country: string; region: string; icp_status: string; revenue: string; listing_status: string };
const ICP_CLASS: Record<string, string> = { "ICP — Verified": "st-v", "ICP — Likely": "st-l", "Not ICP": "st-n" };

// Header search bar: plain text searches company name/HQ location; "revenue"/"employees"/"icp"/"listing"/"signal"
// with an operator and a value get parsed (lib/globalSearch.ts) into the Discovery panel's own filters. Results show
// in a dropdown (same pattern as the bell/suggestions popover); a link at the bottom opens Accounts with the same
// filter applied, but only when clicked — never automatically.
export default function GlobalSearchBar() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{ total: number; items: Item[] } | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [list, setList] = useState<CustomFilter[]>([]);
  const [draft, setDraft] = useState<CustomFilter>({ field: ACCOUNT_FIELDS[0], op: "contains", value: "" });
  const ref = useRef<HTMLDivElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 2600); return () => clearInterval(t); }, []);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setFilterOpen(false); } };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  async function runSearch(query: string) {
    if (!query) { setResult(null); setOpen(false); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const j = await res.json();
      setResult(j); setOpen(true);
    } catch { setResult({ total: 0, items: [] }); setOpen(true); }
    setBusy(false);
  }

  function onChange(v: string) {
    setQ(v);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => runSearch(v.trim()), 350);
  }
  function onEnter() {
    if (debounce.current) clearTimeout(debounce.current);
    runSearch(q.trim());
  }
  function viewAllInAccounts() {
    setOpen(false);
    router.push(`/?tab=accounts&gq=${encodeURIComponent(q.trim())}`);
  }
  function openAccount(item: Item) {
    setOpen(false);
    router.push(`/?open=${encodeURIComponent(item.slug)}&country=${encodeURIComponent(item.region)}`);
  }

  const needsValue = draft.op !== "empty" && draft.op !== "filled";
  function addCondition() {
    if (!draft.field || (needsValue && !draft.value.trim())) return;
    setList([...list, draft]);
    setDraft({ field: draft.field, op: draft.op, value: "" });
  }
  function applyToAccounts() {
    const conditions = needsValue && draft.field && draft.value.trim() ? [...list, draft] : list;
    if (!conditions.length) return;
    try { localStorage.setItem("cf:Accounts", JSON.stringify(conditions)); } catch {}
    setFilterOpen(false); setList([]); setDraft({ field: ACCOUNT_FIELDS[0], op: "contains", value: "" });
    // A full navigation (not router.push) so the Accounts table remounts and picks up the filter just written to
    // localStorage, even if you're already on Accounts — a soft navigation wouldn't remount an already-open tab.
    window.location.href = "/?tab=accounts";
  }

  return (
    <div className="gsearch-group" ref={ref}>
      <div className="gfilter-wrap">
        <button type="button" className="gfilter-btn" title="Build a custom filter" aria-label="Build a custom filter" aria-expanded={filterOpen}
          onClick={() => { setFilterOpen((x) => !x); setOpen(false); }}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h12M4.5 8h7M7 12h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        </button>
        {filterOpen && (
          <div className="gfilter-pop cf-builder" role="dialog" aria-label="Build a custom filter">
            <p className="note" style={{ flexBasis: "100%", margin: "0 0 2px" }}>Build a filter on Accounts — same field / condition / value as any table&apos;s custom filter.</p>
            <select aria-label="Field" value={draft.field} onChange={(e) => setDraft({ ...draft, field: e.target.value, value: "" })}>
              {ACCOUNT_FIELDS.map((k) => <option key={k} value={k}>{labelOf(k)}</option>)}
            </select>
            <select aria-label="Condition" value={draft.op} onChange={(e) => setDraft({ ...draft, op: e.target.value as Op })}>
              {/* "is any of" / "is none of" need a real pick-list (like a table's own custom filter offers) to be usable — this
                  builder has no loaded rows to draw one from, so those two are left out here rather than becoming a confusing free-text box. */}
              {OPS.filter(([o]) => o !== "in" && o !== "notin").map(([o, l]) => <option key={o} value={o}>{l}</option>)}
            </select>
            {needsValue && <input aria-label="Value" value={draft.value} placeholder="text or a number" onChange={(e) => setDraft({ ...draft, value: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter") addCondition(); }} />}
            <button type="button" className="btn" onClick={addCondition} disabled={!draft.field || (needsValue && !draft.value.trim())}>+ Add condition</button>
            {list.length > 0 && (
              <div className="cf-chips">
                {list.map((f, i) => (
                  <span key={i} className="cf-chip">{labelOf(f.field)} <em>{OPS.find(([o]) => o === f.op)?.[1]}</em>{f.op !== "empty" && f.op !== "filled" ? ` "${f.value}"` : ""}
                    <button type="button" aria-label="Remove condition" onClick={() => setList(list.filter((_, j) => j !== i))}>×</button></span>
                ))}
              </div>
            )}
            <button type="button" className="btn primary" style={{ flexBasis: "100%" }} onClick={applyToAccounts}
              disabled={!list.length && !(needsValue && draft.value.trim())}>Apply to Accounts →</button>
          </div>
        )}
      </div>
      <div className="gsearch">
        {busy ? <span className="gsearch-spin" aria-hidden="true" /> : <svg className="gsearch-ico" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M11 11l3.3 3.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>}
        <input type="search" value={q} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onEnter()}
          onFocus={() => q.trim() && result && setOpen(true)} placeholder={`Try: ${EXAMPLES[tick % EXAMPLES.length]}`} aria-label="Search the app" />
        {busy && <span className="gsearch-busy-text">Searching…</span>}

        {open && result && (
          <div className="gsearch-pop" role="dialog" aria-label="Search results">
            {result.items.length === 0 ? <p className="note">No matches for &quot;{q}&quot;.</p> : (
              <div className="tablewrap gsearch-tablewrap">
                <table className="suggest-table">
                  <thead><tr><th>Company</th><th>Region</th><th>ICP Status</th><th>Revenue</th></tr></thead>
                  <tbody>{result.items.map((it) => (
                    <tr key={it.slug} className="click" onClick={() => openAccount(it)}>
                      <td className="wrap">{it.company_name}</td>
                      <td className="muted">{it.region}</td>
                      <td><span className={`status-plain ${ICP_CLASS[it.icp_status] || "sg-received"}`}>{it.icp_status}</span></td>
                      <td className="muted">{it.revenue || "—"}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
            {result.total > 0 && (
              <button type="button" className="btn tiny gsearch-viewall" onClick={viewAllInAccounts}>
                View all {result.total} in Accounts →
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
