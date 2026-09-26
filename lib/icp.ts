// ICP criteria, scoring and recommendations for Account CoPilot.
// Pure functions over the account/contact rows the app already loads, so the same engine can run in the UI,
// in scripts, or behind an API for other tenants later. Every score explains itself (parts + reasons).
import type { Row } from "@/lib/data";
import { countryCode } from "@/lib/countries";

// ---------- criteria ----------
export const OPTIONS = {
  ownership: ["Public", "Private", "Government", "Semi-Government", "Family Owned", "PE Backed"],
  revenue: ["<$100M", "$100M-$250M", "$250M-$500M", "$500M-$1B", "$1B-$5B", "$5B+"],
  employees: ["100-250", "250-500", "500-1000", "1000-5000", "5000+"],
  erp: ["SAP", "Oracle", "Microsoft", "Infor", "IFS", "Sage", "Others"],
  procurement: ["Coupa", "SAP Ariba", "Ivalua", "Jaggaer", "GEP", "Zycus", "Oracle Procurement"],
  integration: ["Boomi", "MuleSoft", "SAP BTP", "Oracle Integration Cloud"],
  triggers: ["ERP Transformation", "Procurement Transformation", "Shared Services Initiative", "Digital Transformation", "Cost Optimization Program",
    "Supplier Consolidation", "Merger & Acquisition Activity", "IPO Preparation", "ESG Program", "Supply Chain Modernization"],
  financial: ["Revenue Growth", "Profitability", "Funding Events", "Acquisitions", "Expansion Announcements"],
  industries: ["banking_financial", "chemicals_oil_gas", "construction", "healthcare_pharma", "hospitality", "logistics_shipping", "mining_resources",
    "professional_services", "retail_lifestyle", "tech_ai", "utilities"],
  regions: ["UAE", "KSA", "Qatar", "Kuwait", "Oman", "Egypt"],
  roles: ["CPO", "VP Procurement", "Director Procurement", "Head of Procurement", "Procurement Manager", "CFO", "Finance Director", "CIO", "CTO",
    "Head of Shared Services", "Supply Chain Director", "Operations Director"],
  seniority: ["C-level", "VP / Head", "Director", "Manager", "Other"],
  departments: ["PROCUREMENT", "SUPPLY CHAIN", "FINANCE", "IT", "TRANSFORMATION", "EXECUTIVE", "OTHER"],
  intelligence: ["Decision Maker", "Influencer", "Champion", "Technical Evaluator", "Economic Buyer"],
  engagement: ["Recently Promoted", "New Hire", "Changed Company", "Posted Procurement Content", "Attended Procurement Event", "Active on LinkedIn"],
} as const;
/** Engagement signals that need a data source the app does not have yet (shown disabled in the panel). */
export const UNAVAILABLE_ENGAGEMENT = ["Posted Procurement Content", "Attended Procurement Event", "Active on LinkedIn"];

export type Criteria = {
  company: {
    name: string; website: string; hq: string; industries: string[]; countries: string[]; regions: string[]; ownership: string[];
    revenue: string[]; employees: string[]; erp: string[]; procurement: string[]; integration: string[]; triggers: string[]; financial: string[];
  };
  contact: {
    firstName: string; lastName: string; title: string; email: string; phone: string; linkedin: string;
    seniority: string[]; departments: string[]; roles: string[]; intelligence: string[]; engagement: string[];
  };
  showSpend: boolean; // user opted in to procurement & transactional estimates
};

/** Default = the current ICP: revenue ≥ $250M, 100+ employees, UAE. */
export const DEFAULT_CRITERIA: Criteria = {
  company: { name: "", website: "", hq: "", industries: [], countries: ["UAE"], regions: [], ownership: [], revenue: ["$250M-$500M", "$500M-$1B", "$1B-$5B", "$5B+"],
    employees: ["100-250", "250-500", "500-1000", "1000-5000", "5000+"], erp: [], procurement: [], integration: [], triggers: [], financial: [] },
  contact: { firstName: "", lastName: "", title: "", email: "", phone: "", linkedin: "", seniority: [], departments: [], roles: [], intelligence: [], engagement: [] },
  showSpend: false,
};
export const withDefaults = (c?: Partial<Criteria> | null): Criteria => ({
  company: { ...DEFAULT_CRITERIA.company, ...(c?.company || {}) }, contact: { ...DEFAULT_CRITERIA.contact, ...(c?.contact || {}) },
  showSpend: c?.showSpend ?? DEFAULT_CRITERIA.showSpend,
});
export const activeCount = (c: Criteria) =>
  Object.values(c.company).filter((v) => (Array.isArray(v) ? v.length : v)).length + Object.values(c.contact).filter((v) => (Array.isArray(v) ? v.length : v)).length;

