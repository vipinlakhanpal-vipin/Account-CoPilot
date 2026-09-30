"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const EXAMPLES = ["ADCB", "Dubai", "revenue > 250M", "employees > 500"];

// Header search bar: plain text searches company name/HQ location; "revenue"/"employees" with an operator and a
// number get translated (lib/globalSearch.ts) into the Discovery panel's own band filters. Submitting navigates to
// Accounts with those parsed as URL params — the panel applies and clears them (see CoPilotApp.tsx).
export default function GlobalSearchBar() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 2600); return () => clearInterval(t); }, []);

  function submit() {
    const query = q.trim();
    if (!query) return;
    router.push(`/?tab=accounts&gq=${encodeURIComponent(query)}`);
  }

  return (
    <div className="gsearch-group">
      <button type="button" className="gfilter-btn" title="Open advanced filters (Discovery panel)" aria-label="Open advanced filters"
        onClick={() => router.push("/?tab=accounts&openFilters=1")}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h12M4.5 8h7M7 12h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
      </button>
      <div className="gsearch">
        <svg className="gsearch-ico" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M11 11l3.3 3.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder={`Try: ${EXAMPLES[tick % EXAMPLES.length]}`} aria-label="Search the app" />
      </div>
    </div>
  );
}
