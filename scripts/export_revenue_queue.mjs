// Writes data/verification/revenue_queue.json — accounts still needing ICP revenue verification, in priority order.
// Order: Needs check → Unknown → Likely (largest first). Companies already checked (data/verification/revenue/<slug>.json) are skipped.
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const { data, error } = await db.from("companies").select("slug,company_name,company_website,domain,industry,icp_status,icp_fit_reason,profile")
  .in("icp_status", ["ICP — Needs check", "Unknown", "ICP — Likely"]);
if (error) throw error;
const rank = { "ICP — Needs check": 0, Unknown: 1, "ICP — Likely": 2 };
const done = new Set(fs.existsSync("data/verification/revenue") ? fs.readdirSync("data/verification/revenue").map((f) => f.replace(/\.json$/, "")) : []);
const q = data.filter((c) => !done.has(c.slug)).map((c) => ({
  slug: c.slug, company_name: c.company_name, website: c.company_website || c.domain || "", industry: c.industry || "",
  current_status: c.icp_status, current_reason: c.icp_fit_reason || "",
  your_size_usd_m: c.profile?.["Vipin-Profiling"]?.["Size (USD m)"] ?? null,
})).sort((a, b) => rank[a.current_status] - rank[b.current_status] || (b.your_size_usd_m || 0) - (a.your_size_usd_m || 0));
fs.mkdirSync("data/verification", { recursive: true });
fs.writeFileSync("data/verification/revenue_queue.json", JSON.stringify(q, null, 1));
console.log(`queue: ${q.length} companies (${Object.entries(q.reduce((m, c) => ((m[c.current_status] = (m[c.current_status] || 0) + 1), m), {})).map(([k, v]) => `${k}: ${v}`).join(", ")}) · already checked: ${done.size}`);