// ---------- account facts ----------
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const text = (a: Row) => [a.s2p_strong_signals, a.digital_transformation_signals, a.procurement_transformation_signals, a.relevant_technologies,
  a.account_notes, a.potential_opportunity, a.existing_s2p_detail, a.erp_evidence, a.icp_fit_reason].map(s).join(" \n ");

export const revenueOf = (a: Row): number | null => {
  const d = a.profile?.["Display revenue"];
  const v = Number(d?.value_usd_m ?? a.verified_revenue_usd_m ?? a.revenue_usd_m);
  return isFinite(v) && v > 0 ? v : null;
};
export const employeesOf = (a: Row): number | null => {
  const m = s(a.employee_range).replace(/,/g, "").match(/\d+/g);
  if (m) { const n = m.map(Number); return n.length > 1 && !/\+/.test(s(a.employee_range)) ? Math.round((n[0] + n[1]) / 2) : n[0]; }
  const d = Number(a.profile?.["Seamless discovery"]?.employee_count);
  return isFinite(d) && d > 0 ? d : null;
};
const REV_BAND: Record<string, [number, number]> = { "<$100M": [0, 100], "$100M-$250M": [100, 250], "$250M-$500M": [250, 500], "$500M-$1B": [500, 1000],
  "$1B-$5B": [1000, 5000], "$5B+": [5000, Infinity] };
const EMP_BAND: Record<string, [number, number]> = { "100-250": [100, 250], "250-500": [250, 500], "500-1000": [500, 1000], "1000-5000": [1000, 5000], "5000+": [5000, Infinity] };
const inBands = (v: number | null, picked: string[], map: Record<string, [number, number]>) => v !== null && picked.some((b) => v >= map[b][0] && v < map[b][1]);

export const erpFamily = (a: Row) => {
  const v = s(a.erp);
  if (/unknown|not identified|no evidence/i.test(v) || !v) return "";
  if (/sap/i.test(v)) return "SAP"; if (/oracle|fusion/i.test(v)) return "Oracle"; if (/dynamics|microsoft/i.test(v)) return "Microsoft";
  if (/infor/i.test(v)) return "Infor"; if (/\bifs\b/i.test(v)) return "IFS"; if (/sage/i.test(v)) return "Sage"; return "Others";
};
export const procurementPlatforms = (a: Row) => {
  const t = `${s(a.existing_s2p_product)} ${s(a.existing_s2p_detail)}`;
  return OPTIONS.procurement.filter((p) => new RegExp(p === "Oracle Procurement" ? "oracle (fusion )?procurement|oracle.*procurement cloud" : p.replace(" ", "\\s*"), "i").test(t)
    && !(p !== s(a.existing_s2p_product) && new RegExp(`no ${p}`, "i").test(t)));
};
export const integrationPlatforms = (a: Row) => OPTIONS.integration.filter((p) => new RegExp(p.replace(/ /g, "\\s*"), "i").test(text(a)));
export const ownershipOf = (a: Row): string[] => {
  const t = `${s(a.listing_status)} ${s(a.ownership)} ${s(a.parent_company)} ${s(a.account_notes)}`;
  const o: string[] = [];
  if (/listed/i.test(s(a.listing_status)) || a.exchange) o.push("Public");
  if (/government-owned|government of|sovereign|ministry/i.test(t)) o.push("Government");
  if (/semi-government|government-related|gre\b|state-backed|adq|mubadala|investment corporation of dubai|dubai holding/i.test(t)) o.push("Semi-Government");
  if (/family/i.test(t)) o.push("Family Owned");
  if (/private equity|pe-backed|kkr|brookfield|investcorp|silver lake/i.test(t)) o.push("PE Backed");
  if (/private/i.test(s(a.listing_status)) && !o.length) o.push("Private");
  return o;
};
const TRIGGER_RE: Record<string, RegExp> = {
  "ERP Transformation": /s\/4|erp (migration|transformation|upgrade|implementation|replacement)|fusion (cloud )?(go-live|implementation)|rise with sap|move to (sap|oracle)/i,
  "Procurement Transformation": /procurement transformation|s2p|source-to-pay|p2p transformation|e-procurement|procurement (digital|excellence)/i,
  "Shared Services Initiative": /shared service|gbs|global business services/i,
  "Digital Transformation": /digital transformation|digitali[sz]ation|ai strategy|cloud migration/i,
  "Cost Optimization Program": /cost (optimi[sz]ation|reduction|efficiency)|savings programme|opex reduction/i,
  "Supplier Consolidation": /supplier consolidation|vendor consolidation|supplier rationali[sz]ation/i,
  "Merger & Acquisition Activity": /acqui|merger|merged|takeover/i,
  "IPO Preparation": /\bipo\b|intention to float|listing plan/i,
  "ESG Program": /\besg\b|sustainab|net zero|decarboni/i,
  "Supply Chain Modernization": /supply chain (moderni|transformation|digital)|warehouse automation|logistics transformation/i,
};
export const triggersOf = (a: Row) => Object.entries(TRIGGER_RE).filter(([, re]) => re.test(text(a))).map(([k]) => k);

