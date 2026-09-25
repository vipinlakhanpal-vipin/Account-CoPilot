// Bump APP_VERSION on every release (v1.0, v1.1, v1.2 …) and add a line to RELEASES.
export const APP_VERSION = "1.11";

export const RELEASES: { version: string; date: string; notes: string }[] = [
  { version: "1.11", date: "2026-09-25", notes: "Footer: Designed and created by Vipin." },
  { version: "1.10", date: "2026-09-25", notes: "Country tiles under the nav filter the dashboard and every tab; record dates (added, updated, status since) in Accounts, briefs and Excel; cost-impact notes on actions that use the Anthropic API; all nav tabs fit on screen; revenue checks keep their notes on recompute." },
  { version: "1.9", date: "2026-09-25", notes: "Filters stay on one row; row count moved below the filters." },
  { version: "1.8", date: "2026-09-25", notes: "Clickable dashboard tiles open a drill-down of the records behind each number; contact cards from Stakeholders and account briefs." },
  { version: "1.7", date: "2026-09-25", notes: "Profile menu (name, email, joined from, log out), invite colleagues, Costs & usage guide in Settings, header keeps Download on the first row." },
  { version: "1.6", date: "2026-09-25", notes: "Colour-filled filters that light up when active; Clear filters button." },
  { version: "1.5", date: "2026-09-25", notes: "One ICP scale (revenue ≥ $250M, 100+ staff; listing not required): Verified, Likely, Needs check, Unknown, Not ICP. Best-available revenue with its source." },
  { version: "1.4", date: "2026-09-25", notes: "ICP status combines your revenue figure with Seamless; revenue conflicts flagged; reason shown on hover and in the account brief; ICP legend on Accounts." },
  { version: "1.3", date: "2026-09-25", notes: "Revenue shown as $6.04B / $600M in the app and Excel." },
  { version: "1.2", date: "2026-09-25", notes: "Navy + teal theme, logo, gradient app name, colour-edged KPI tiles and colourful charts, page hero panels, upgrade banner, instant tab switching, counts next to table titles, role family grouped by department, reference-sheet annotation rows moved to Conflicts, Seamless verification of your target list." },
  { version: "1.1", date: "2026-09-25", notes: "Your target lists imported: 158 more accounts, all 665 stakeholder contacts, ICP status and list tags, Your profiling panel, Target List (Reference) Excel tab." },
  { version: "1.0", date: "2026-09-25", notes: "First release: dashboard, accounts, stakeholders, S2P signals, ERP & apps, conflicts, sources, research queue, pitch planner, Excel export, version badge." },
];
