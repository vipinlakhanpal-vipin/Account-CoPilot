"use client";
import { useMemo } from "react";
import type { CSSProperties } from "react";
import type { Row } from "@/lib/data";
import { EVIDENCE_KINDS, evidenceKind, exchangeOf, originOf, type EvidenceKind } from "@/lib/sources";

// Dashboard: where the data came from. Left, the evidence behind the facts (one bucket per source record: stock exchanges,
// reports, websites, press releases, news, blogs, LinkedIn snippets …); right, how each account entered the app, with the
// Excel uploads split into rows that were new and rows that were already in the app.
const KIND_COLOR: Record<EvidenceKind, string> = {
  "Stock exchanges & regulators": "#2ECC8F", "Annual & results reports": "#3AA0FF", "Company websites & portals": "#5AD1FF", "Press releases": "#9B6BFF",
  "News & business press": "#C9B8FF", "Blogs": "#E052C8", "LinkedIn (public snippets)": "#6C7BFF", "Job postings": "#2EC4A6", "Seamless.ai": "#F5A623",
  "Data aggregators & estimates": "#FF8A95", "Your confirmations": "#F2C46B", "Other / not stated": "#8896A8",
};
type Drill = (title: string, rows: Row[]) => void;

function Rows({ items, max, onPick }: { items: { name: string; n: number; sub?: string; color: string; rows: Row[] }[]; max: number; onPick: Drill }) {
  return (
    <div className="bars src-bars">
      {items.map((it) => (
        <button type="button" key={it.name} className="bar sigbar region-compare-row" style={{ "--c": it.color } as CSSProperties}
          disabled={it.rows.length === 0} title={`${it.name}: ${it.n}${it.sub ? ` (${it.sub})` : ""}${it.rows.length ? " — click to list the accounts" : ""}`} onClick={() => onPick(it.name, it.rows)}>
          <span className="lab">{it.name}</span>
          <span className="trk"><span className="fill" style={{ width: `${(it.n / max) * 100}%` }} /></span>
          <span className="n">{it.n.toLocaleString()}</span>
        </button>
      ))}
    </div>
  );
}

/** A file name as its first two words (without .xlsx); the full name shows on hover. */
const shortFile = (name: unknown) => {
  const base = String(name ?? "").replace(/\.(xlsx|xls)$/i, "").trim(), words = base.split(/[\s_]+/).filter(Boolean);
  return words.length > 2 ? `${words.slice(0, 2).join(" ")}…` : base;
};