// ---------- procurement & spend estimates (industry benchmarks, always labelled ESTIMATE) ----------
// Addressable spend as a share of revenue and its split; benchmarks are typical third-party-spend ratios by sector.
export const SPEND_BENCHMARKS: Record<string, { ratio: number; direct: number; indirect: number; mro: number; services: number; capex: number }> = {
  retail_lifestyle: { ratio: 0.65, direct: 0.7, indirect: 0.12, mro: 0.03, services: 0.1, capex: 0.05 },
  construction: { ratio: 0.7, direct: 0.6, indirect: 0.08, mro: 0.07, services: 0.15, capex: 0.1 },
  chemicals_oil_gas: { ratio: 0.5, direct: 0.35, indirect: 0.1, mro: 0.15, services: 0.2, capex: 0.2 },
  mining_resources: { ratio: 0.55, direct: 0.45, indirect: 0.08, mro: 0.15, services: 0.15, capex: 0.17 },
  logistics_shipping: { ratio: 0.55, direct: 0.3, indirect: 0.15, mro: 0.15, services: 0.25, capex: 0.15 },
  hospitality: { ratio: 0.45, direct: 0.35, indirect: 0.2, mro: 0.1, services: 0.25, capex: 0.1 },
  healthcare_pharma: { ratio: 0.45, direct: 0.45, indirect: 0.15, mro: 0.05, services: 0.25, capex: 0.1 },
  banking_financial: { ratio: 0.25, direct: 0, indirect: 0.35, mro: 0.02, services: 0.48, capex: 0.15 },
  tech_ai: { ratio: 0.35, direct: 0.3, indirect: 0.2, mro: 0.02, services: 0.33, capex: 0.15 },
  professional_services: { ratio: 0.25, direct: 0.05, indirect: 0.35, mro: 0.02, services: 0.48, capex: 0.1 },
  utilities: { ratio: 0.5, direct: 0.35, indirect: 0.08, mro: 0.17, services: 0.15, capex: 0.25 },
};
export type Spend = { total: number; direct: number; indirect: number; mro: number; services: number; capex: number; budget: number;
  invoicesPerMonth: number; posPerMonth: number; suppliers: number; activeSuppliers: number; transactionsPerYear: number; basis: string };
export function estimateSpend(a: Row): Spend | null {
  const rev = revenueOf(a);
  if (!rev) return null;
  const b = SPEND_BENCHMARKS[s(a.industry)] || { ratio: 0.45, direct: 0.4, indirect: 0.15, mro: 0.08, services: 0.25, capex: 0.12 };
  const total = rev * b.ratio;
  // Transaction benchmarks: ~1 invoice per $12k of spend, ~0.7 POs per invoice, ~1 supplier per $0.6M of spend, ~45% of suppliers active in a year.
  const invoicesYear = (total * 1e6) / 12000;
  const suppliers = Math.round(total / 0.6);
  return { total, direct: total * b.direct, indirect: total * b.indirect, mro: total * b.mro, services: total * b.services, capex: total * b.capex,
    budget: total * (b.indirect + b.services + b.mro), invoicesPerMonth: Math.round(invoicesYear / 12), posPerMonth: Math.round((invoicesYear * 0.7) / 12),
    suppliers, activeSuppliers: Math.round(suppliers * 0.45), transactionsPerYear: Math.round(invoicesYear * 1.7),
    basis: `ESTIMATE from revenue ${Math.round(rev)}M × ${Math.round(b.ratio * 100)}% addressable-spend benchmark for ${s(a.industry) || "this sector"}; transaction volumes from spend benchmarks. Not company data.` };
}

