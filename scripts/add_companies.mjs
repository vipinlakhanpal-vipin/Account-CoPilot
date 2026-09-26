// Adds companies found by a scheduled session (no API cost) from data/verification/new_companies.json:
//   [{ "name": "", "website": "", "country": "UAE", "industry": "", "hq_city": "", "why_icp": "", "source_url": "" }]
// Skips names/domains already in the app. Adds list "Claude discovery" (origin: Claude discovery). Then verify their revenue as usual.
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

if (fs.existsSync(".env.local")) for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const list = JSON.parse(fs.readFileSync(process.argv[2] || "data/verification/new_companies.json", "utf8"));
const norm = (n) => n.toLowerCase().replace(/&/g, " and ").replace(/\b(pjsc|psc|plc|llc|group|holding|company|co|the)\b/g, "").replace(/[^a-z0-9]/g, "");
const dom = (w) => String(w || "").replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
const { data: have } = await db.from("companies").select("company_name,domain");
const known = new Set([...(have || []).map((c) => norm(c.company_name)), ...(have || []).map((c) => c.domain).filter(Boolean)]);
const today = new Date().toISOString().slice(0, 10);
const rows = list.filter((c) => c.name && !known.has(norm(c.name)) && !(dom(c.website) && known.has(dom(c.website)))).map((c) => ({
  slug: "cd-" + c.name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60), company_name: c.name, country: c.country || "UAE",
  company_website: c.website || null, domain: dom(c.website) || null, hq_city: c.hq_city || null, industry: c.industry || null, research_channel: "Claude discovery",
  lists: ["Claude discovery"], icp_status: "Unknown", account_notes: `Found by a scheduled Claude session on ${today}: ${c.why_icp || ""} Source: ${c.source_url || ""}`,
  profile: { "Claude discovery": { why: c.why_icp || "", source_url: c.source_url || "", via: "scheduled session (no API cost)" } } }));
if (rows.length) { const { error } = await db.from("companies").upsert(rows, { onConflict: "slug", ignoreDuplicates: true }); if (error) throw error; }
console.log(`added ${rows.length} of ${list.length} (others already in the app)`);
