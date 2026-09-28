"use client";
import { useEffect, useMemo, useState } from "react";
import type { Row } from "@/lib/data";

// Custom filters for any table: pick a field that exists in the rows, a condition and a value. Several filters combine (all must match).
// Remembered per table in this browser.
type Op = "contains" | "is" | "not" | "starts" | "empty" | "filled" | "gte" | "lte";
export type CustomFilter = { field: string; op: Op; value: string };
const OPS: [Op, string][] = [["contains", "contains"], ["is", "is"], ["not", "is not"], ["starts", "starts with"], ["empty", "is empty"], ["filled", "is not empty"], ["gte", "≥"], ["lte", "≤"]];
const HIDE = /^(id|company_id|run_id|entity_id|profile|__|person_key|best_id|rows|sources_json)$|_id$|^__/;
const LABEL: Record<string, string> = {
  company_name: "Company", company: "Company", full_name: "Full name", title_verbatim: "Title", icp_status: "ICP status", icp_fit_reason: "ICP reason",
  revenue_usd_m: "Revenue (USD M, your data)", verified_revenue_usd_m: "Verified revenue (USD M)", verified_revenue_status: "Revenue evidence",
  s2p_signal_level: "S2P signal", existing_s2p_product: "Existing S2P", s2p_platform_status: "S2P status", erp: "ERP", hq_city: "HQ city",
  employee_range: "Employees", listing_status: "Listing", contact_tier: "Tier", role_family: "Role family", email_status: "Email status",
  linkedin_url: "LinkedIn", channel_state: "Channel", verification_status: "Verification", employment_status: "Employment", created_at: "Date added",
  updated_at: "Last updated", last_verified: "Last verified", account_s2p_signal: "Account S2P signal", source_type: "Source type", trust: "Trust",
};
export const labelOf = (k: string) => LABEL[k] || k.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()).replace(/\bUsd\b/, "USD").replace(/\bIcp\b/, "ICP").replace(/\bS2p\b/, "S2P");
const val = (r: Row, k: string) => { const v = r[k]; return v === null || v === undefined ? "" : Array.isArray(v) ? v.join(", ") : String(v); };

function test(r: Row, f: CustomFilter) {
  const v = val(r, f.field), x = f.value.trim().toLowerCase(), lv = v.toLowerCase();
  switch (f.op) {
    case "contains": return lv.includes(x);
    case "is": return lv === x;
    case "not": return lv !== x;
    case "starts": return lv.startsWith(x);
    case "empty": return !v.trim();
    case "filled": return !!v.trim();
    case "gte": case "lte": {
      const n = Number(v.replace(/[^0-9.-]/g, "")), t = Number(x.replace(/[^0-9.-]/g, ""));
      if (!isFinite(n) || !v.trim() || !isFinite(t)) return false;
      return f.op === "gte" ? n >= t : n <= t;
    }
  }
}

export function useCustomFilters(rows: Row[], storeKey: string) {
  const [list, setList] = useState<CustomFilter[]>([]);
  useEffect(() => { try { const s = localStorage.getItem(`cf:${storeKey}`); if (s) setList(JSON.parse(s)); } catch {} }, [storeKey]);
  const save = (l: CustomFilter[]) => { setList(l); try { localStorage.setItem(`cf:${storeKey}`, JSON.stringify(l)); } catch {} };
  // Fields that actually carry data in this table (first 300 rows), most-filled first.
  const fields = useMemo(() => {
    const count = new Map<string, number>();
    for (const r of rows.slice(0, 300)) for (const [k, v] of Object.entries(r)) {
      if (HIDE.test(k) || (v !== null && typeof v === "object" && !Array.isArray(v))) continue;
      if (val(r, k).trim()) count.set(k, (count.get(k) || 0) + 1);
    }
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  }, [rows]);
  const test_ = (r: Row) => list.every((f) => test(r, f));
  return { list, save, fields, test: test_ };
}

export function CustomFilterBar({ rows, cf }: { rows: Row[]; cf: ReturnType<typeof useCustomFilters> }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<CustomFilter>({ field: "", op: "contains", value: "" });
  const field = draft.field || cf.fields[0] || "";
  const values = useMemo(() => { const s = new Set(rows.map((r) => val(r, field)).filter(Boolean)); return s.size <= 40 ? [...s].sort() : null; }, [rows, field]);
  const numeric = useMemo(() => { const v = rows.map((r) => val(r, field)).filter(Boolean).slice(0, 50); return v.length > 0 && v.every((x) => isFinite(Number(x))); }, [rows, field]);
  const needsValue = draft.op !== "empty" && draft.op !== "filled";
  const add = () => { if (!field || (needsValue && !draft.value.trim())) return; cf.save([...cf.list, { ...draft, field }]); setDraft({ field, op: draft.op, value: "" }); setOpen(false); };
  return (
    <>
      <button type="button" className={`btn cf-add${cf.list.length ? " on" : ""}`} onClick={() => setOpen((x) => !x)}>+ Custom filter{cf.list.length ? ` (${cf.list.length})` : ""}</button>
      {open && (
        <div className="cf-builder" role="group" aria-label="Add a custom filter">
          <select aria-label="Field" value={field} onChange={(e) => setDraft({ ...draft, field: e.target.value, value: "" })}>
            {cf.fields.map((k) => <option key={k} value={k}>{labelOf(k)}</option>)}
          </select>
          <select aria-label="Condition" value={draft.op} onChange={(e) => setDraft({ ...draft, op: e.target.value as Op })}>
            {OPS.filter(([o]) => numeric || (o !== "gte" && o !== "lte")).map(([o, l]) => <option key={o} value={o}>{l}</option>)}
          </select>
          {needsValue && (values && (draft.op === "is" || draft.op === "not")
            ? <select aria-label="Value" value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })}><option value="">Choose…</option>{values.map((v) => <option key={v} value={v}>{v.length > 60 ? v.slice(0, 60) + "…" : v}</option>)}</select>
            : <input aria-label="Value" value={draft.value} placeholder={numeric ? "a number" : "text"} onChange={(e) => setDraft({ ...draft, value: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />)}
          <button type="button" className="btn primary" onClick={add} disabled={!field || (needsValue && !draft.value.trim())}>Add filter</button>
          <button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button>
        </div>
      )}
      {cf.list.length > 0 && (
        <div className="cf-chips">
          {cf.list.map((f, i) => (
            <span key={i} className="cf-chip">{labelOf(f.field)} <em>{OPS.find(([o]) => o === f.op)?.[1]}</em>{f.op !== "empty" && f.op !== "filled" ? ` "${f.value}"` : ""}
              <button type="button" aria-label="Remove filter" onClick={() => cf.save(cf.list.filter((_, j) => j !== i))}>×</button></span>
          ))}
          <button type="button" className="cf-clear" onClick={() => cf.save([])}>Clear all</button>
        </div>
      )}
    </>
  );
}