// ---------- scores ----------
export type Part = { label: string; score: number; max: number; why: string };
export type Score = { total: number; parts: Part[] };
const pack = (parts: Part[]): Score => {
  const max = parts.reduce((t, p) => t + p.max, 0) || 1;
  return { total: Math.round((parts.reduce((t, p) => t + p.score, 0) / max) * 100), parts };
};

const maturity = (a: Row) => {
  const p = s(a.existing_s2p_product);
  if (/coupa|ariba/i.test(p)) return { level: "Advanced (suite in place)", pts: 1 };
  if (/other s2p/i.test(p)) return { level: "Developing (point / in-house tools)", pts: 0.7 };
  if (/no evidence/i.test(p)) return { level: "Basic (ERP / manual)", pts: 0.5 };
  return { level: "Unknown", pts: 0.4 };
};

/** ICP Match: how well the account fits the criteria. Only criteria the user set are scored; unset ones are neutral. */
export function icpMatch(a: Row, c: Criteria): Score {
  const k = c.company, parts: Part[] = [];
  const rev = revenueOf(a), emp = employeesOf(a);
  if (k.revenue.length) parts.push({ label: "Revenue", max: 30, score: inBands(rev, k.revenue, REV_BAND) ? 30 : rev === null ? 12 : 0,
    why: rev === null ? "No revenue figure yet (partial credit)" : `${Math.round(rev)}M ${inBands(rev, k.revenue, REV_BAND) ? "in" : "outside"} selected bands` });
  if (k.employees.length) parts.push({ label: "Employees", max: 15, score: inBands(emp, k.employees, EMP_BAND) ? 15 : emp === null ? 6 : 0,
    why: emp === null ? "Headcount unknown (partial credit)" : `~${emp.toLocaleString()} staff` });
  if (k.industries.length) parts.push({ label: "Industry", max: 15, score: k.industries.includes(s(a.industry)) ? 15 : 0, why: s(a.industry) || "Industry unknown" });
  const geo = [...k.countries, ...k.regions];
  if (geo.length) parts.push({ label: "Geography", max: 15, score: geo.includes(countryCode(a.country)) ? 15 : 0, why: countryCode(a.country) });
  if (k.ownership.length) { const o = ownershipOf(a); parts.push({ label: "Ownership", max: 5, score: o.some((x) => k.ownership.includes(x)) ? 5 : 0, why: o.join(", ") || "Unknown" }); }
  const tech = [...k.erp, ...k.procurement, ...k.integration];
  if (tech.length) {
    const have = [erpFamily(a), ...procurementPlatforms(a), ...integrationPlatforms(a)].filter(Boolean);
    const hit = have.filter((h) => tech.includes(h));
    parts.push({ label: "Technology", max: 10, score: hit.length ? 10 : have.length ? 0 : 3, why: hit.length ? `Matches ${hit.join(", ")}` : have.length ? `Has ${have.join(", ")}` : "Stack unknown" });
  }
  if (k.triggers.length) { const t = triggersOf(a).filter((x) => k.triggers.includes(x)); parts.push({ label: "Triggers", max: 10, score: t.length ? 10 : 0, why: t.join(", ") || "None of the selected triggers found" }); }
  const m = maturity(a);
  parts.push({ label: "Procurement maturity", max: 10, score: Math.round(m.pts * 10), why: m.level });
  if (k.name) parts.push({ label: "Name", max: 5, score: s(a.company_name).toLowerCase().includes(k.name.toLowerCase()) ? 5 : 0, why: "Name filter" });
  return pack(parts);
}

