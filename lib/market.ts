// Market intelligence: SAP, Coupa, Oracle and Microsoft partners per region and the customers each publishes on its own website.
// Stored as one settings document per vendor and region (key market_intel:<vendor>:<region>), written only by the engine worker.
export const VENDORS = ["SAP", "Coupa", "Oracle", "Microsoft"] as const;
export type Vendor = (typeof VENDORS)[number];
export type MContact = { name: string; title: string; email: string; phone: string; linkedin_url: string; source_url: string };
export type Partner = { id: string; vendor: Vendor; region: string; name: string; website: string; tier: string; services: string; hq_city: string; source_url: string;
  label: "FACT" | "LIKELY"; contacts: MContact[]; found_at: string };
export type PCustomer = { id: string; partner_id: string; partner: string; vendor: Vendor; region: string; customer: string; customer_website: string; slug: string; project: string;
  source_url: string; published: string; contacts: MContact[]; found_at: string };
export type MarketDoc = { vendor: Vendor; region: string; partners: Partner[]; customers: PCustomer[]; scanned_at: string };
export const marketKey = (vendor: string, region: string) => `market_intel:${vendor}:${region}`;
