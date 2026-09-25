import { z } from "zod";

export const SIGNAL_LEVELS = ["VERY STRONG SIGNAL", "STRONG SIGNAL", "MODERATE SIGNAL", "WEAK SIGNAL", "NO SIGNAL", "CONFLICTING SIGNAL"] as const;
export const S2P_PRODUCTS = ["Coupa", "SAP Ariba", "Coupa + SAP Ariba", "Other S2P", "Multiple S2P Platforms", "No Evidence", "Unknown"] as const;
export const S2P_STATUS = ["Confirmed Current", "Confirmed Historical", "Currently Implementing", "Expansion / Rollout", "Evaluation", "RFP / Tender",
  "Replacement / Transformation", "Integration Project", "Optimization", "Managed Services Opportunity", "No Evidence", "Unknown"] as const;
export const COUPA_OPP = ["Existing Coupa Customer — Managed Services", "Existing Coupa Customer — Optimization", "Existing Coupa Customer — Integration",
  "Existing Coupa Customer — Expansion", "Coupa Implementation Opportunity", "Coupa Evaluation", "Coupa Replacement / Transformation", "No Evidence"] as const;
export const ARIBA_OPP = ["Existing Ariba Customer — Managed Services", "Existing Ariba Customer — Optimization", "Existing Ariba Customer — Integration",
  "Existing Ariba Customer — Expansion", "Ariba Implementation Opportunity", "Ariba Evaluation", "Ariba Replacement / Transformation", "No Evidence"] as const;
const STATUS = z.enum(["FACT", "LIKELY", "UNVERIFIED", "CONFLICTING", "UNKNOWN"]);
const CONF = z.enum(["HIGH", "MEDIUM", "LOW"]);

export const Company = z.object({
  company_name: z.string(), company_website: z.string(), domain: z.string(), country: z.string(), hq_city: z.string(),
  exchange: z.string(), ticker: z.string(), industry: z.string(),
  revenue_usd_m: z.number().nullable(), revenue_local: z.string(), revenue_fy: z.string(), revenue_source_url: z.string(),
  employee_range: z.string(), employee_source: z.string(),
  icp_fit: z.enum(["Yes", "No", "Borderline"]), icp_fit_reason: z.string(),
  ownership: z.string(), parent_company: z.string(), subsidiaries: z.string(), procurement_model: z.string(),
  erp: z.string(), erp_status: STATUS, erp_evidence: z.string(),
  third_party_apps: z.array(z.object({ name: z.string(), category: z.string(), status: STATUS, evidence: z.string(), source_url: z.string() })),
  existing_s2p_product: z.enum(S2P_PRODUCTS), existing_s2p_detail: z.string(),
  s2p_platform_status: z.enum(S2P_STATUS), s2p_signal_level: z.enum(SIGNAL_LEVELS), s2p_strong_signals: z.string(),
  digital_transformation_signals: z.string(), procurement_transformation_signals: z.string(), relevant_technologies: z.string(),
  known_implementation_partner: z.string(), known_consulting_partner: z.string(),
  coupa_opportunity_type: z.enum(COUPA_OPP), ariba_opportunity_type: z.enum(ARIBA_OPP),
  potential_opportunity: z.string(), board_phone: z.string(), board_phone_source: z.string(),
  account_notes: z.string(), research_confidence: CONF,
});

export const Contact = z.object({
  full_name: z.string(), nationality: z.string(), title_verbatim: z.string(), standardized_title: z.string(),
  role_family: z.enum(["PROCUREMENT", "FINANCE", "IT", "SUPPLY CHAIN", "TRANSFORMATION", "OTHER"]),
  contact_tier: z.enum(["Tier 1", "Tier 2", "Tier 3", "Tier 4"]),
  channel_source: z.string(), source: z.string(), source_type: z.string(), source_url: z.string(), second_source_url: z.string(),
  verification_status: z.enum(["VERIFIED", "LIKELY CURRENT", "UNVERIFIED", "CONFLICTING"]),
  linkedin_url: z.string(), location: z.string(), country: z.string(),
  email: z.string(), email_status: z.enum(["Publicly Listed", "Unverified", "Not Found"]), email_source: z.string(),
  phone: z.string(), phone_type: z.string(), phone_source: z.string(),
  employment_status: z.enum(["Current", "Recently Changed", "Previous", "Unknown"]),
  previous_company: z.string(), previous_title: z.string(),
  s2p_contact_signal: z.string(), notes_contact: z.string(), confidence: CONF,
});

export const ResearchResult = z.object({
  company: Company,
  contacts: z.array(Contact),
  signals: z.array(z.object({
    category: z.enum(["PROCUREMENT TRANSFORMATION", "TECHNOLOGY", "ORGANIZATIONAL", "COMMERCIAL", "JOB MARKET"]),
    signal: z.string(), level: z.enum(SIGNAL_LEVELS), platform: z.string(), evidence: z.string(), source_url: z.string(), date: z.string(),
  })),
  sources: z.array(z.object({
    source: z.string(), source_type: z.string(), source_tier: z.enum(["Tier 1", "Tier 2", "Tier 3", "Tier 4"]), url: z.string(),
    information_found: z.string(), evidence: z.string(), date_published: z.string(), confidence: CONF, related_contact: z.string(),
    supports_current_employment: z.enum(["Yes", "No", "N/A"]), supports_current_title: z.enum(["Yes", "No", "N/A"]),
    supports_s2p_status: z.enum(["Yes", "No", "N/A"]),
  })),
  employment_history: z.array(z.object({
    full_name: z.string(), company: z.string(), title: z.string(), source: z.string(), source_url: z.string(),
    determination: z.string(), evidence: z.string(),
  })),
  conflicts: z.array(z.object({
    entity: z.string(), field: z.string(), value_a: z.string(), source_a: z.string(), value_b: z.string(), source_b: z.string(),
    determination: z.string(), evidence: z.string(),
  })),
});
export type ResearchResultT = z.infer<typeof ResearchResult>;
