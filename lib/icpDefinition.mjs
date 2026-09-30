// ICP definition — the single source of truth for every rule the agent follows, one profile per region.
// Stored in settings.icp_definition (edited in Setup → Define ICP). Used by: ICP status rules (lib/icpStatus.mjs),
// scripts/recompute_icp.mjs, the engine worker API (the 6am session reads it before searching/verifying), in-app research,
// the Pipeline and the left panel defaults. Missing values fall back to DEFAULT_RULES (the ICP in force before v1.44).

export const REGIONS = [
  { key: "UAE", name: "UAE", countries: ["UAE"], currency: { code: "AED", per_usd: 3.6725 } },
  { key: "KSA", name: "Saudi Arabia", countries: ["KSA"], currency: { code: "SAR", per_usd: 3.75 } },
  { key: "Qatar", name: "Qatar", countries: ["Qatar"], currency: { code: "QAR", per_usd: 3.64 } },
  { key: "Kuwait", name: "Kuwait", countries: ["Kuwait"], currency: { code: "KWD", per_usd: 0.307 } },
  { key: "Oman", name: "Oman", countries: ["Oman"], currency: { code: "OMR", per_usd: 0.385 } },
  { key: "Bahrain", name: "Bahrain", countries: ["Bahrain"], currency: { code: "BHD", per_usd: 0.376 } },
  { key: "Egypt", name: "Egypt", countries: ["Egypt"], currency: { code: "EGP", per_usd: 48.5 } },
  { key: "Europe", name: "Europe", countries: ["Europe", "UK", "Germany", "France", "Netherlands", "Switzerland", "Spain", "Italy", "Ireland", "Belgium", "Sweden", "Denmark", "Norway"], currency: { code: "EUR", per_usd: 0.92 } },
  { key: "USA", name: "United States", countries: ["USA", "United States", "US"], currency: { code: "USD", per_usd: 1 } },
];

export const OPTIONS = {
  status: [["active", "Active — daily discovery & verification"], ["paused", "Paused — rules apply, no daily run"], ["next", "Next phase — not started"]],
  listing: [["any", "Any (listing not required)"], ["listed_only", "Listed companies only"], ["private_only", "Private companies only"]],
  ownership: ["Listed", "Private / family group", "Government-owned", "Semi-government", "Subsidiary of listed group", "PE / VC backed"],
  entity: [["group_hq", "Group headquarters only"], ["group_and_subsidiaries", "Group HQ and major operating subsidiaries"], ["any", "Any legal entity"]],
  industries: ["Banking & financial services", "Insurance", "Oil, gas & chemicals", "Energy & utilities", "Construction & engineering", "Real estate",
    "Healthcare & pharma", "Hospitality & leisure", "Retail & consumer", "Food & beverage", "Logistics, shipping & aviation", "Manufacturing & industrial",
    "Metals & mining", "Technology & telecom", "Media & entertainment", "Education", "Professional services", "Automotive", "Conglomerate / diversified group", "Government-related entities"],
  verifiedSources: ["Annual / integrated report", "Results release or investor presentation", "Stock-exchange or regulator filing", "Bond / sukuk prospectus",
    "Credit-rating report", "Parent company segment disclosure", "Reputable press quoting the company"],
  platforms: ["Coupa", "SAP Ariba", "Oracle Procurement", "Ivalua", "Jaggaer", "GEP", "Zycus", "No S2P platform yet"],
  erp: ["SAP S/4HANA", "SAP ECC", "Oracle Fusion", "Oracle EBS", "Microsoft Dynamics", "Infor", "IFS", "Workday", "Other / unknown"],
  triggers: ["ERP transformation", "Procurement transformation", "Shared services set-up", "Digital transformation", "Cost optimisation", "Supplier consolidation",
    "M&A activity", "IPO preparation", "ESG / sustainability programme", "Supply-chain modernisation", "New leadership (CPO / CFO)"],
  departments: ["Procurement", "Supply chain", "Logistics", "Finance", "IT", "HR", "Transformation / PMO", "Executive", "Shared services"],
  seniority: ["C-level", "VP / Head", "Director", "Manager"],
  roles: ["CPO", "VP / Head of Procurement", "Procurement Director", "Procurement Manager", "CFO", "Finance Director", "CIO / CTO", "Head of Shared Services",
    "Supply Chain Director", "Head of Logistics", "CHRO", "Transformation Director"],
  // Wizard's plain-English "which domain" question maps each choice onto a department (+ optional extra roles worth adding).
  domains: [
    { key: "finance", label: "Finance", department: "Finance" },
    { key: "procurement", label: "Procurement / Source-to-Pay", department: "Procurement" },
    { key: "supply_chain", label: "Supply chain & design planning", department: "Supply chain" },
    { key: "logistics", label: "Logistics", department: "Logistics" },
    { key: "hr", label: "HR", department: "HR" },
    { key: "technology", label: "Technology", department: "IT" },
    { key: "erp_prospect", label: "ERP", department: "IT", extraTriggers: ["ERP transformation"] },
  ],
};

