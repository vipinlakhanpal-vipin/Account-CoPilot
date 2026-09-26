// Source catalogue, three simple ideas used across the app:
//   ORIGIN      — where each company came from. Exactly one per company, so origin tiles add up to the total.
//   CONTRIBUTOR — who added or checked data inside an origin (e.g. CoPilot, Claude-Seamless inside your workbook). Shown as a breakdown.
//   EVIDENCE    — the type of document behind each fact (audit trail).
import type { Row } from "@/lib/data";

export type SourceDef = {
  key: string; name: string; group: "origin" | "contributor" | "evidence"; color: string;
  what: string; provides: string; how: string; reliability: string; cost: string;
  /** Company matches this source. `src` = the company's rows in the sources table, `people` = its contacts. */
  match: (a: Row, src: Row[], people: Row[]) => boolean;
};

const types = (list: string[]) => (a: Row, src: Row[]) => src.some((s) => list.includes(String(s.source_type)));

export const SOURCES: SourceDef[] = [
  // ---- origins (exclusive; see originOf) ----
  { key: "workbook", name: "Your workbook", group: "origin", color: "#3AA0FF",
    what: "Your FINAL-UAE-Target-LIST workbook (target list sheets and Stakeholders sheet). It already combines work by CoPilot, Claude in Copilot and a Claude-Seamless check.",
    provides: "Company list, your revenue estimates, priorities, named stakeholders with titles, emails and phones.", how: "Imported verbatim from your Excel file; never overwritten.",
    reliability: "Your data: each fact is treated as a claim until a second source or an official document agrees.", cost: "Free", match: (a) => originOf(a) === "workbook" },
  { key: "claude-research", name: "Claude research", group: "origin", color: "#2ECC8F",
    what: "Companies Claude researched directly from public sources (before or outside your workbook).", provides: "Revenue, ERP, S2P platform, signals, leadership, sources for every fact.",
    how: "Annual reports, filings, company websites, supplier portals, press, job posts; each fact labelled FACT / LIKELY / UNVERIFIED.", reliability: "High where FACT.", cost: "Free in Claude Code sessions (≈ $0.55–3.50 via the in-app API)",
    match: (a) => originOf(a) === "claude-research" },
  { key: "seamless-discovery", name: "Seamless discovery", group: "origin", color: "#F5A623",
    what: "New companies from a Seamless search (revenue ≥ $500M, 200+ staff), cleaned before import.", provides: "Name, domain, city, industry, revenue band, headcount, LinkedIn page.",
    how: "Free Seamless company search; duplicates, government bodies, single sites, foreign branches and junk removed.", reliability: "Low for revenue until verified.", cost: "Free",
    match: (a) => originOf(a) === "seamless-discovery" },
  { key: "claude-discovery", name: "Claude discovery", group: "origin", color: "#5AD1FF",
    what: "Companies found with the Research more button in the left panel.", provides: "Name, website, industry, why it fits the ICP, a revenue indication and its source.",
    how: "Web search against your criteria and the same exclusion rules.", reliability: "Medium until profiled and verified.", cost: "≈ $0.50–1.00 per search (API)",
    match: (a) => originOf(a) === "claude-discovery" },
  { key: "user-list", name: "Your customer list", group: "origin", color: "#E052C8",
    what: "Companies you named directly, e.g. your Coupa customers.", provides: "Platform in use, customer status.", how: "From your messages; stored with you as the source.",
    reliability: "FACT (user-confirmed).", cost: "Free", match: (a) => originOf(a) === "user-list" },
  // ---- contributors (breakdown inside origins; also shown on each contact) ----
  { key: "copilot", name: "CoPilot", group: "contributor", color: "#9B6BFF",
    what: "Research your team did with Microsoft Copilot, delivered in your workbook.", provides: "Contacts, titles, emails, phones.", how: "Via your workbook only (no direct integration).",
    reliability: "Single source unless another contributor agrees.", cost: "Free", match: (a, s, p) => p.some((x) => x.channel_state === "CoPilot") },
  { key: "claude-in-copilot", name: "Claude in Copilot", group: "contributor", color: "#6C7BFF",
    what: "Additional rows Claude (inside Copilot) researched and added to your workbook.", provides: "More contacts and titles, each with the web source it came from (company page, LinkedIn snippet, press).",
    how: "Via your workbook.", reliability: "Single source unless another contributor agrees.", cost: "Free",
    match: (a, s, p) => p.some((x) => x.is_reference && /^Claude/.test(String(x.channel_state)) && x.channel_state !== "Claude-Seamless") },
  { key: "claude-seamless", name: "Claude-Seamless", group: "contributor", color: "#2EC4A6",
    what: "Your check of the workbook against your Seamless subscription (run with Claude), plus later Seamless checks.", provides: "Seamless emails, phones, job status, revenue band, headcount.",
    how: "Seamless.ai connector (free search; 1 credit per researched contact).", reliability: "Contacts good; revenue bands unreliable (8 of 11 wrong side of $250M).", cost: "Seamless credits",
    match: (a, s, p) => !!a.profile?.["Claude verification (Seamless, 2026-09-25)"] || p.some((x) => x.channel_state === "Claude-Seamless" || x.channel_source === "Claude-Seamless") },
  { key: "claude-check", name: "Claude check", group: "contributor", color: "#2ECC8F",
    what: "Claude's own verification rows: new people not in your sheet, corrected companies (sheet row shift) and differences from your sheet.", provides: "Verification status, employment status, corrected company, extra contacts.",
    how: "Claude Code sessions (Seamless + public web).", reliability: "Labelled VERIFIED / LIKELY CURRENT / UNVERIFIED / CONFLICTING.", cost: "Free (session)",
    match: (a, s, p) => p.some((x) => !x.is_reference && x.channel_state === "Claude") },
  { key: "revenue-check", name: "Claude revenue check", group: "contributor", color: "#5AD1FF",
    what: "Revenue verification by Claude's own web search.", provides: "Latest revenue, fiscal year, listing, source URL, FACT / LIKELY label.",
    how: "Annual reports → parent/bond/rating → reputable press → estimates.", reliability: "High when FACT.", cost: "Free (session)", match: (a) => !!a.profile?.["Revenue check"] },
  { key: "user-knowledge", name: "Your confirmations", group: "contributor", color: "#E052C8",
    what: "Facts you confirmed (e.g. Coupa customer).", provides: "Platform in use.", how: "From your messages.", reliability: "FACT (user-confirmed).", cost: "Free",
    match: (a, src) => src.some((x) => x.source_type === "User confirmation") },
  // ---- evidence types (sources table) ----
  { key: "filings", name: "Annual reports & filings", group: "evidence", color: "#2ECC8F",
    what: "Annual/integrated reports, financial statements, results releases, investor presentations, bond or parent disclosures.", provides: "Revenue, headcount, strategy, ERP/procurement mentions.",
    how: "Company IR pages, ADX/DFM/Nasdaq Dubai/foreign exchange filings.", reliability: "Tier 1 — highest.", cost: "Free",
    match: types(["Annual Report", "Financial statements", "Sustainability report", "Results release", "Investor Presentation", "Parent or bond disclosure", "Company report/website"]) },
  { key: "websites", name: "Company websites & portals", group: "evidence", color: "#3AA0FF",
    what: "Official websites, leadership pages, supplier portals and their documents.", provides: "Leadership, board phone, supplier-portal platform (e.g. Ariba/Coupa realm), contact routes.",
    how: "Direct visits and supplier-portal probes.", reliability: "Tier 1.", cost: "Free",
    match: types(["Company Website", "Company website", "Company Leadership Page", "Company Document", "Supplier Portal", "Company Supplier Portal Document"]) },
  { key: "press", name: "Press releases & news", group: "evidence", color: "#9B6BFF",
    what: "Company press releases, business press (Zawya, Gulf News, The National, Reuters…), vendor case studies, conference bios.", provides: "Transformation programmes, platform go-lives, revenue quotes, executive moves.",
    how: "Web search and publisher pages.", reliability: "Tier 1–2 (company-quoted press counts as official).", cost: "Free",
    match: types(["Press Release", "News Article", "Business press", "Vendor press release", "Vendor case study", "Conference Speaker Profile"]) },
  { key: "seamless-data", name: "Seamless.ai data", group: "evidence", color: "#F5A623",
    what: "Seamless.ai contact and company records, technographics.", provides: "Contacts, emails, phones, technology tags, revenue bands.",
    how: "Seamless connector.", reliability: "Tier 3 — contacts good, technographics and revenue bands unverified.", cost: "Credits for contact research",
    match: types(["Seamless.ai", "Technographics database", "Technographics", "Contact data site"]) },
  { key: "aggregators", name: "Aggregators & estimates", group: "evidence", color: "#FF4D6A",
    what: "ZoomInfo/Owler/RocketReach/Growjo snippets, market-data sites.", provides: "Revenue and headcount estimates for private companies.",
    how: "Search-result snippets only (no paywall bypass).", reliability: "Tier 3–4 — can only support LIKELY.", cost: "Free",
    match: types(["Estimate/aggregator", "Market data", "Financial data site"]) },
  { key: "jobs", name: "Job postings", group: "evidence", color: "#6C7BFF",
    what: "Public job adverts.", provides: "Systems in use (e.g. 'SAP Ariba administrator'), transformation hiring.", how: "Job portals via web search.", reliability: "Tier 2.", cost: "Free",
    match: types(["Job Posting"]) },
];

