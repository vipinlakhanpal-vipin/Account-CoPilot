"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

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
  const ref = useRef<HTMLDivElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 2600); return () => clearInterval(t); }, []);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
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

  return (
    <div className="gsearch-group" ref={ref}>
      <button type="button" className="gfilter-btn" title="Open advanced filters (Discovery panel)" aria-label="Open advanced filters"
        onClick={() => router.push("/?tab=accounts&openFilters=1")}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h12M4.5 8h7M7 12h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
      </button>
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
