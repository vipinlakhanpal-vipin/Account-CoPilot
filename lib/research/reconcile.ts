import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResearchResultT } from "./schema";

/** RECONCILER + HISTORIAN.
 * New values fill blanks; differing non-blank values are never overwritten. They are logged as
 * observations and conflicts so both versions stay visible. */

export const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const HONORIFIC = /^(dr|eng|engr|mr|mrs|ms|h\.?e|sheikh|shaikh)\.?\s+/i;
export const nameKey = (n: string) => { let s = n.trim(); while (HONORIFIC.test(s)) s = s.replace(HONORIFIC, ""); return norm(s); };
export const slugify = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, "").replace(/\b(pjsc|psc|plc|p\.j\.s\.c\.?|llc|company|co)\b/g, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function similar(a: string, b: string) {
  const x = norm(a), y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  // Dice coefficient on bigrams
  const bg = (s: string) => { const m = new Map<string, number>(); for (let i = 0; i < s.length - 1; i++) { const k = s.slice(i, i + 2); m.set(k, (m.get(k) || 0) + 1); } return m; };
  const A = bg(x), B = bg(y); let hit = 0;
  A.forEach((n, k) => { hit += Math.min(n, B.get(k) || 0); });
  return (2 * hit) / (Math.max(1, x.length - 1) + Math.max(1, y.length - 1));
}

const GENERIC = /^(info|sales|contact|support|admin|hello|enquir|procurement|careers|hr|ir|investor|media|press|marketing|office|mail|service)/i;
const PERSONAL = /@(gmail|yahoo|outlook|hotmail|live|icloud|aol|msn|proton|protonmail|ymail)\./i;
const emailOk = (e: string) => !!e && e.includes("@") && !GENERIC.test(e.split("@")[0]) && !PERSONAL.test(e);

const COMPANY_FIELDS = ["company_website", "domain", "country", "hq_city", "exchange", "ticker", "industry", "revenue_usd_m", "revenue_local",
  "revenue_fy", "revenue_source_url", "employee_range", "employee_source", "icp_fit", "icp_fit_reason", "ownership", "parent_company", "subsidiaries",
  "procurement_model", "erp", "erp_status", "erp_evidence", "existing_s2p_product", "existing_s2p_detail", "s2p_platform_status", "s2p_signal_level",
  "s2p_strong_signals", "digital_transformation_signals", "procurement_transformation_signals", "relevant_technologies",
  "known_implementation_partner", "known_consulting_partner", "coupa_opportunity_type", "ariba_opportunity_type", "potential_opportunity",
  "board_phone", "board_phone_source", "account_notes", "research_confidence"] as const;
// Fields where a change is material enough to raise a conflict for review
const MATERIAL = new Set(["erp", "existing_s2p_product", "s2p_platform_status", "s2p_signal_level", "parent_company", "exchange", "ticker",
  "coupa_opportunity_type", "ariba_opportunity_type", "icp_fit"]);
const PLACEHOLDER = new Set(["", "unknown", "noevidence", "nosignal", "notpubliclyverified", "null"]);
const blank = (v: unknown) => v === null || v === undefined || PLACEHOLDER.has(norm(v));

export async function reconcile(db: SupabaseClient, runId: string, r: ResearchResultT, companyId?: string) {
  const now = new Date().toISOString();
  const stats = { company: "", newContacts: 0, updatedContacts: 0, conflicts: 0, signals: r.signals.length, sources: r.sources.length };
  const conflicts: Record<string, unknown>[] = [];
  const observations: Record<string, unknown>[] = [];

  // ---- company
  let existing: Record<string, unknown> | null = null;
  if (companyId) existing = (await db.from("companies").select("*").eq("id", companyId).maybeSingle()).data;
  if (!existing && r.company.domain) existing = (await db.from("companies").select("*").eq("domain", r.company.domain).maybeSingle()).data;
  const slug = slugify(r.company.company_name);
  if (!existing) existing = (await db.from("companies").select("*").eq("slug", slug).maybeSingle()).data;

  const c = r.company as unknown as Record<string, unknown>;
  let cid: string;
  if (!existing) {
    const row: Record<string, unknown> = { slug, company_name: r.company.company_name, research_channel: "Claude", last_researched: now };
    COMPANY_FIELDS.forEach((f) => { row[f] = c[f]; });
    const ins = await db.from("companies").insert(row).select("id").single();
    if (ins.error) throw ins.error;
    cid = ins.data.id;
    stats.company = "created";
  } else {
    cid = existing.id as string;
    const patch: Record<string, unknown> = { last_researched: now, updated_at: now };
    for (const f of COMPANY_FIELDS) {
      const oldV = existing[f], newV = c[f];
      if (blank(newV)) continue;
      if (blank(oldV)) { patch[f] = newV; continue; }
      if (norm(oldV) !== norm(newV)) {
        observations.push({ run_id: runId, entity_type: "company", entity_id: cid, field: f, old_value: String(oldV), new_value: String(newV),
          source_url: r.company.revenue_source_url || "", change_confidence: r.company.research_confidence });
        if (MATERIAL.has(f)) conflicts.push({ company_id: cid, entity: r.company.company_name, field: f, value_a: String(oldV), source_a: "Existing record",
          value_b: String(newV), source_b: `Claude research ${now.slice(0, 10)}`, determination: "LIKELY CURRENT (newer research) — review", evidence: "" });
      }
    }
    await db.from("companies").update(patch).eq("id", cid);
    stats.company = "refreshed";
  }

  // ---- contacts
  const { data: people } = await db.from("contacts").select("*").eq("company_id", cid);
  const current = people || [];
  for (const p of r.contacts) {
    if (p.email && !emailOk(p.email)) { p.email = ""; p.email_status = "Not Found"; }
    const match = current.find((x) => similar(nameKey(x.full_name), nameKey(p.full_name)) > 0.85);
    if (!match) {
      const ins = await db.from("contacts").insert({
        ...p, company_id: cid, research_channel: "Claude", channel_state: "Claude", record_status: "New (Claude)",
        nationality: p.nationality || "Not Publicly Verified", last_researched: now,
        last_verified: p.verification_status === "VERIFIED" ? now : null,
      }).select("id").single();
      if (!ins.error) stats.newContacts++;
      continue;
    }
    const patch: Record<string, unknown> = { last_researched: now };
    for (const f of ["linkedin_url", "location", "country", "standardized_title", "second_source_url"] as const) {
      if (!match[f] && p[f]) patch[f] = p[f];
    }
    if (!match.email && p.email) Object.assign(patch, { email: p.email, email_status: p.email_status, email_source: p.email_source });
    if (!match.phone && p.phone) Object.assign(patch, { phone: p.phone, phone_type: p.phone_type, phone_source: p.phone_source });
    if (p.title_verbatim && match.title_verbatim && similar(match.title_verbatim, p.title_verbatim) < 0.8) {
      conflicts.push({ company_id: cid, entity: p.full_name, field: "Title", value_a: match.title_verbatim, source_a: match.source || match.channel_state || "Existing",
        value_b: p.title_verbatim, source_b: `${p.source_type} ${p.source_url}`.trim(), determination: "CONFLICT — TITLE (both retained)", evidence: p.notes_contact });
      observations.push({ run_id: runId, entity_type: "contact", entity_id: match.id, field: "title_verbatim", old_value: match.title_verbatim,
        new_value: p.title_verbatim, source_url: p.source_url, change_confidence: p.confidence });
    }
    if (p.employment_status === "Recently Changed" || p.employment_status === "Previous") {
      patch.employment_status = p.employment_status;
      observations.push({ run_id: runId, entity_type: "contact", entity_id: match.id, field: "employment_status", old_value: match.employment_status,
        new_value: p.employment_status, source_url: p.source_url, change_confidence: p.confidence });
    }
    patch.claude_check = `Claude ${now.slice(0, 10)}: ${p.verification_status} via ${p.source_type} ${p.source_url}`.trim();
    if (p.verification_status === "VERIFIED") patch.last_verified = now;
    await db.from("contacts").update(patch).eq("id", match.id);
    stats.updatedContacts++;
  }

  // ---- evidence (append-only)
  const tag = (rows: Record<string, unknown>[]) => rows.map((x) => ({ ...x, company_id: cid, run_id: runId }));
  if (r.signals.length) await db.from("s2p_signals").insert(tag(r.signals));
  if (r.sources.length) await db.from("sources").insert(tag(r.sources));
  if (r.company.third_party_apps.length) await db.from("technology_evidence").insert(tag(r.company.third_party_apps));
  if (r.employment_history.length) await db.from("employment_history").insert(r.employment_history.map((h) => ({ ...h, company_id: cid })));
  const allConflicts = [...conflicts, ...r.conflicts.map((x) => ({ ...x, company_id: cid }))];
  if (allConflicts.length) await db.from("conflicts").insert(allConflicts);
  if (observations.length) await db.from("research_observations").insert(observations);
  stats.conflicts = allConflicts.length;
  return { companyId: cid, stats };
}
