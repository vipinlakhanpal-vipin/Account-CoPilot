// Source catalogue: every place company data comes from, how it is collected, what it provides and how far to trust it.
// Two groups: CHANNELS (how a company entered the app / was profiled) and EVIDENCE (the type of document behind each fact).
import type { Row } from "@/lib/data";

export type SourceDef = {
  key: string; name: string; group: "channel" | "evidence"; color: string;
  what: string; provides: string; how: string; reliability: string; cost: string;
  /** Company matches this source. `src` = the company's rows in the sources table, `people` = its contacts. */
  match: (a: Row, src: Row[], people: Row[]) => boolean;
};

const types = (list: string[]) => (a: Row, src: Row[]) => src.some((s) => list.includes(String(s.source_type)));

export const SOURCES: SourceDef[] = [
  // ---- channels ----
  { key: "workbook", name: "Your target list (workbook)", group: "channel", color: "#3AA0FF",
    what: "Your FINAL-UAE-Target-LIST workbook: Vipin-Profiling and UAE Targets v3 sheets.", provides: "Company list, your revenue size estimate, sector, priority notes.",
    how: "Imported verbatim from your Excel file; never overwritten.", reliability: "Your data: treated as a claim until confirmed from an official source.", cost: "Free",
    match: (a) => !!(a.profile?.["Vipin-Profiling"] || a.profile?.["UAE Targets v3"]) },
  { key: "stakeholders", name: "Stakeholders sheet (workbook)", group: "channel", color: "#6C7BFF",
    what: "The Stakeholders sheet in your workbook.", provides: "Named contacts per company, titles, channel (CoPilot / Claude-Seamless).",
    how: "Imported verbatim; known row-shift issue corrected in Claude verification rows.", reliability: "Your data.", cost: "Free",
    match: (a) => (a.lists || []).includes("Stakeholders") },
  { key: "copilot", name: "CoPilot", group: "channel", color: "#9B6BFF",
    what: "Contacts your team sourced through Microsoft Copilot, delivered in the workbook.", provides: "Contact names, titles, emails and phones.",
    how: "Arrives only through your workbook (no direct integration).", reliability: "Your data; emails verified separately where possible.", cost: "Free",
    match: (a, s, p) => p.some((x) => x.channel_state === "CoPilot") },
  { key: "claude-research", name: "Claude research (web)", group: "channel", color: "#2ECC8F",
    what: "Full account research by Claude reading public sources.", provides: "Revenue, ERP, S2P platform, signals, leadership, procurement model, sources for every fact.",
    how: "Annual reports, exchange filings, company websites, supplier portals, press, job posts. Each fact is labelled FACT / LIKELY / UNVERIFIED.", reliability: "High where FACT (Tier 1 official sources).", cost: "≈ $1.20–1.50 per company via the API (or free in a Claude Code session)",
    match: (a) => (a.lists || []).includes("Claude research") || a.research_channel === "Claude" },
  { key: "claude-seamless", name: "Claude-Seamless verification", group: "channel", color: "#2EC4A6",
    what: "Claude checked your companies and contacts against Seamless.ai.", provides: "Seamless revenue band, headcount, domain, contact emails/phones and job status.",
    how: "Seamless.ai connector in Claude sessions (free search; 1 credit per researched contact).", reliability: "Contacts: good. Revenue bands: unreliable (8 of 11 on the wrong side of $250M).", cost: "Seamless credits for contact research",
    match: (a, s, p) => !!a.profile?.["Claude verification (Seamless, 2026-09-25)"] || p.some((x) => x.channel_state === "Claude-Seamless") },
  { key: "seamless-discovery", name: "Seamless discovery", group: "channel", color: "#F5A623",
    what: "New companies found by a Seamless search (revenue ≥ $500M, 200+ staff), cleaned before import.", provides: "Company name, domain, city, industry, revenue band, headcount, LinkedIn page.",
    how: "Free Seamless company search; duplicates, government bodies, single sites, foreign branches and junk removed.", reliability: "Low for revenue until verified; headcount is a rough guide.", cost: "Free",
    match: (a) => (a.lists || []).includes("Seamless discovery") },
  { key: "revenue-check", name: "Claude revenue check (web search)", group: "channel", color: "#5AD1FF",
    what: "Revenue verification by Claude's own web search.", provides: "Latest revenue, fiscal year, listing status, source URL, FACT / LIKELY label.",
    how: "Annual reports and results → parent/bond/rating disclosures → reputable press → estimates (estimates can only give LIKELY).", reliability: "High when FACT.", cost: "Free (Claude Code session)",
    match: (a) => !!a.profile?.["Revenue check"] },
  { key: "user-list", name: "Vipin — customer knowledge", group: "channel", color: "#E052C8",
    what: "Facts you confirmed directly, e.g. your Coupa customer list.", provides: "Platform in use (Coupa), customer status.",
    how: "Entered from your message; stored with you as the source.", reliability: "FACT (user-confirmed).", cost: "Free",
    match: (a, src) => (a.lists || []).some((l: string) => /\(Vipin\)/.test(l)) || src.some((s) => s.source_type === "User confirmation") },
  { key: "linkedin", name: "LinkedIn (public snippets)", group: "channel", color: "#B6E36B",
    what: "Public LinkedIn search-result snippets used to confirm people and titles.", provides: "Current title and employer of contacts.",
    how: "Search-engine snippets only — no login, no scraping.", reliability: "Medium; titles can be out of date.", cost: "Free",
    match: (a, src, p) => p.some((x) => /LinkedIn/i.test(String(x.channel_state))) || src.some((s) => /linkedin/i.test(String(s.source_type))) },
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
  || (s.source_type === "User confirmation" ? "Vipin — customer knowledge" : /linkedin/i.test(String(s.source_type)) ? "LinkedIn (public snippets)" : "Other");
