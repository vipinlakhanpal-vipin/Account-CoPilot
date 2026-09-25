"use client";
import { useSearchParams } from "next/navigation";
import { ALL, COUNTRIES, DEFAULT_COUNTRY } from "@/lib/countries";

// Country tiles under the main nav. Selecting one filters the dashboard and every tab to that country (kept in ?country=).
export default function CountryBar({ counts }: { counts: Record<string, number> }) {
  const params = useSearchParams();
  const current = params.get("country") || DEFAULT_COUNTRY;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const pick = (code: string) => {
    const q = new URLSearchParams(params.toString());
    if (code === DEFAULT_COUNTRY) q.delete("country"); else q.set("country", code);
    const s = q.toString();
    window.history.pushState(null, "", s ? `/?${s}` : "/");
  };
  const tiles = [{ code: ALL, name: "All countries", flag: "🌍" }, ...COUNTRIES];
  return (
    <div className="countrybar" role="tablist" aria-label="Country">
      {tiles.map((c) => {
        const n = c.code === ALL ? total : counts[c.code] || 0;
        return (
          <button key={c.code} type="button" role="tab" aria-selected={current === c.code} className={`ctile${n ? "" : " empty"}`} onClick={() => pick(c.code)}
            title={n ? `${n} accounts in ${c.name}` : `${c.name}: no accounts yet (coming soon)`}>
            <span className="flag" aria-hidden="true">{c.flag}</span><span className="cname">{c.name}</span>
            <span className="ccount">{n ? n : "soon"}</span>
          </button>
        );
      })}
    </div>
  );
}
