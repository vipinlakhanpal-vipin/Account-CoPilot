// Market intelligence: SAP, Coupa, Oracle and Microsoft partners per region and the customers each publishes on its own website.
// Stored as one settings document per vendor and region (key market_intel:<vendor>:<region>), written only by the engine worker.
export const DEFAULT_VENDORS = ["SAP", "Coupa", "Oracle", "Microsoft", "Boomi", "MuleSoft", "Ivalua", "GEP", "Jaggaer"];
/** A vendor name: one of the defaults or one a Super Admin added in the window (settings.market_vendors = { custom: string[] }). */
export type Vendor = string;
export const VENDORS_KEY = "market_vendors";
export const cleanVendor = (s: string) => s.trim().replace(/\s+/g, " ").slice(0, 30);
export const validVendor = (s: string) => /^[A-Za-z0-9][A-Za-z0-9 .&+-]{1,29}$/.test(s);
/** The defaults followed by the added vendors (no duplicates, case-insensitive). */
export function vendorList(custom: unknown): string[] {
  const out = [...DEFAULT_VENDORS];
  if (Array.isArray(custom)) for (const v of custom.map((x) => cleanVendor(String(x)))) if (validVendor(v) && !out.some((o) => o.toLowerCase() === v.toLowerCase())) out.push(v);
  return out;
}
export type MContact = { name: string; title: string; email: string; phone: string; linkedin_url: string; source_url: string };
export type Partner = { id: string; vendor: Vendor; region: string; name: string; website: string; tier: string; services: string; hq_city: string; source_url: string;
  label: "FACT" | "LIKELY"; contacts: MContact[]; found_at: string };
export type PCustomer = { id: string; partner_id: string; partner: string; vendor: Vendor; region: string; customer: string; customer_website: string; slug: string; project: string;
  source_url: string; published: string; contacts: MContact[]; found_at: string };
export type MarketDoc = { vendor: Vendor; region: string; partners: Partner[]; customers: PCustomer[]; scanned_at: string };
export const marketKey = (vendor: string, region: string) => `market_intel:${vendor}:${region}`;
