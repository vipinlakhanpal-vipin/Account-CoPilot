// Activity log and who-is-online. Tables activity_log and user_presence (migration 0007), written and read only by /api/activity.
export const ACTIVITY_KINDS = ["visit", "page", "ping", "search", "report", "contacts", "scan", "aria"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
export const KIND_LABEL: Record<string, string> = { visit: "Opened the app", page: "Opened a page", search: "Searched", report: "Downloaded a report", contacts: "Find contacts", scan: "Started a scan", aria: "Asked Aria" };

const TABS: Record<string, string> = { pipeline: "Pipeline", accounts: "Accounts", stakeholders: "Stakeholders", signals: "S2P Signals", erp: "ERP & Apps", conflicts: "Conflicts", sources: "Sources", reports: "Mission Control" };
const PAGES: Record<string, string> = { "/research": "Research Queue", "/settings": "Settings", "/guide": "Learn Me", "/icp": "Define ICP", "/team": "Team", "/home": "Home", "/find": "Find company", "/signals": "Buying signals", "/market": "Market intelligence" };
/** A readable name for a path such as "/?tab=pipeline" or "/find". */
export function pageLabel(path: string): string {
  const [p, q = ""] = path.split("?");
  if (p === "/") { const tab = new URLSearchParams(q).get("tab") || ""; return TABS[tab] || "Dashboard"; }
  return PAGES[p] || p;
}
