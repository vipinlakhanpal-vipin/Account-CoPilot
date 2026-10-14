// Adds stakeholders found by a Seamless enrichment run (data/verification/people/contacts_<batch>.json, git-ignored) to
// the contacts table as NEW rows (channel_state = "Claude", external_id SMLS-<id>). Reference rows are never edited.
// Usage: node scripts/apply_people.mjs <batch> [--dry]
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const batch = process.argv[2];
if (!batch) { console.error("usage: node scripts/apply_people.mjs <batch> [--dry]"); process.exit(1); }
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const rows = JSON.parse(fs.readFileSync(`data/verification/people/contacts_${batch}.json`, "utf8"));
const { data: cos, error: e0 } = await db.from("companies").select("id,slug");
if (e0) throw e0;
const bySlug = Object.fromEntries(cos.map((c) => [c.slug, c.id]));
const out = rows.map(({ company_slug, ...r }) => ({ ...r, company_id: bySlug[company_slug] })).filter((r) => r.company_id);
console.log(`batch ${batch}: ${rows.length} rows, ${out.length} matched to a company`);
if (process.argv.includes("--dry")) process.exit(0);
for (let i = 0; i < out.length; i += 100) {
  const { error } = await db.from("contacts").upsert(out.slice(i, i + 100), { onConflict: "external_id" });
  if (error) throw error;
}
console.log("written");
