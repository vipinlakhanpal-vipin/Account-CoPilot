"use client";
import { useEffect, useMemo, useState } from "react";
import type { Row } from "@/lib/data";

// Custom filters for any table: pick a field that exists in the rows, a condition and a value. Several filters combine (all must match).
// Remembered per table in this browser.
export type Op = "contains" | "is" | "not" | "starts" | "in" | "notin" | "empty" | "filled" | "gte" | "lte";
export type CustomFilter = { field: string; op: Op; value: string };
export const OPS: [Op, string][] = [["contains", "contains"], ["is", "is"], ["not", "is not"], ["starts", "starts with"], ["in", "is any of"], ["notin", "is none of"],
  ["filled", "is known"], ["empty", "is unknown"], ["gte", "≥"], ["lte", "≤"]];
// "is any of" / "is none of" store several picked values in one CustomFilter.value, joined by this separator —
// a real \t or \n could plausibly appear in a value (e.g. a notes field); this control character can't.
const MULTI_SEP = "␟";
// Curated for the header's filter builder, which has no loaded rows to detect real fields from (unlike a table's own
// custom filter, which only offers fields that actually appear in that table's data) — every scalar field the
// Accounts table itself reads off a company row.
export const ACCOUNT_FIELDS = [
  "company_name", "industry", "country", "icp_status", "icp_fit_reason",
  "revenue_usd_m", "verified_revenue_usd_m", "verified_revenue_status",
  "employee_range", "listing_status", "ownership", "exchange", "ticker", "parent_company",
  "s2p_signal_level", "s2p_strong_signals", "existing_s2p_product", "existing_s2p_detail", "s2p_platform_status",
  "erp", "erp_status", "erp_evidence", "known_implementation_partner",
  "coupa_opportunity_type", "ariba_opportunity_type", "potential_opportunity",
  "procurement_model", "procurement_transformation_signals", "digital_transformation_signals",
  "hq_city", "company_website", "board_phone", "subsidiaries", "lists", "account_notes",
];
const HIDE = /^(id|company_id|run_id|entity_id|profile|__|person_key|best_id|rows|sources_json)$|_id$|^__/;
const LABEL: Record<string, string> = {
  company_name: "Company", company: "Company", full_name: "Full name", title_verbatim: "Title", icp_status: "ICP status", icp_fit_reason: "ICP reason",
  icp_match_pct: "ICP Match %", opportunity_pct: "Opportunity %", coupa_fit_pct: "Coupa Fit %", rank_pct: "Pipeline Rank %", entity_type: "Entity",
  revenue_usd_m: "Revenue (USD M, your data)", verified_revenue_usd_m: "Verified revenue (USD M)", verified_revenue_status: "Revenue evidence",
  s2p_signal_level: "S2P signal", existing_s2p_product: "Existing S2P", s2p_platform_status: "S2P status", erp: "ERP", erp_status: "ERP status",
  erp_evidence: "ERP evidence", hq_city: "HQ city",
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
    case "in": case "notin": {
      const picked = f.value.split(MULTI_SEP).map((p) => p.trim().toLowerCase()).filter(Boolean);
      const hit = picked.includes(lv);
      return f.op === "in" ? hit : !hit;
    }
    case "empty": return !v.trim();
    case "filled": return !!v.trim();
    case "gte": case "lte": {
      const n = Number(v.replace(/[^0-9.-]/g, "")), t = Number(x.replace(/[^0-9.-]/g, ""));
      if (!isFinite(n) || !v.trim() || !isFinite(t)) return false;
      return f.op === "gte" ? n >= t : n <= t;
    }
  }
}

