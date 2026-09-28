// Merge a duplicate company into the record we keep (same entity under another name, spelling or domain).
//   node scripts/merge_companies.mjs <keep_slug> <drop_slug> ["note"]   → then run scripts/recompute_icp.mjs
// Rules (user-approved 2026-09-28):
//   - Keep the original record (your workbook first, then the earliest added). Its values are never overwritten.
//   - Move contacts, sources, signals, conflicts, technology evidence and employment history to the kept record.
//   - Fill only EMPTY fields on the kept record from the duplicate.
//   - Revenue: keep the stronger evidence (FACT > LIKELY > UNVERIFIED; a figure beats no figure; tie → the kept record).
//     The losing revenue check is kept in profile["Merged companies"] for the audit trail.
//   - The duplicate's name and domain are recorded as aliases (profile["Merged companies"]), so the engine never re-adds it.
//   - The duplicate row is then removed.
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

if (fs.existsSync(".env.local")) for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const [keepSlug, dropSlug, note] = process.argv.slice(2);
if (!keepSlug || !dropSlug) { console.log("usage: merge_companies.mjs <keep_slug> <drop_slug> [note]"); process.exit(1); }

const one = async (slug) => { const { data, error } = await db.from("companies").select("*").eq("slug", slug).maybeSingle(); if (error) throw error; return data; };
const keep = await one(keepSlug), drop = await one(dropSlug);
if (!keep || !drop) { console.log("not found:", !keep ? keepSlug : dropSlug); process.exit(1); }

for (const t of ["contacts", "sources", "s2p_signals", "conflicts", "technology_evidence", "employment_history"]) {
  const { data, error } = await db.from(t).update({ company_id: keep.id }).eq("company_id", drop.id).select("id");
  if (error) console.log(`${t}: ${error.message}`); else if (data.length) console.log(`${t}: moved ${data.length}`);
}

const blank = (v) => v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length);
const REV = ["verified_revenue_usd_m", "verified_revenue_fy", "verified_revenue_type", "verified_revenue_source", "verified_revenue_url", "verified_revenue_status", "listing_status"];
const SKIP = new Set(["id", "slug", "company_name", "created_at", "updated_at", "profile", "lists", "research_channel", "ref_sl_no", "account_notes", ...REV]);
const patch = {};
for (const [k, v] of Object.entries(drop)) if (!SKIP.has(k) && blank(keep[k]) && !blank(v)) patch[k] = v;

const rank = (c) => ({ FACT: 3, LIKELY: 2, UNVERIFIED: 1 }[c.verified_revenue_status] || 0) * 2 + (c.verified_revenue_usd_m != null ? 1 : 0);
const dropWins = rank(drop) > rank(keep);
if (dropWins) for (const k of REV) patch[k] = drop[k];
else if (blank(keep.listing_status) && !blank(drop.listing_status)) patch.listing_status = drop.listing_status;

const profile = { ...(drop.profile || {}), ...(keep.profile || {}) }; // keep's keys win
if (dropWins && drop.profile?.["Revenue check"]) profile["Revenue check"] = drop.profile["Revenue check"];
delete profile["HubSpot"]; if (keep.profile?.["HubSpot"]) profile["HubSpot"] = keep.profile["HubSpot"];
const loser = dropWins ? keep : drop;
profile["Merged companies"] = [...(keep.profile?.["Merged companies"] || []), {
  at: new Date().toISOString(), name: drop.company_name, slug: drop.slug, domain: drop.domain || "", website: drop.company_website || "",
  from: (drop.lists || []).join(", "), note: note || "Same entity under another name or domain; merged (user rule: one record per entity)",
  revenue_kept_from: dropWins ? drop.company_name : keep.company_name,
  other_revenue_check: loser.profile?.["Revenue check"] || (loser.verified_revenue_status ? { status: loser.verified_revenue_status, usd_m: loser.verified_revenue_usd_m, source: loser.verified_revenue_source, url: loser.verified_revenue_url } : null),
}];
patch.profile = profile;
patch.lists = [...new Set([...(keep.lists || []), ...(drop.lists || [])])];
const extra = drop.account_notes ? `Merged from "${drop.company_name}": ${drop.account_notes}` : "";
if (extra) patch.account_notes = [keep.account_notes, extra].filter(Boolean).join("\n");
patch.updated_at = new Date().toISOString();

const { error: e1 } = await db.from("companies").update(patch).eq("id", keep.id); if (e1) throw e1;
const { error: e2 } = await db.from("companies").delete().eq("id", drop.id); if (e2) throw e2;
console.log(`merged "${drop.company_name}" → "${keep.company_name}" · filled: ${Object.keys(patch).filter((k) => !["profile", "lists", "updated_at", "account_notes"].includes(k)).join(", ") || "nothing"} · revenue from: ${dropWins ? drop.company_name : keep.company_name}`);