/** Rules in force before Define ICP existed (CLAUDE.md "ICP definition"); every region starts from these. */
export const DEFAULT_RULES = {
  status: "paused",
  revenue: { min_usd_m: 250, max_usd_m: null, basis_general: "Net revenue", basis_banks: "Total operating income", basis_insurers: "Insurance revenue (or GWP)" },
  employees: { min: 100, max: null },
  listing: "any",
  ownership_allowed: ["Listed", "Private / family group", "Government-owned", "Semi-government", "Subsidiary of listed group", "PE / VC backed"],
  entity_level: "group_hq",
  industries_include: [],
  industries_exclude: [],
  exclude: { government_bodies: true, single_sites: true, foreign_branches: true, keywords: "" },
  evidence: {
    verified_sources: ["Annual / integrated report", "Results release or investor presentation", "Stock-exchange or regulator filing", "Bond / sukuk prospectus",
      "Credit-rating report", "Parent company segment disclosure", "Reputable press quoting the company"],
    estimates_can_make_likely: true,
    not_icp_estimate_below_usd_m: 100,
    not_icp_estimate_max_staff: 1000,
    seamless_likely_min_staff: 1001,
    recheck_days: 180,
  },
  pipeline: { w_match: 50, w_opportunity: 30, w_fit: 20, min_match: 70, exclude_not_icp: true },
  focus: { platforms: ["Coupa", "SAP Ariba"], erp: [], triggers: [] },
  personas: { departments: ["Procurement", "Supply chain", "Finance", "IT"], seniority: ["C-level", "VP / Head", "Director"], roles: [], max_per_account: 8 },
  engine: { discover_per_day: 5, verify_per_day: 25 },
  notes: "",
};

const clone = (x) => JSON.parse(JSON.stringify(x));
const isObj = (x) => x && typeof x === "object" && !Array.isArray(x);
function merge(base, over) {
  if (!isObj(over)) return clone(base);
  const out = clone(base);
  for (const [k, v] of Object.entries(over)) out[k] = isObj(v) && isObj(base[k]) ? merge(base[k], v) : v;
  return out;
}

/** Default definition: UAE active (daily run as approved 2026-09-27), Gulf markets paused, Europe and USA next phase. */
export function defaultDefinition() {
  const regions = {};
  for (const r of REGIONS) {
    regions[r.key] = merge(DEFAULT_RULES, { status: r.key === "UAE" ? "active" : ["Europe", "USA"].includes(r.key) ? "next" : "paused",
      currency: r.currency, engine: r.key === "UAE" ? DEFAULT_RULES.engine : { discover_per_day: 0, verify_per_day: 0 } });
  }
  return { version: 1, regions, history: [], updated_at: null, updated_by: null };
}

/** Fills any missing value from the defaults (so older saved definitions keep working). */
export function normalizeDefinition(def) {
  const base = defaultDefinition();
  if (!isObj(def)) return base;
  const regions = {};
  for (const r of REGIONS) regions[r.key] = merge(base.regions[r.key], def.regions?.[r.key]);
  return { ...base, ...def, regions };
}

const ALIAS = { "united arab emirates": "UAE", uae: "UAE", "u.a.e.": "UAE", ksa: "KSA", "saudi arabia": "KSA", saudi: "KSA", qatar: "Qatar", kuwait: "Kuwait",
  oman: "Oman", bahrain: "Bahrain", egypt: "Egypt", usa: "USA", "united states": "USA", us: "USA", uk: "Europe", "united kingdom": "Europe" };
