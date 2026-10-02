// Writes data/verification/platform_queue.json — ICP-target accounts with no known S2P platform tag yet
// (not Coupa/Ariba/GEP/Jaggaer/iValua/Zycus), largest/highest-ICP-status first. Companies already checked
// (data/verification/platform/<slug>.json) are skipped.
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const LIMIT = process.argv.includes("--limit") ? Number(process.argv[process.argv.indexOf("--limit") + 1]) : 55;
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const { data, error } = await db.from("companies").select("slug,company_name,company_website,domain,country,industry,icp_status,existing_s2p_product,revenue_usd_m,profile").neq("icp_status", "Not ICP");
if (error) throw error;
const known = /coupa|ariba|oracle procurement|ivalua|jaggaer|\bgep\b|zycus/i;
const done = new Set(fs.existsSync("data/verification/platform") ? fs.readdirSync("data/verification/platform").map((f) => f.replace(/\.json$/, "")) : []);
const todo = data.filter((c) => !known.test(c.existing_s2p_product || "") && !done.has(c.slug));
const rank = { "ICP — Verified": 0, "ICP — Likely": 1, "ICP — Needs check": 2, Unknown: 3 };
const sized = (c) => c.profile?.["Vipin-Profiling"]?.["Size (USD m)"] ?? c.revenue_usd_m ?? 0;
todo.sort((a, b) => (rank[a.icp_status] ?? 9) - (rank[b.icp_status] ?? 9) || sized(b) - sized(a));
const batch = todo.slice(0, LIMIT).map((c) => ({ slug: c.slug, company_name: c.company_name, website: c.company_website || c.domain || "", country: c.country, industry: c.industry || "", icp_status: c.icp_status }));
fs.mkdirSync("data/verification/platform", { recursive: true });
fs.writeFileSync("data/verification/platform_queue.json", JSON.stringify(batch, null, 1));
console.log(`remaining candidates: ${todo.length} (already checked: ${done.size}) · batch written: ${batch.length}`);
