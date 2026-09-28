/* eslint-disable @typescript-eslint/no-explicit-any */
export type Rules = {
  status: "active" | "paused" | "next";
  currency: { code: string; per_usd: number };
  revenue: { min_usd_m: number; max_usd_m: number | null; basis_general: string; basis_banks: string; basis_insurers: string };
  employees: { min: number; max: number | null };
  listing: "any" | "listed_only" | "private_only";
  ownership_allowed: string[];
  entity_level: "group_hq" | "group_and_subsidiaries" | "any";
  industries_include: string[];
  industries_exclude: string[];
  exclude: { government_bodies: boolean; single_sites: boolean; foreign_branches: boolean; keywords: string };
  evidence: { verified_sources: string[]; estimates_can_make_likely: boolean; not_icp_estimate_below_usd_m: number; not_icp_estimate_max_staff: number;
    seamless_likely_min_staff: number; recheck_days: number };
  pipeline: { w_match: number; w_opportunity: number; w_fit: number; min_match: number; exclude_not_icp: boolean };
  focus: { platforms: string[]; erp: string[]; triggers: string[] };
  personas: { departments: string[]; seniority: string[]; roles: string[]; max_per_account: number };
  engine: { discover_per_day: number; verify_per_day: number };
  notes: string;
};
export type Definition = { version: number; regions: Record<string, Rules>; history: { at: string; by: string; summary: string }[]; updated_at: string | null; updated_by: string | null };
export const REGIONS: { key: string; name: string; countries: string[]; currency: { code: string; per_usd: number } }[];
export const OPTIONS: {
  status: [string, string][]; listing: [string, string][]; entity: [string, string][]; ownership: string[]; industries: string[]; verifiedSources: string[];
  platforms: string[]; erp: string[]; triggers: string[]; departments: string[]; seniority: string[]; roles: string[];
};
export const DEFAULT_RULES: Rules;
export function defaultDefinition(): Definition;
export function normalizeDefinition(def: any): Definition;
export function regionOf(country: unknown): string;
export function rulesFor(def: any, country: unknown): Rules;
export function validateRules(key: string, r: Rules): string[];
export function summarizeRules(key: string, r: Rules): string;
