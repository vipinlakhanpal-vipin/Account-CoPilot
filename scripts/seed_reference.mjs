// Loads data/seed/reference.json (your target lists) into Supabase. Run after the 0002 migration:
//   node scripts/seed_reference.mjs
// Claude-researched companies only get list/ICP/profile columns; their research fields are untouched.
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const ref = JSON.parse(fs.readFileSync("data/seed/reference.json", "utf8"));
const chunks = (a, n = 200) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

const probe = await db.from("companies").select("icp_status").limit(1);
if (probe.error) { console.error("Run supabase/migrations/0002_reference_lists.sql in Supabase first:", probe.error.message); process.exit(1); }

let updated = 0, created = 0;
for (const c of ref.companies) {
  const { matched_claude, ...rec } = c;
  if (matched_claude) {
    const { error } = await db.from("companies").update({ lists: rec.lists, icp_status: rec.icp_status, profile: rec.profile, ref_sl_no: rec.ref_sl_no ?? null }).eq("slug", rec.slug);
    if (error) throw error; updated++;
  } else {
    const { error } = await db.from("companies").upsert({ ...rec, research_channel: "Reference", existing_s2p_product: "Unknown",
      s2p_platform_status: "Unknown", s2p_signal_level: "NO SIGNAL", coupa_opportunity_type: "No Evidence", ariba_opportunity_type: "No Evidence" }, { onConflict: "slug" });
    if (error) throw error; created++;
  }
}
console.log(`companies: ${updated} tagged (Claude-researched), ${created} added from your lists`);

const { data: cos } = await db.from("companies").select("id,slug");
const id = Object.fromEntries(cos.map((c) => [c.slug, c.id]));
const rows = ref.contacts.map(({ row, company_slug, ...c }) => ({ ...c, company_id: id[company_slug] })).filter((c) => c.company_id);
for (const part of chunks(rows)) { const { error } = await db.from("contacts").upsert(part, { onConflict: "external_id" }); if (error) throw error; }
console.log(`contacts: ${rows.length} upserted (existing reference rows keep the same id)`);
