import type { Row } from "@/lib/data";
import type { Person } from "@/lib/people";

// The dashboard's count tiles, defined once. The app's Dashboard and the Master Book's Executive Dashboard both read this,
// so a tile can never show a different number in the two places.
export type TileKind = "accounts" | "contacts" | "signals" | "conflicts" | "history";
export type Tile = { label: string; rows: Row[]; kind: TileKind; note?: string };

const SIG = ["VERY STRONG SIGNAL", "STRONG SIGNAL", "MODERATE SIGNAL", "WEAK SIGNAL", "NO SIGNAL", "CONFLICTING SIGNAL"];
const sigRank = (v?: string) => { const i = SIG.indexOf(v || ""); return i < 0 ? 9 : i; };
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const ACT = ["Evaluation", "RFP / Tender", "Currently Implementing", "Replacement / Transformation"];
const isCoupa = (a: Row) => /coupa/i.test(str(a.existing_s2p_product));

export function dashboardTiles(i: { A: Row[]; people: Person[]; coById: Record<string, Row>; signals: Row[]; conflicts: Row[]; history: Row[] }) {
  const { A, people, coById } = i;
  // Prospect tiles leave out existing Coupa customers: they are the install base (upsell, services), not new business.
  const notCoupa = (a: Row) => !isCoupa(a);
  const inScopeSignal = (s: Row) => { const c = coById[s.company_id]; return !!c && !isCoupa(c); };
  const top = A.filter((a) => sigRank(a.s2p_signal_level) <= 1 && notCoupa(a)).sort((a, b) => sigRank(a.s2p_signal_level) - sigRank(b.s2p_signal_level));
  const kpis: Tile[] = [
    { label: "Accounts (all lists)", rows: A, kind: "accounts" },
    { label: "ICP — Verified", rows: A.filter((a) => a.icp_status === "ICP — Verified" && notCoupa(a)), kind: "accounts" },
    { label: "ICP — Likely", rows: A.filter((a) => a.icp_status === "ICP — Likely" && notCoupa(a)), kind: "accounts" },
    { label: "ICP — Needs check", rows: A.filter((a) => (a.icp_status === "ICP — Needs check" || a.icp_status === "Unknown") && notCoupa(a)), kind: "accounts" },
    { label: "Strong / very strong", rows: top, kind: "accounts" },
    { label: "Contacts (people)", rows: people, kind: "contacts" },
    { label: "Confirmed by 2+ sources", rows: people.filter((p) => p.trust === "Confirmed by 2+ sources" && !!coById[p.company_id] && notCoupa(coById[p.company_id])), kind: "contacts" },
    { label: "Contacts with email", rows: people.filter((p) => p.email), kind: "contacts" },
    { label: "Signals logged", rows: i.signals.filter(inScopeSignal), kind: "signals" },
    { label: "Conflicts retained", rows: i.conflicts, kind: "conflicts" },
    { label: "Employment changes", rows: i.history.filter((h) => /change/i.test(str(h.determination))), kind: "history" },
    { label: "Possible new S2P projects", rows: A.filter((a) => ACT.includes(a.s2p_platform_status)), kind: "accounts" },
    { label: "RFPs / tenders open", rows: A.filter((a) => a.s2p_platform_status === "RFP / Tender" && notCoupa(a)), kind: "accounts" },
  ];
  const coupaCustomers = A.filter(isCoupa);
  const aribaCustomers = A.filter((a) => /ariba/i.test(str(a.existing_s2p_product)));
  const otherPlatformCustomers = A.filter((a) => /oracle procurement|ivalua|jaggaer|\bgep\b|zycus/i.test(str(a.existing_s2p_product)));
  const customers: Tile[] = [
    { label: "Existing Coupa Customers", rows: coupaCustomers, kind: "accounts", note: "Upsell, cross-sell & managed services opportunities" },
    { label: "Ariba Customers", rows: aribaCustomers, kind: "accounts", note: "Managed services opportunity — still a Coupa prospect" },
    { label: "Other Platforms", rows: otherPlatformCustomers, kind: "accounts", note: "GEP, Jaggaer, Ivalua, Zycus — managed services opportunity" },
  ];
  return { kpis, customers, top, coupaCustomers, aribaCustomers, otherPlatformCustomers };
}
