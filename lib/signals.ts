// Buying signals: companies showing intent to buy or change ERP / source-to-pay, public tenders and RFPs, and SAP ECC owners who need an S/4HANA partner.
// Stored in settings.buying_signals (no table), written only by the engine worker (scheduled sessions) and read through /api/signals.
export type SignalLane = "erp" | "rfp" | "ecc";
export type SignalStrength = "Hot" | "Warm" | "Watch";
export type SignalStatus = "new" | "seen" | "done" | "dismissed";
export type Signal = {
  id: string; lane: SignalLane; strength: SignalStrength; label: "FACT" | "LIKELY" | "UNVERIFIED";
  company_name: string; slug: string; region: string; title: string; evidence: string; why: string;
  source_name: string; source_url: string; doc_url: string; needs_login: boolean; published: string; closes: string;
  detected_at: string; status: SignalStatus;
};
export type SignalStore = { items: Signal[]; scans: Record<string, string>; sweeps: Record<string, string> };
export const EMPTY_STORE: SignalStore = { items: [], scans: {}, sweeps: {} };
export const LANE_LABEL: Record<SignalLane, string> = { erp: "ERP and S2P buying", rfp: "Tenders and RFPs", ecc: "ECC to S/4HANA" };
export const STRENGTH_ORDER: Record<SignalStrength, number> = { Hot: 0, Warm: 1, Watch: 2 };
/** Days until a tender closes (negative when closed); null when no closing date. */
export const daysLeft = (closes: string, now = Date.now()) => closes ? Math.ceil((new Date(closes + "T23:59:59Z").getTime() - now) / 864e5) : null;
