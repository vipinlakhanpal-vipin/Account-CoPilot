// Activity log and who-is-online. Tables activity_log and user_presence (migration 0007), written and read only by /api/activity.
export const ACTIVITY_KINDS = ["visit", "page", "ping", "search", "report", "contacts", "scan", "aria"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
export const KIND_LABEL: Record<string, string> = { visit: "Opened the app", page: "Opened a page", search: "Searched", report: "Downloaded a report", contacts: "Find contacts", scan: "Started a scan", aria: "Asked Aria" };

const TABS: Record<string, string> = { pipeline: "Accounts → Pipeline", accounts: "Accounts → All accounts", stakeholders: "Accounts → Stakeholders", signals: "Accounts → S2P Signals", erp: "Accounts → ERP & Apps",
  conflicts: "Data → Conflicts", sources: "Data → Sources", reports: "Dashboard → Mission Control" };
const PAGES: Record<string, string> = { "/research": "Data → Research Queue", "/settings": "Setup → Settings", "/guide": "Setup → Learn Me", "/icp": "Setup → Define ICP", "/team": "Setup → Team", "/home": "Home",
  "/find": "Find company", "/signals": "Buying signals", "/market": "Market intelligence",
  "/nav/find": "Find company", "/nav/about": "Home", "/nav/daily-run": "Home → Daily run", "/nav/market": "Market intelligence", "/nav/signals": "Buying signals", "/nav/wizard": "Home → Setup wizard",
  "/nav/settings/icp": "Setup → Define ICP", "/nav/settings/engine": "Setup → Settings", "/nav/team": "Setup → Team", "/nav/games": "Aria playroom", "/nav/settings/guide": "Setup → Learn Me", "/nav/suggestions": "Suggestions" };
/** A readable name for a path such as "/?tab=pipeline" or "/find": the section, then the tab or page. */
export function pageLabel(path: string): string {
  const [p, q = ""] = path.split("?");
  if (p === "/") { const sp = new URLSearchParams(q); const tab = sp.get("tab") || ""; return TABS[tab] || (sp.get("open") ? "Accounts → an account page" : "Dashboard"); }
  return PAGES[p] || p;
}

/** The places and features that count towards "% used". Standard Users cannot open Team or Settings, so those are not counted for them. */
export const USAGE_AREAS: { label: string; adminOnly?: boolean }[] = [
  { label: "Dashboard" }, { label: "Dashboard → Mission Control" }, { label: "Accounts → All accounts" }, { label: "Accounts → Pipeline" }, { label: "Accounts → Stakeholders" },
  { label: "Accounts → S2P Signals" }, { label: "Accounts → ERP & Apps" }, { label: "Data → Sources" }, { label: "Data → Conflicts" }, { label: "Data → Research Queue" },
  { label: "Setup → Define ICP" }, { label: "Setup → Settings", adminOnly: true }, { label: "Setup → Learn Me" }, { label: "Setup → Team", adminOnly: true },
  { label: "Home" }, { label: "Find company" }, { label: "Buying signals" }, { label: "Market intelligence" },
  { label: "Reports (PDF or Excel)" }, { label: "Find contacts" }, { label: "Scans" }, { label: "Aria" },
];
const KIND_AREA: Record<string, string> = { report: "Reports (PDF or Excel)", contacts: "Find contacts", scan: "Scans", aria: "Aria" };
/** Which usage area a log row belongs to, or "" when it is not one (an account page, a ping). */
export const areaOf = (kind: string, path: string) => (kind === "page" ? pageLabel(path) : KIND_AREA[kind] || "");
export const fmtDuration = (secs: number) => (secs < 60 ? (secs > 0 ? "under a minute" : "—") : secs < 3600 ? `${Math.round(secs / 60)} min` : `${Math.floor(secs / 3600)} h ${Math.round((secs % 3600) / 60)} min`);
