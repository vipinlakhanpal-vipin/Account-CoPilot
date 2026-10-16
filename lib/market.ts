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
  label: "FACT" | "LIKELY"; contacts: MContact[]; found_at: string; added_by?: string; customers_scanned_at?: string; hq_country?: string; branch?: boolean; branch_note?: string; coverage_only?: boolean; scope_note?: string; branch_source?: string };
export type PCustomer = { id: string; partner_id: string; partner: string; vendor: Vendor; region: string; customer: string; customer_website: string; slug: string; project: string;
  source_url: string; published: string; contacts: MContact[]; found_at: string };
export type MarketDoc = { vendor: Vendor; region: string; partners: Partner[]; customers: PCustomer[]; scanned_at: string };
export const marketKey = (vendor: string, region: string) => `market_intel:${vendor}:${region}`;

/** Help text for the two scan buttons in the Market intelligence window header. */
export const PARTNERS_TIP = "Finds the vendor's partners in the ticked regions, from its partner directory and the partners' websites. It does not look for customers. Tick Include all vendors on the left to do every vendor. Free; each scan takes a few minutes.";
export const CUSTOMERS_TIP = "For partners already on the list, reads their published customers: customer pages, case studies, go-lives, press and LinkedIn snippets. It works in batches of 8 partners per scan, skips partners done in the last 45 days, and you can click again for the next batch. Run Scan Partners first.";
