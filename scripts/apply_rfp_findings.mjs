// Applies cached RFP/tender findings from data/verification/rfp/<slug>.json to Supabase.
// Only FACT-level findings where an open RFP/tender was actually found are written — sets
// companies.s2p_platform_status = "RFP / Tender", logs a signal and a source row. Does not touch
// icp_status. Safe to re-run — a company already marked RFP / Tender is skipped.
//   node scripts/apply_rfp_findings.mjs
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const DIR = "data/verification/rfp";
const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.endsWith(".json")) : [];
let applied = 0, skipped = 0;
for (const f of files) {
  const r = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
  if (r.evidence_status !== "FACT" || !r.rfp_found) { skipped++; continue; }
  const { data: c, error: selErr } = await db.from("companies").select("id,company_name,s2p_platform_status").eq("slug", r.slug).maybeSingle();
  if (selErr) throw selErr;
  if (!c) { console.log(`[skip] ${r.company_name}: no matching company row (slug ${r.slug})`); continue; }
  if (c.s2p_platform_status === "RFP / Tender") { console.log(`[skip] ${c.company_name}: already RFP / Tender`); continue; }
  const now = new Date().toISOString();
  const { error } = await db.from("companies").update({ s2p_platform_status: "RFP / Tender", updated_at: now, last_verified: now }).eq("id", c.id);
  if (error) throw error;
  await db.from("s2p_signals").insert({ company_id: c.id, category: "PROCUREMENT TRANSFORMATION", signal: "Open RFP / tender for a source-to-pay or procurement platform (public evidence)",
    level: "STRONG SIGNAL", evidence: r.reasoning, date: r.checked_at, research_channel: "Claude" });
  await db.from("sources").insert({ company_id: c.id, source: r.source_name, source_type: "Business press / company website", source_tier: "Claude research",
    research_channel: "Claude", information_found: "Open RFP / tender for S2P platform", evidence: r.reasoning, confidence: "HIGH", supports_s2p_status: "Yes" });
  console.log(`[applied] ${c.company_name}: RFP / Tender`);
  applied++;
}
console.log(`\napplied ${applied}, skipped ${skipped} (not FACT, no RFP found, or already set)`);