export default function SourceChart({ accounts, sources, uploads, country, onDrill }: { accounts: Row[]; sources: Row[]; uploads: Row[]; country: string; onDrill: Drill }) {
  const byId = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const ev = useMemo(() => {
    const m = new Map<EvidenceKind, { n: number; cos: Set<string> }>();
    const ex = new Map<string, { n: number; cos: Set<string> }>();
    for (const s of sources) {
      if (!byId.has(s.company_id)) continue;
      const k = evidenceKind(s);
      const e = m.get(k) || m.set(k, { n: 0, cos: new Set() }).get(k)!; e.n++; e.cos.add(s.company_id);
      const x = k === "Stock exchanges & regulators" ? exchangeOf(s) : "";
      if (x) { const y = ex.get(x) || ex.set(x, { n: 0, cos: new Set() }).get(x)!; y.n++; y.cos.add(s.company_id); }
    }
    const rowsOf = (cos: Set<string>) => [...cos].map((id) => byId.get(id)!).filter(Boolean);
    const kinds = EVIDENCE_KINDS.map((k) => ({ name: k, n: m.get(k)?.n || 0, sub: `${m.get(k)?.cos.size || 0} accounts`, color: KIND_COLOR[k], rows: rowsOf(m.get(k)?.cos || new Set()) }));
    const exchanges = [...ex.entries()].sort((a, b) => b[1].n - a[1].n).map(([name, v]) => ({ name, n: v.n, sub: `${v.cos.size} accounts`, color: KIND_COLOR["Stock exchanges & regulators"], rows: rowsOf(v.cos) }));
    return { kinds, exchanges, total: [...m.values()].reduce((s, v) => s + v.n, 0) };
  }, [sources, byId]);

  const origin = useMemo(() => {
    const groups: [string, string, (a: Row) => boolean][] = [
      ["Your Excel workbook", "#3AA0FF", (a) => originOf(a) === "workbook"],
      ["Excel uploaded (wizard)", "#E052C8", (a) => (a.lists || []).some((l: string) => String(l).startsWith("User upload:"))],
      ["Seamless discovery", "#F5A623", (a) => originOf(a) === "seamless-discovery"],
      ["Claude discovery", "#5AD1FF", (a) => originOf(a) === "claude-discovery"],
      ["Claude research", "#2ECC8F", (a) => originOf(a) === "claude-research"],
      ["Your Coupa customer list", "#F2C46B", (a) => originOf(a) === "user-list" && !(a.lists || []).some((l: string) => String(l).startsWith("User upload:"))],
    ];
    const seen = new Set<string>();
    return groups.map(([name, color, f]) => { const rows = accounts.filter((a) => !seen.has(a.id) && f(a)); rows.forEach((a) => seen.add(a.id)); return { name, n: rows.length, color, rows }; });
  }, [accounts]);

  const ups = uploads.filter((u) => country === "All" || u.region === country);
  const upNew = ups.reduce((s, u) => s + (u.added || 0), 0), upOld = ups.reduce((s, u) => s + (u.already || 0), 0);
  const maxEv = Math.max(1, ...ev.kinds.map((k) => k.n)), maxOr = Math.max(1, ...origin.map((o) => o.n));
  return (
    <>
      <div className="grid2">
        <div className="panel">
          <h2 className="with-count">Data sources by type <span className="count">{ev.total.toLocaleString()} source records</span></h2>
          <Rows items={ev.kinds} max={maxEv} onPick={(t, r) => onDrill(`Sources: ${t}`, r)} />
          <p className="note" style={{ marginTop: 8 }}>Every fact keeps its source. Click a bar to list its accounts. LinkedIn counts public search snippets only. Blogs are matched by link or title, so that count is small.</p>
        </div>
        <div className="panel">
          <h2>Accounts by how they entered the app</h2>
          <Rows items={origin} max={maxOr} onPick={(t, r) => onDrill(t, r)} />
          <p className="note" style={{ marginTop: 8 }}>Each account is counted once, under the way it first came in.</p>
        </div>
        {ev.exchanges.length > 0 && (
          <div className="panel">
            <h2>Stock exchanges and regulators cited</h2>
            <Rows items={ev.exchanges} max={Math.max(1, ...ev.exchanges.map((e) => e.n))} onPick={(t, r) => onDrill(`Filings from ${t}`, r)} />
          </div>
        )}
        <div className="panel">
          <h2 className="with-count">Excel uploads in the Setup wizard {ups.length > 0 && <span className="count">{upNew} new · {upOld} already in the app</span>}</h2>
          {ups.length === 0 ? <p className="note">No Excel list uploaded{country === "All" ? "" : " for this country"} yet.</p> : (
            <div className="tablewrap"><table><thead><tr><th>File</th><th>Country</th><th>Rows</th><th>New</th><th>Already in app</th><th>Status</th></tr></thead>
              <tbody>{ups.map((u) => <tr key={u.id}><td title={u.filename}>{shortFile(u.filename)}</td><td>{u.region}</td><td>{u.rows ?? "—"}</td><td>{u.added ?? "—"}</td><td>{u.already ?? "—"}</td><td>{u.status === "done" ? "Read in" : u.status === "waiting" ? "Waiting" : u.status}</td></tr>)}</tbody></table></div>
          )}
        </div>
      </div>
    </>
  );
}