const SIG_PTS: Record<string, number> = { "VERY STRONG SIGNAL": 40, "STRONG SIGNAL": 30, "MODERATE SIGNAL": 18, "WEAK SIGNAL": 8, "CONFLICTING SIGNAL": 10 };
/** Opportunity: how likely the account is to buy soon (signals, transformation, hiring, growth). */
export function opportunity(a: Row, hires = 0): Score {
  const t = text(a), trig = triggersOf(a);
  const active = ["Evaluation", "RFP / Tender", "Currently Implementing", "Replacement / Transformation", "Recently signed (implementation)"].includes(s(a.s2p_platform_status));
  return pack([
    { label: "S2P signal strength", max: 40, score: SIG_PTS[s(a.s2p_signal_level)] || 0, why: s(a.s2p_signal_level) || "No signal" },
    { label: "Procurement transformation", max: 15, score: trig.includes("Procurement Transformation") || active ? 15 : 0, why: active ? s(a.s2p_platform_status) : trig.includes("Procurement Transformation") ? "Evidence in research" : "None found" },
    { label: "ERP modernisation", max: 15, score: trig.includes("ERP Transformation") ? 15 : /s\/4|fusion/i.test(s(a.erp)) ? 8 : 0, why: trig.includes("ERP Transformation") ? "ERP programme evidenced" : s(a.erp) || "ERP unknown" },
    { label: "Digital transformation", max: 10, score: trig.includes("Digital Transformation") ? 10 : 0, why: trig.includes("Digital Transformation") ? "Programme evidenced" : "None found" },
    { label: "Cost reduction", max: 5, score: trig.includes("Cost Optimization Program") ? 5 : 0, why: trig.includes("Cost Optimization Program") ? "Programme evidenced" : "None found" },
    { label: "Executive hiring", max: 10, score: Math.min(10, hires * 5), why: hires ? `${hires} leadership move(s) recorded` : "No recorded moves" },
    { label: "Recent growth", max: 5, score: /record (revenue|profit|growth)|revenue (rose|grew|up)|\+\d+%/i.test(t) ? 5 : 0, why: /record|grew|rose/i.test(t) ? "Growth reported" : "Not evidenced" },
  ]);
}

/** Coupa Fit: estimated fit across the five Coupa value areas, with the reason for each. */
export function coupaFit(a: Row): Score & { useCases: string[] } {
  const p = s(a.existing_s2p_product), rev = revenueOf(a) || 0, ind = s(a.industry), erp = erpFamily(a);
  const coupa = /coupa/i.test(p), ariba = /ariba/i.test(p), none = /unknown|no evidence|other s2p/i.test(p) || !p;
  const size = rev >= 1000 ? 1 : rev >= 250 ? 0.8 : rev > 0 ? 0.5 : 0.6;
  const erpOk = erp === "SAP" || erp === "Oracle" || erp === "Microsoft" ? 1 : erp ? 0.8 : 0.7;
  const base = coupa ? 0.9 : ariba ? 0.45 : none ? 0.85 : 0.6;
  const servicesHeavy = ["banking_financial", "professional_services", "hospitality", "tech_ai", "healthcare_pharma"].includes(ind);
  const supplierHeavy = ["construction", "chemicals_oil_gas", "mining_resources", "logistics_shipping", "utilities", "retail_lifestyle"].includes(ind);
  const f = (x: number) => Math.round(Math.min(1, x) * 20);
  const why = coupa ? "Existing Coupa customer: optimisation / module expansion / managed services" : ariba ? "SAP Ariba in place: displacement or coexistence play" : none ? "No S2P suite found: greenfield" : "Point or in-house tools: consolidation play";
  const parts: Part[] = [
    { label: "Source-to-Pay", max: 20, score: f(base * size * erpOk + 0.05), why },
    { label: "Supplier management", max: 20, score: f(base * (supplierHeavy ? 1.05 : 0.85) * size), why: supplierHeavy ? "Supplier-intensive sector (onboarding, risk, compliance)" : "Moderate supplier base" },
    { label: "Contract management", max: 20, score: f(base * (supplierHeavy || servicesHeavy ? 1 : 0.85) * size), why: servicesHeavy ? "Services-heavy spend relies on contracts" : supplierHeavy ? "Large project / framework contracts" : "Standard contract load" },
    { label: "Spend analytics", max: 20, score: f(base * size * (rev >= 1000 ? 1.1 : 0.95)), why: rev >= 1000 ? "Large, complex spend base" : "Mid-size spend base" },
    { label: "Invoice automation", max: 20, score: f(base * erpOk * (servicesHeavy || rev >= 500 ? 1.05 : 0.9)), why: `${erp || "Unknown"} ERP${servicesHeavy ? "; high indirect invoice volumes" : ""}` },
  ];
  const sc = pack(parts);
  const useCases = parts.filter((x) => x.score >= 15).map((x) => ({
    "Source-to-Pay": "Unified source-to-pay on one platform", "Supplier management": "Supplier onboarding, risk and compliance (Coupa Supplier Management)",
    "Contract management": "Contract lifecycle management (Coupa CLM)", "Spend analytics": "Spend visibility and savings tracking (Coupa Spend Analysis)",
    "Invoice automation": "Touchless invoicing and e-invoicing compliance (Coupa Pay / AP automation)" }[x.label]!));
  return { ...sc, useCases };
}