/** The one origin of a company (first way it entered the app). */
export function originOf(a: Row): "workbook" | "claude-research" | "seamless-discovery" | "claude-discovery" | "user-list" | "other" {
  if (a.profile?.["Vipin-Profiling"] || a.profile?.["UAE Targets v3"] || (a.lists || []).includes("Stakeholders")) return "workbook";
  if ((a.lists || []).includes("Seamless discovery")) return "seamless-discovery";
  if ((a.lists || []).includes("Claude discovery") || a.research_channel === "Claude discovery") return "claude-discovery";
  if (a.research_channel === "Claude" || (a.lists || []).includes("Claude research")) return "claude-research";
  if (a.research_channel === "User") return "user-list";
  return "other";
}
export const originName = (a: Row) => SOURCES.find((d) => d.key === originOf(a))?.name || "Other";

export type SourceIndex = Record<string, Row[]>; // key → companies
export function indexSources(accounts: Row[], sources: Row[], contacts: Row[]): SourceIndex {
  const src: Record<string, Row[]> = {}, ppl: Record<string, Row[]> = {};
  sources.forEach((s) => (src[s.company_id] ||= []).push(s));
  contacts.forEach((p) => (ppl[p.company_id] ||= []).push(p));
  const out: SourceIndex = {};
  for (const d of SOURCES) out[d.key] = accounts.filter((a) => d.match(a, src[a.id] || [], ppl[a.id] || []));
  return out;
}
/** Evidence group for one sources-table row (used as a filter in the Sources table). */
export const evidenceGroup = (s: Row) => SOURCES.find((d) => d.group === "evidence" && d.match({}, [s], []))?.name
  || (s.source_type === "User confirmation" ? "Your confirmations" : /linkedin/i.test(String(s.source_type)) ? "LinkedIn snippets" : s.source_type === "Discovery" ? "Claude discovery" : "Other");
