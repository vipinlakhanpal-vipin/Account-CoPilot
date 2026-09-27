// Writes HubSpot company matches into companies.profile["HubSpot"] (Claude-owned field; reference data untouched).
// Input: data/verification/hubspot_matches.json — built in a Claude session with the HubSpot connector:
//   [{ "slug": "ref-…", "in_hubspot": true, "hubspot_id": "123", "hubspot_name": "…", "stage": "Customer", "owner": "Jane Doe" },
//    { "slug": "sd-…", "in_hubspot": false }]
// "Existing SCP Customer" = in_hubspot (the company exists in SCP's HubSpot). Stage = HubSpot lifecycle stage; Owner = HubSpot company owner.
//   node scripts/apply_hubspot.mjs [file]
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

if (fs.existsSync(".env.local")) for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const rows = JSON.parse(fs.readFileSync(process.argv[2] || "data/verification/hubspot_matches.json", "utf8"));
const now = new Date().toISOString();
let yes = 0, no = 0, missing = 0;
for (const r of rows) {
  const { data: c } = await db.from("companies").select("id,profile").eq("slug", r.slug).maybeSingle();
  if (!c) { missing++; continue; }
  const HubSpot = r.in_hubspot ? { in_hubspot: true, hubspot_id: r.hubspot_id || null, hubspot_name: r.hubspot_name || null, stage: r.stage || null, owner: r.owner || null, checked_at: now }
    : { in_hubspot: false, checked_at: now };
  const { error } = await db.from("companies").update({ profile: { ...(c.profile || {}), HubSpot } }).eq("id", c.id);
  if (error) throw error;
  r.in_hubspot ? yes++ : no++;
}
console.log(`HubSpot: ${yes} in HubSpot, ${no} not in HubSpot, ${missing} slugs not found`);
