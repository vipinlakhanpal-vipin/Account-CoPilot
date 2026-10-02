// Applies cached platform-discovery findings from data/verification/platform/<slug>.json to Supabase.
// Only FACT-level findings with a named platform are written; LIKELY/UNVERIFIED/UNKNOWN are left alone (re-checked later).
// Does not touch icp_status or Pipeline — existing_s2p_product/s2p_platform_status/s2p_signal_level only, same fields
// apply_customer_list.mjs writes for user-confirmed customers, but sourced as Claude research here, not a user confirmation.
//   node scripts/apply_platform_findings.mjs
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const DIR = "data/verification/platform";
const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".json"));
let applied = 0, skipped = 0;
for (const f of files) {
  const r = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
  if (r.evidence_status !== "FACT" || !r.platform_found) { skipped++; continue; }
  const { data: c, error: selErr } = await db.from("companies").select("id,company_name,existing_s2p_product").eq("slug", r.slug).maybeSingle();
  if (selErr) throw selErr;
  if (!c) { console.log(`[skip] ${r.company_name}: no matching company row (slug ${r.slug})`); continue; }
  if (c.existing_s2p_product && !["Unknown", "No Evidence"].includes(c.existing_s2p_product)) {
    console.log(`[skip] ${c.company_name}: existing_s2p_product already set (${c.existing_s2p_product})`); continue;
  }
  const now = new Date().toISOString();
  const detail = `${r.platform_found} — found via public evidence (Claude research): ${r.reasoning}`;
  const { error } = await db.from("companies").update({
    existing_s2p_product: r.platform_found, s2p_platform_status: "Confirmed Current", s2p_signal_level: "VERY STRONG SIGNAL",
    ...(r.platform_found !== "Coupa" ? { ariba_opportunity_type: `Existing ${r.platform_found} customer — managed services / optimisation / expansion` } : {}),
    existing_s2p_detail: detail, updated_at: now, last_verified: now,
  }).eq("id", c.id);
  if (error) throw error;
  await db.from("s2p_signals").insert({ company_id: c.id, category: "Existing S2P platform", signal: `${r.platform_found} customer (public evidence)`,
    level: "VERY STRONG SIGNAL", platform: r.platform_found, evidence: r.reasoning, date: r.checked_at, research_channel: "Claude" });
  await db.from("sources").insert({ company_id: c.id, source: r.source_name, source_type: "Business press / company website", source_tier: "Claude research",
    research_channel: "Claude", information_found: `${r.platform_found} customer`, evidence: r.reasoning, confidence: "HIGH", supports_s2p_status: "Yes" });
  console.log(`[applied] ${c.company_name}: ${r.platform_found}`);
  applied++;
}
console.log(`\napplied ${applied}, skipped ${skipped} (not FACT, or already set)`);