// ---------- contacts ----------
export const seniorityOf = (title: string) => {
  const t = title.toLowerCase();
  if (/\bchief\b|\bc[efitp]o\b|ceo|president|managing director|group md/.test(t)) return "C-level";
  if (/\bvp\b|vice president|head of|general manager|\bsvp\b|\bevp\b/.test(t)) return "VP / Head";
  if (/director/.test(t)) return "Director";
  if (/manager|lead\b/.test(t)) return "Manager";
  return "Other";
};
const ROLE_RE: Record<string, RegExp> = {
  CPO: /chief procurement|\bcpo\b/i, "VP Procurement": /vp.*(procure|purchas|sourcing)|vice president.*(procure|purchas|sourcing)/i,
  "Director Procurement": /director.*(procure|purchas|sourcing|contracts)/i, "Head of Procurement": /head.*(procure|purchas|sourcing)/i,
  "Procurement Manager": /(procure|purchas|sourcing).*manager|manager.*(procure|purchas)/i, CFO: /chief financial|\bcfo\b/i,
  "Finance Director": /finance director|director.*finance|head of finance/i, CIO: /chief information|\bcio\b|chief digital/i, CTO: /chief technology|\bcto\b/i,
  "Head of Shared Services": /shared service|\bgbs\b/i, "Supply Chain Director": /supply chain.*(director|head|vp)|(director|head|vp).*supply chain/i,
  "Operations Director": /(chief )?operations|\bcoo\b/i,
};
export const rolesOf = (title: string) => Object.entries(ROLE_RE).filter(([, re]) => re.test(title)).map(([k]) => k);
export function intelligenceOf(p: Row): string[] {
  const t = s(p.title_verbatim), r = rolesOf(t), sen = seniorityOf(t), o: string[] = [];
  if (r.includes("CFO") || /\bceo\b|managing director/i.test(t)) o.push("Economic Buyer");
  if (sen === "C-level" || (sen === "VP / Head" && /procure|financ|supply/i.test(t)) || s(p.contact_tier) === "T1") o.push("Decision Maker");
  if (/procure|sourcing|purchas/i.test(t) && sen !== "Other") o.push("Champion");
  if (r.includes("CIO") || r.includes("CTO") || /\bit\b|erp|digital|systems|technology/i.test(t)) o.push("Technical Evaluator");
  if (!o.length || (sen === "Manager" || sen === "Director")) o.push("Influencer");
  return [...new Set(o)];
}
export function engagementOf(p: Row, history: Row[]): string[] {
  const h = history.filter((x) => s(x.full_name).toLowerCase() === s(p.full_name).toLowerCase());
  const o: string[] = [];
  if (h.some((x) => /promot/i.test(s(x.determination)))) o.push("Recently Promoted");
  if (h.some((x) => /new hire|joined/i.test(s(x.determination))) || /joined|new/i.test(s(p.employment_status))) o.push("New Hire");
  if (h.some((x) => /change|moved|left/i.test(s(x.determination))) || /changed|moved|left/i.test(s(p.employment_status))) o.push("Changed Company");
  return o;
}
export function contactMatches(p: Row, c: Criteria, history: Row[], dept: (f: unknown) => string): boolean {
  const k = c.contact, name = s(p.full_name).toLowerCase(), title = s(p.title_verbatim);
  const has = (v: string, x: string) => !v || x.toLowerCase().includes(v.toLowerCase());
  if (!has(k.firstName, name.split(" ")[0] || "") || !has(k.lastName, name.split(" ").slice(1).join(" ")) || !has(k.title, title)) return false;
  if (!has(k.email, s(p.email)) || !has(k.phone, s(p.phone)) || !has(k.linkedin, s(p.linkedin_url))) return false;
  if (k.seniority.length && !k.seniority.includes(seniorityOf(title))) return false;
  if (k.departments.length && !k.departments.includes(dept(p.role_family))) return false;
  if (k.roles.length && !rolesOf(title).some((r) => k.roles.includes(r))) return false;
  if (k.intelligence.length && !intelligenceOf(p).some((r) => k.intelligence.includes(r))) return false;
  if (k.engagement.length && !engagementOf(p, history).some((r) => k.engagement.includes(r))) return false;
  return true;
}

