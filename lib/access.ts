import "server-only";
import type { User } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { REGIONS, regionOf } from "@/lib/icpDefinition.mjs";
import type { AllData, Row } from "@/lib/data";

// Roles & regions (v1.53). Super Admin: every region, consolidated view, team, engine and all ICPs.
// Standard: only their assigned region(s) — their data, their region's ICP — nothing else.
// Stored in public.user_access (see supabase/migrations/0004_region_access.sql); the database enforces the same rules.
export type Role = "super_admin" | "standard";
export type Access = { role: Role; regions: string[]; email: string; isSuper: boolean; ready: boolean };
export const ALL_REGIONS = REGIONS.map((r) => r.key);
export const ROLE_LABEL: Record<Role, string> = { super_admin: "Super Admin", standard: "Standard User" };

export async function getAccess(user: User | null): Promise<Access> {
  const email = (user?.email || "").toLowerCase();
  if (!user) return { role: "standard", regions: [], email, isSuper: false, ready: true };
  const { data, error } = await supabaseAdmin().from("user_access").select("role,regions").eq("user_id", user.id).maybeSingle();
  // Before the migration has been run the table doesn't exist: keep today's behaviour (everyone sees everything).
  if (error && /user_access|relation|schema cache/i.test(error.message)) return { role: "super_admin", regions: ALL_REGIONS, email, isSuper: true, ready: false };
  if (!data) return { role: "standard", regions: [], email, isSuper: false, ready: true };
  const isSuper = data.role === "super_admin";
  return { role: data.role as Role, regions: isSuper ? ALL_REGIONS : (data.regions || []).filter((r: string) => ALL_REGIONS.includes(r)), email, isSuper, ready: true };
}

export const canSeeCountry = (a: Access, country: unknown) => a.isSuper || a.regions.includes(regionOf(country));
export const canSeeRegion = (a: Access, region: string) => a.isSuper || a.regions.includes(region);

/** Keeps only the accounts in the user's regions, and every row linked to them. */
export function scopeData(d: AllData, a: Access): AllData {
  if (a.isSuper) return d;
  const accounts = d.accounts.filter((x) => canSeeCountry(a, x.country));
  const ids = new Set(accounts.map((x) => x.id));
  const mine = (r: Row) => ids.has(r.company_id);
  return { ...d, accounts, contacts: d.contacts.filter(mine), sources: d.sources.filter(mine), signals: d.signals.filter(mine),
    conflicts: d.conflicts.filter(mine), apps: d.apps.filter(mine), history: d.history.filter(mine), runs: d.runs.filter(mine) };
}
