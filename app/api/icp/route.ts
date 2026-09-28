import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getAccess, canSeeRegion } from "@/lib/access";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { invalidateAllData } from "@/lib/dataCache";
import { statusPatch } from "@/lib/icpStatus.mjs";
import { normalizeDefinition, rulesFor, regionOf, validateRules, summarizeRules, REGIONS, type Definition, type Rules } from "@/lib/icpDefinition.mjs";

// Setup → Define ICP. GET = the definition in force. POST { action: "preview" | "save", definition }:
//   preview → validation problems + how many accounts would change status in each region (nothing is written)
//   save    → validates, stores settings.icp_definition with a history line, re-applies ICP status to every company at once,
//             and keeps the left panel's default revenue / employee bands in step with the UAE rules.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const STATUSES = ["ICP — Verified", "ICP — Likely", "ICP — Needs check", "Unknown", "Not ICP"];

async function load(db: ReturnType<typeof supabaseAdmin>): Promise<Definition> {
  const { data } = await db.from("settings").select("value").eq("key", "icp_definition").maybeSingle();
  return normalizeDefinition(data?.value);
}

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const access = await getAccess(user), def = await load(supabaseAdmin());
  return NextResponse.json({ ...def, regions: Object.fromEntries(Object.entries(def.regions).filter(([k]) => canSeeRegion(access, k))) });
}

/** What changed between two definitions, in plain words (for the history line). */
function diff(a: Definition, b: Definition) {
  const out: string[] = [];
  for (const { key } of REGIONS) {
    const x = a.regions[key], y = b.regions[key];
    if (JSON.stringify(x) === JSON.stringify(y)) continue;
    const bits: string[] = [];
    const walk = (p: string, u: unknown, v: unknown) => {
      if (JSON.stringify(u) === JSON.stringify(v)) return;
      if (u && v && typeof u === "object" && typeof v === "object" && !Array.isArray(u) && !Array.isArray(v)) {
        for (const k of new Set([...Object.keys(u as object), ...Object.keys(v as object)])) walk(p ? `${p}.${k}` : k, (u as Record<string, unknown>)[k], (v as Record<string, unknown>)[k]);
      } else bits.push(`${p}: ${Array.isArray(u) ? u.join(", ") || "none" : u ?? "none"} → ${Array.isArray(v) ? v.join(", ") || "none" : v ?? "none"}`);
    };
    walk("", x, y);
    out.push(`${key} — ${bits.slice(0, 8).join("; ")}${bits.length > 8 ? `; +${bits.length - 8} more` : ""}`);
  }
  return out;
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const body = await req.json().catch(() => null) as { action?: string; definition?: Definition } | null;
  const db = supabaseAdmin();
  const access = await getAccess(user);
  if (!body?.definition?.regions || !["preview", "save"].includes(String(body.action))) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  if (!access.regions.length) return NextResponse.json({ ok: false, error: "No region is assigned to you." }, { status: 403 });
  const current = await load(db);
  // A Standard user's save can only change their own region(s): every other region is taken from the saved definition.
  const regions = Object.fromEntries(REGIONS.map(({ key }) => [key, canSeeRegion(access, key) && body.definition!.regions[key] ? body.definition!.regions[key] : current.regions[key]]));
  const next = normalizeDefinition({ ...current, regions });
  const problems = REGIONS.filter(({ key }) => canSeeRegion(access, key)).flatMap(({ key }) => validateRules(key, next.regions[key] as Rules));

  // Impact: status of every company under the new rules vs now.
  const { data: cos, error } = await db.from("companies").select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const impact: Record<string, { before: Record<string, number>; after: Record<string, number>; changes: { company: string; from: string; to: string; why: string }[] }> = {};
  const patches: { id: string; patch: Record<string, unknown> }[] = [];
  for (const c of cos || []) {
    const key = regionOf(c.country);
    if (!canSeeRegion(access, key)) continue; // Standard users see and change only their region
    const r = (impact[key] ||= { before: Object.fromEntries(STATUSES.map((s) => [s, 0])), after: Object.fromEntries(STATUSES.map((s) => [s, 0])), changes: [] });
    const { status, patch } = statusPatch(c, rulesFor(next, c.country));
    r.before[c.icp_status] = (r.before[c.icp_status] || 0) + 1; r.after[status] = (r.after[status] || 0) + 1;
    if (status !== c.icp_status) { r.changes.push({ company: c.company_name, from: c.icp_status, to: status, why: String(patch.icp_fit_reason || "").slice(0, 180) }); patches.push({ id: c.id, patch }); }
  }
  const changed = patches.length;
  const changes = diff(current, next);
  if (body.action === "preview" || problems.length) {
    return NextResponse.json({ ok: !problems.length, problems, impact, changed, changes }, { status: problems.length && body.action === "save" ? 422 : 200 });
  }

  const by = (user.user_metadata?.name as string) || user.email || "unknown";
  const at = new Date().toISOString();
  const saved: Definition = { ...next, version: (current.version || 1) + 1, updated_at: at, updated_by: by,
    history: [{ at, by, summary: changes.length ? changes.join(" | ") : "Saved with no changes" }, ...(current.history || [])].slice(0, 50) };
  const { error: e1 } = await db.from("settings").upsert({ key: "icp_definition", value: saved, updated_at: at });
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });
  // Re-apply ICP status now, so the app matches the new definition immediately.
  for (const p of patches) await db.from("companies").update(p.patch).eq("id", p.id);
  // Keep the left panel's default size filters in step with the UAE rules (other filters untouched). Super Admin saves only.
  if (access.isSuper) {
  const uae = saved.regions.UAE;
  const REV: [string, number, number][] = [["<$100M", 0, 100], ["$100M-$250M", 100, 250], ["$250M-$500M", 250, 500], ["$500M-$1B", 500, 1000], ["$1B-$5B", 1000, 5000], ["$5B+", 5000, Infinity]];
  const EMP: [string, number, number][] = [["100-250", 100, 250], ["250-500", 250, 500], ["500-1000", 500, 1000], ["1000-5000", 1000, 5000], ["5000+", 5000, Infinity]];
  const revenue = REV.filter(([, lo, hi]) => hi > uae.revenue.min_usd_m && (uae.revenue.max_usd_m == null || lo < uae.revenue.max_usd_m)).map(([l]) => l);
  const employees = EMP.filter(([, lo, hi]) => hi > uae.employees.min && (uae.employees.max == null || lo < uae.employees.max)).map(([l]) => l);
  const { data: crit } = await db.from("settings").select("value").eq("key", "icp_criteria").maybeSingle();
  const cv = (crit?.value || {}) as { company?: Record<string, unknown> };
  await db.from("settings").upsert({ key: "icp_criteria", updated_at: at,
    value: { ...cv, company: { ...(cv.company || {}), revenue, employees }, _meta: { by: `${by} (via Define ICP)`, at } } });
  }
  invalidateAllData();
  return NextResponse.json({ ok: true, saved: { version: saved.version, at, by }, changed, impact, changes, summary: Object.entries(saved.regions).map(([k, r]) => summarizeRules(k, r)) });
}
