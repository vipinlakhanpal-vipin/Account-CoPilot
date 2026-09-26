// Imports KEEP rows from data/verification/seamless_discovery_clean.json (built by scripts/clean_seamless_discovery.py)
// as new accounts: list "Seamless discovery", channel "Seamless". ICP status comes from recompute_icp.mjs (Seamless-discovery rule).
// Safe to re-run (upsert on slug; existing rows are not overwritten). Then run: node scripts/recompute_icp.mjs
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const COUNTRY = process.argv[2] || "UAE";
const rows = JSON.parse(fs.readFileSync("data/verification/seamless_discovery_clean.json", "utf8")).filter((r) => r.bucket === "KEEP");

const IND = [[/construct|civil|precast|concrete|architect|building|glass/i, "construction"], [/hospital|health|medical|pharma|wellness/i, "healthcare_pharma"],
  [/hospitality|hotel|restaurant|leisure|entertain|recreation/i, "hospitality"], [/oil|energy|utilit|chemical|plastic/i, "chemicals_oil_gas"],
  [/logistic|maritime|aviation|airline|transport|freight/i, "logistics_shipping"], [/bank|financ|insur|invest|venture/i, "banking_financial"],
  [/software|internet|information tech|telecom|computer|e-learning|broadcast|media|marketing/i, "tech_ai"], [/mining|metal|steel/i, "mining_resources"],
  [/consult|staffing|outsourc|facilit|security|legal|law|services|printing|events/i, "professional_services"]];
const industry = (list = []) => { const s = list.join(" "); return (IND.find(([re]) => re.test(s)) || [null, "retail_lifestyle"])[1]; };
const slug = (n) => "sd-" + n.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

const recs = rows.map((r) => ({
  slug: slug(r.name), company_name: r.name, country: COUNTRY, domain: r.domain || null, company_website: r.domain ? `https://${r.domain}` : null,
  hq_city: r.city || null, industry: industry(r.industries), employee_range: r.staffCountRange || null, employee_source: "Seamless.ai",
  ticker: r.ticker || null, lists: ["Seamless discovery"], research_channel: "Seamless", icp_status: "Unknown",
  account_notes: `Imported from Seamless discovery (UAE, revenue ≥ $500M, 200+ staff) on ${new Date().toISOString().slice(0, 10)}. Seamless industry: ${(r.industries || []).join(", ")}; type: ${r.companyType}.`,
  profile: { "Seamless discovery": { revenue_range: r.revenueRange, annual_revenue: r.annualRevenue, staff_range: r.staffCountRange, employee_count: r.employeeCount,
    industries: r.industries, company_type: r.companyType, linkedin: r.linkedInProfileIdentifier ? `https://www.linkedin.com/company/${r.linkedInProfileIdentifier}` : null } },
}));
const { data: have } = await db.from("companies").select("slug").in("slug", recs.map((r) => r.slug));
const skip = new Set((have || []).map((h) => h.slug));
const todo = recs.filter((r) => !skip.has(r.slug));
for (let i = 0; i < todo.length; i += 100) {
  const { error } = await db.from("companies").insert(todo.slice(i, i + 100));
  if (error) throw error;
}
console.log(`imported ${todo.length} (skipped ${skip.size} already present) — now run: node scripts/recompute_icp.mjs`);
