// Bump APP_VERSION on every release (v1.0, v1.1, v1.2 …) and add a line to RELEASES.
export const APP_VERSION = "1.1";

export const RELEASES: { version: string; date: string; notes: string }[] = [
  { version: "1.1", date: "2026-09-25", notes: "Your target lists imported: 158 more accounts, all 665 stakeholder contacts, ICP status and list tags, Your profiling panel, Target List (Reference) Excel tab." },
  { version: "1.0", date: "2026-09-25", notes: "First release: dashboard, accounts, stakeholders, S2P signals, ERP & apps, conflicts, sources, research queue, pitch planner, Excel export, version badge." },
];