/** Region key for a company's country value (unknown countries use the UAE rules). */
export function regionOf(country) {
  const s = String(country ?? "").trim(), a = ALIAS[s.toLowerCase()];
  if (a) return a;
  const r = REGIONS.find((x) => x.countries.some((c) => c.toLowerCase() === s.toLowerCase()));
  return r ? r.key : "UAE";
}
/** The rules that apply to a company in `country` (pass the saved definition, or nothing for the defaults). */
export function rulesFor(def, country) {
  const d = normalizeDefinition(def);
  return d.regions[regionOf(country)] || d.regions.UAE;
}

/** Plain-language checks; returns a list of problems (empty = OK to save). */
export function validateRules(key, r) {
  const e = [], n = (v) => typeof v === "number" && isFinite(v);
  if (!n(r.revenue?.min_usd_m) || r.revenue.min_usd_m < 0) e.push(`${key}: minimum revenue must be a number of USD millions`);
  if (r.revenue?.max_usd_m != null && (!n(r.revenue.max_usd_m) || r.revenue.max_usd_m <= r.revenue.min_usd_m)) e.push(`${key}: maximum revenue must be above the minimum`);
  if (!n(r.employees?.min) || r.employees.min < 0) e.push(`${key}: minimum employees must be a number`);
  if (r.employees?.max != null && (!n(r.employees.max) || r.employees.max <= r.employees.min)) e.push(`${key}: maximum employees must be above the minimum`);
  const w = (r.pipeline?.w_match || 0) + (r.pipeline?.w_opportunity || 0) + (r.pipeline?.w_fit || 0);
  if (w !== 100) e.push(`${key}: Pipeline weights must add up to 100% (now ${w}%)`);
  if (!n(r.pipeline?.min_match) || r.pipeline.min_match < 0 || r.pipeline.min_match > 100) e.push(`${key}: Pipeline minimum ICP Match must be 0–100`);
  if (!r.evidence?.verified_sources?.length) e.push(`${key}: choose at least one source that can make a company Verified`);
  if (!r.ownership_allowed?.length) e.push(`${key}: allow at least one ownership type`);
  if (!n(r.evidence?.recheck_days) || r.evidence.recheck_days < 30) e.push(`${key}: re-check interval must be 30 days or more`);
  if (!n(r.evidence?.not_icp_estimate_below_usd_m) || r.evidence.not_icp_estimate_below_usd_m > r.revenue.min_usd_m) e.push(`${key}: the 'Not ICP (estimate)' revenue line must be at or below the minimum revenue`);
  if (!n(r.currency?.per_usd) || r.currency.per_usd <= 0) e.push(`${key}: currency rate must be above 0`);
  if (!n(r.engine?.discover_per_day) || !n(r.engine?.verify_per_day) || r.engine.discover_per_day < 0 || r.engine.verify_per_day < 0 || r.engine.discover_per_day > 50 || r.engine.verify_per_day > 60)
    e.push(`${key}: daily run limits are 0–50 new and 0–60 verified`);
  if (r.status === "active" && r.engine?.verify_per_day === 0 && r.engine?.discover_per_day === 0) e.push(`${key}: an active region needs a daily run (set new or verified per day above 0)`);
  return e;
}

/** One-line summary of a region's rules (used in history, the engine brief and the bell). */
export function summarizeRules(key, r) {
  const m = (v) => (v >= 1000 ? `$${(v / 1000).toFixed(2).replace(/\.?0+$/, "")}B` : `$${v}M`);
  return `${key}: revenue ${m(r.revenue.min_usd_m)}${r.revenue.max_usd_m ? `–${m(r.revenue.max_usd_m)}` : "+"}, ${r.employees.min}${r.employees.max ? `–${r.employees.max}` : "+"} staff, `
    + `${r.listing === "any" ? "listing not required" : r.listing === "listed_only" ? "listed only" : "private only"}, ${r.status}`
    + (r.status === "active" ? ` (daily: find ${r.engine.discover_per_day}, verify ${r.engine.verify_per_day})` : "");
}