// seed overrides what's remembered in this browser — used when opening a saved report, so its exact custom
// filter is restored instead of whatever was last left in this table (the caller forces a remount for a new
// seed to take effect, since this only reads it once per mount, same as the localStorage read below).
// visibleFields: the raw keys the table's own columns actually show (from ColDef.field) — when given, the field
// picker offers only those, so you can't build a filter on data you can't see in the results next to it. Falls
// back to every field on the row when a table passes none (keeps old behavior rather than offering nothing).
export function useCustomFilters(rows: Row[], storeKey: string, seed?: CustomFilter[], visibleFields?: string[]) {
  const [list, setList] = useState<CustomFilter[]>(seed || []);
  useEffect(() => {
    if (seed) { try { localStorage.setItem(`cf:${storeKey}`, JSON.stringify(seed)); } catch {} return; }
    try { const s = localStorage.getItem(`cf:${storeKey}`); if (s) setList(JSON.parse(s)); } catch {}
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [storeKey]);
  const save = (l: CustomFilter[]) => { setList(l); try { localStorage.setItem(`cf:${storeKey}`, JSON.stringify(l)); } catch {} };
  // Fields that actually carry data in this table (first 300 rows), most-filled first.
  const fields = useMemo(() => {
    const allow = visibleFields && visibleFields.length ? new Set(visibleFields) : null;
    const count = new Map<string, number>();
    for (const r of rows.slice(0, 300)) for (const [k, v] of Object.entries(r)) {
      if (HIDE.test(k) || (v !== null && typeof v === "object" && !Array.isArray(v)) || (allow && !allow.has(k))) continue;
      if (val(r, k).trim()) count.set(k, (count.get(k) || 0) + 1);
    }
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  }, [rows, visibleFields]);
  const test_ = (r: Row) => list.every((f) => test(r, f));
  return { list, save, fields, test: test_ };
}

export function CustomFilterBar({ rows, cf }: { rows: Row[]; cf: ReturnType<typeof useCustomFilters> }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<CustomFilter>({ field: "", op: "contains", value: "" });
  // Set when a chip was clicked to edit it (not just toggled open fresh) — "Add filter" then replaces that one
  // condition in place instead of appending a duplicate.
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const field = draft.field || cf.fields[0] || "";
  // Real values seen in this field, to pick from instead of guessing/typing one — e.g. Title has hundreds of
  // distinct values, too many for a plain dropdown, but still worth offering as type-to-filter suggestions.
  // A field where almost every value is unique (name, email, company) gets no suggestions — picking from those
  // is the same as typing, and near-1000 identical-looking options would just be noise.
  const values = useMemo(() => {
    const s = new Set(rows.map((r) => val(r, field)).filter(Boolean));
    return s.size > 0 && s.size <= 1500 && s.size < rows.length * 0.6 ? [...s].sort() : null;
  }, [rows, field]);
  const numeric = useMemo(() => { const v = rows.map((r) => val(r, field)).filter(Boolean).slice(0, 50); return v.length > 0 && v.every((x) => isFinite(Number(x))); }, [rows, field]);
  const needsValue = draft.op !== "empty" && draft.op !== "filled";
  const isMulti = draft.op === "in" || draft.op === "notin";
  const picked = useMemo(() => new Set(draft.value.split(MULTI_SEP).filter(Boolean)), [draft.value]);
  const [pickFilter, setPickFilter] = useState("");
  const togglePick = (v: string) => {
    const next = new Set(picked);
    if (next.has(v)) next.delete(v); else next.add(v);
    setDraft({ ...draft, value: [...next].join(MULTI_SEP) });
  };
  const add = () => {
    if (!field || (needsValue && !draft.value.trim())) return;
    const next = { ...draft, field };
    cf.save(editIndex !== null ? cf.list.map((f, i) => (i === editIndex ? next : f)) : [...cf.list, next]);
    setDraft({ field, op: draft.op, value: "" }); setEditIndex(null); setPickFilter(""); setOpen(false);
  };
  const cancel = () => { setOpen(false); setEditIndex(null); };
  const editChip = (i: number) => { setDraft(cf.list[i]); setEditIndex(i); setPickFilter(""); setOpen(true); };
  return (
    <>
      <button type="button" className={`btn cf-add${cf.list.length ? " on" : ""}`}
        onClick={() => { setOpen((x) => !x); setEditIndex(null); setDraft({ field: "", op: "contains", value: "" }); }}>+ Custom filter{cf.list.length ? ` (${cf.list.length})` : ""}</button>
      {open && (
        <div className="cf-builder" role="group" aria-label="Add a custom filter">
          <select aria-label="Field" value={field} onChange={(e) => setDraft({ ...draft, field: e.target.value, value: "" })}>
            {cf.fields.map((k) => <option key={k} value={k}>{labelOf(k)}</option>)}
          </select>
          <select aria-label="Condition" value={draft.op} onChange={(e) => setDraft({ ...draft, op: e.target.value as Op, value: "" })}>
            {OPS.filter(([o]) => (numeric || (o !== "gte" && o !== "lte")) && (values || (o !== "in" && o !== "notin"))).map(([o, l]) => <option key={o} value={o}>{l}</option>)}
          </select>
          {needsValue && isMulti && values ? (
            <div className="cf-multipick">
              <input aria-label="Search values" placeholder={`Search ${values.length} ${labelOf(field).toLowerCase()} values…`} value={pickFilter} onChange={(e) => setPickFilter(e.target.value)} />
              <div className="cf-multipick-list">
                {values.filter((v) => v.toLowerCase().includes(pickFilter.trim().toLowerCase())).map((v) => (
                  <label key={v}><input type="checkbox" checked={picked.has(v)} onChange={() => togglePick(v)} />{v}</label>
                ))}
              </div>
              {picked.size > 0 && <p className="note">{picked.size} picked</p>}
            </div>
          ) : needsValue && (values && (draft.op === "is" || draft.op === "not") ? (
            <>
              <input aria-label="Value" list={`cf-vals-${field}`} value={draft.value} placeholder={`Pick or type a ${labelOf(field).toLowerCase()}…`}
                onChange={(e) => setDraft({ ...draft, value: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
              <datalist id={`cf-vals-${field}`}>{values.map((v) => <option key={v} value={v} />)}</datalist>
            </>
          ) : (
            <input aria-label="Value" value={draft.value} placeholder={numeric ? "a number" : "text"} onChange={(e) => setDraft({ ...draft, value: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
          ))}
          <button type="button" className="btn primary" onClick={add} disabled={!field || (needsValue && !draft.value.trim())}>{editIndex !== null ? "Save filter" : "Add filter"}</button>
          <button type="button" className="btn" onClick={cancel}>Cancel</button>
        </div>
      )}
      {cf.list.length > 0 && (
        <div className="cf-chips">
          {cf.list.map((f, i) => (
            <span key={i} className={`cf-chip${editIndex === i ? " editing" : ""}`}>
              <button type="button" className="cf-chip-body" onClick={() => editChip(i)} title="Click to edit this filter">{labelOf(f.field)} <em>{OPS.find(([o]) => o === f.op)?.[1]}</em>
                {f.op !== "empty" && f.op !== "filled" ? ` "${(f.op === "in" || f.op === "notin") ? f.value.split(MULTI_SEP).filter(Boolean).join(", ") : f.value}"` : ""}</button>
              <button type="button" className="cf-chip-remove" aria-label="Remove filter" onClick={() => { cf.save(cf.list.filter((_, j) => j !== i)); if (editIndex === i) cancel(); }}>×</button></span>
          ))}
        </div>
      )}
    </>
  );
}
