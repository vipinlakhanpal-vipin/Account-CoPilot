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
export type Partner = { aka?: string[]; /* other names the same firm is listed under; a scan result under one of these goes to this partner */ id: string; vendor: Vendor; region: string; name: string; website: string; tier: string; services: string; hq_city: string; source_url: string;
  label: "FACT" | "LIKELY"; contacts: MContact[]; found_at: string; added_by?: string; customers_scanned_at?: string; hq_country?: string; branch?: boolean; branch_note?: string; coverage_only?: boolean; scope_note?: string; branch_source?: string; presence_pending?: boolean; office_address?: string; office_source?: string };
export type PCustomer = { id: string; partner_id: string; partner: string; vendor: Vendor; region: string; customer: string; customer_website: string; slug: string; project: string;
  source_url: string; published: string; contacts: MContact[]; found_at: string };
export type MarketDoc = { vendor: Vendor; region: string; partners: Partner[]; customers: PCustomer[]; scanned_at: string };
export const marketKey = (vendor: string, region: string) => `market_intel:${vendor}:${region}`;

/** Help text for the two scan buttons in the Market intelligence window header. */
export const PARTNERS_TIP = "Finds the vendor's partners in the ticked regions, from its partner directory and the partners' websites. It does not look for customers. Tick Include all vendors on the left to do every vendor. Free; each scan takes a few minutes.";
export const CUSTOMERS_TIP = "For partners already on the list, reads their published customers: customer pages, case studies, go-lives, press and LinkedIn snippets. It works in batches of 8 partners per scan, skips partners done in the last 45 days, and you can click again for the next batch. Run Scan Partners first.";

const COUNTRY_REGION: Record<string, string> = { uae: "UAE", "united arab emirates": "UAE", ksa: "KSA", "saudi arabia": "KSA", qatar: "Qatar", kuwait: "Kuwait", oman: "Oman", bahrain: "Bahrain", egypt: "Egypt", morocco: "Morocco", kenya: "Kenya", "south africa": "SouthAfrica", india: "India", switzerland: "Switzerland", uk: "UK", "united kingdom": "UK", usa: "USA", "united states": "USA" };
/** The app's region for a country name; an unknown country (Germany, Singapore ...) comes back as typed, so it never matches one of our regions. */
export const regionOfCountry = (c?: string) => (c ? COUNTRY_REGION[c.trim().toLowerCase()] || c.trim() : "");
/** The listing rule: a partner belongs under a region only with a local office in that region, shown by an address and a cited page (office_address + office_source). Based there or a branch of a foreign firm, the same proof: coverage alone ("serves the UAE", a global listing) does not count. */
export function presenceOk(p: { office_address?: string; office_source?: string }, _region?: string): boolean {
  return !!(p.office_address && p.office_address.trim().length >= 8 && /^https?:\/\//.test(p.office_source || ""));
}

/** A project description cut to a short label for tables ("Coupa S2P", "SAP S/4HANA"); the full text stays one click away behind the i button. */
export function projectShort(project: string, vendor = ""): string {
  const t = String(project || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const v = vendor === "all" ? "" : vendor;
  const p2p = /\bp2p\b|procure[- ]to[- ]pay|invoic|accounts payable|\bap automation\b/i.test(t);
  const s2c = /sourcing|\bs2c\b|\bcso\b|\bclm\b|contract lifecycle|supplier (information|management|risk)|\bsim\b|spend guard/i.test(t);
  if (/coupa|ariba|ivalua|jaggaer|gep\b/i.test(v) || /coupa|ariba/i.test(t)) {
    const name = v || (/ariba/i.test(t) ? "SAP Ariba" : "Coupa");
    if (p2p && s2c) return `${name} S2P`;
    if (p2p) return `${name} P2P`;
    if (/\bclm\b|contract/i.test(t) && !/sourcing/i.test(t)) return `${name} CLM`;
    if (s2c) return `${name} Sourcing`;
    if (/expense/i.test(t)) return `${name} Expense`;
  }
  // Product or kind of work named in the text, in order of weight; the vendor leads when the label does not already name it.
  const KINDS: [RegExp, string][] = [[/s\/?4\s?hana/i, "S/4HANA"], [/business one/i, "Business One"], [/\becc\b/i, "ECC"], [/sap erp|erp implementation|full erp/i, "ERP"], [/business central/i, "Business Central"],
    [/dynamics 365/i, "Dynamics 365"], [/fusion/i, "Fusion"], [/netsuite/i, "NetSuite"], [/e-business suite|\bebs\b/i, "EBS"], [/boomi|mulesoft|integration/i, "Integration"],
    [/client logo|listed client|reference/i, "Client reference"], [/digital transformation|roadmap/i, "Digital transformation"], [/support|managed service|\bams\b/i, "Support"]];
  const kind = KINDS.find(([re]) => re.test(t));
  if (kind) { const label = kind[1]; return v && !label.toLowerCase().includes(v.toLowerCase()) && /^(S\/4HANA|Business One|ECC|ERP|Business Central|Dynamics 365|Fusion|NetSuite|EBS|Integration|Support)$/.test(label) ? `${v} ${label}` : label; }
  const words = t.split(" ").slice(0, 4).join(" ");
  return words.length > 30 ? words.slice(0, 29).trimEnd() + "…" : words + (words.length < t.length ? "…" : "");
}
