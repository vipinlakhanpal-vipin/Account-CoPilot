// Loads data/seed/seed.json into Supabase. Run: npm run seed  (reads .env.local)
// Idempotent: companies upsert on slug, contacts on external_id. Evidence tables are loaded
// only for companies that have no evidence rows yet, so re-running never duplicates.
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of fs.existsSync(".env.local") ? fs.readFileSync(".env.local", "utf8").split("\n") : []) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) { console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local"); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false } });
const seed = JSON.parse(fs.readFileSync("data/seed/seed.json", "utf8"));
const chunks = (a, n = 200) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

const { error: ce } = await db.from("companies").upsert(seed.companies, { onConflict: "slug" });
if (ce) throw ce;
const { data: cos } = await db.from("companies").select("id,slug");
const id = Object.fromEntries(cos.map((c) => [c.slug, c.id]));
console.log(`companies: ${seed.companies.length}`);

const contacts = seed.contacts.map(({ company_slug, ...c }) => ({ ...c, company_id: id[company_slug] }));
for (const part of chunks(contacts)) { const { error } = await db.from("contacts").upsert(part, { onConflict: "external_id" }); if (error) throw error; }
console.log(`contacts: ${contacts.length}`);

for (const table of ["s2p_signals", "sources", "technology_evidence", "employment_history", "conflicts"]) {
  const { data: have } = await db.from(table).select("company_id").limit(100000);
  const done = new Set((have || []).map((r) => r.company_id));
  const rows = seed[table].map(({ company_slug, ...r }) => ({ ...r, company_id: id[company_slug] })).filter((r) => r.company_id && !done.has(r.company_id));
  for (const part of chunks(rows)) { const { error } = await db.from(table).insert(part); if (error) throw error; }
  console.log(`${table}: ${rows.length} inserted`);
}
console.log("Seed complete.");