/** Hard filters for company text fields (name / website / HQ); scored criteria rank rather than exclude. */
export function companyPasses(a: Row, c: Criteria): boolean {
  const k = c.company;
  if (k.name && !s(a.company_name).toLowerCase().includes(k.name.toLowerCase())) return false;
  if (k.website && !`${s(a.company_website)} ${s(a.domain)}`.toLowerCase().includes(k.website.toLowerCase())) return false;
  if (k.hq && !`${s(a.hq_city)} ${s(a.country)}`.toLowerCase().includes(k.hq.toLowerCase())) return false;
  return true;
}

// ---------- recommendations ----------
export function whySelected(a: Row, c: Criteria, m: Score, spend: Spend | null): string[] {
  const o = m.parts.filter((p) => p.score >= p.max * 0.8 && p.label !== "Procurement maturity").map((p) => `${p.label}: ${p.why}`);
  if (spend) o.push(`Estimated addressable spend ~$${Math.round(spend.total)}M (${spend.basis.split(";")[0].replace("ESTIMATE from ", "benchmark: ")})`);
  const tech = [erpFamily(a) && `ERP ${erpFamily(a)}`, ...procurementPlatforms(a), ...integrationPlatforms(a)].filter(Boolean);
  if (tech.length) o.push(`Technology: ${tech.join(", ")}`);
  o.push(`Procurement maturity: ${maturity(a).level}`);
  const t = triggersOf(a);
  if (t.length) o.push(`Business triggers: ${t.join(", ")}`);
  return o;
}
export function recommendedActions(a: Row, people: Row[], fit: ReturnType<typeof coupaFit>) {
  const ranked = [...people].sort((x, y) => s(x.contact_tier).localeCompare(s(y.contact_tier)));
  const who = ranked.filter((p) => intelligenceOf(p).some((r) => r === "Economic Buyer" || r === "Decision Maker" || r === "Champion")).slice(0, 3);
  const coupa = /coupa/i.test(s(a.existing_s2p_product)), ariba = /ariba/i.test(s(a.existing_s2p_product));
  const pains = [
    !coupa && !ariba ? "Fragmented or manual procure-to-pay across entities" : coupa ? "Under-used Coupa modules and adoption gaps" : "Ariba cost, complexity or renewal pressure",
    "Limited real-time spend visibility across business units",
    ["construction", "chemicals_oil_gas", "logistics_shipping"].includes(s(a.industry)) ? "Supplier onboarding, compliance and risk on large project spend" : "High invoice volumes and manual AP matching",
    "UAE e-invoicing mandate readiness (phased from 2026)",
  ];
  return {
    stakeholders: who.map((p) => `${p.full_name} — ${p.title_verbatim} (${intelligenceOf(p).join(", ")})`),
    messaging: coupa ? "Lead with value realisation: adoption, module expansion (CLM, Supplier Management, Pay) and managed services for the existing Coupa estate."
      : ariba ? "Lead with total cost of ownership and user adoption versus the current Ariba estate; offer a coexistence pilot on one spend category."
      : "Lead with a single source-to-pay platform that plugs into their ERP, with fast time-to-value and e-invoicing readiness.",
    questions: ["How is procure-to-pay run today across entities, and on which systems?", "What share of spend is under management, and how is it reported?",
      "What does invoice processing look like (volumes, touchless rate, cycle time)?", "Which transformation programmes (ERP, finance, shared services) are planned in the next 18 months?"],
    pains, useCases: fit.useCases,
    next: [who.length ? `Request a discovery call with ${who[0].full_name}` : "Identify the CPO / Head of Procurement (Seamless contact research)",
      "Validate ERP and current S2P tools on the first call", "Share a relevant Coupa customer story from the same sector"],
  };
}
