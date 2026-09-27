// Writes HubSpot matches into companies.profile["HubSpot"] (Claude-owned field; reference data untouched).
// HubSpot data stays inside this app (database + Master Book export). The input files hold commercial data, so keep them
// OUT of the repo: data/verification/ is git-ignored, or pass a scratch path.
// Input (built in a Claude session with the read-only HubSpot connector):
//   matches: [{ slug, in_hubspot: true, hubspot_id, hubspot_name, records, stage, owner, deals: [{ name, stage, amount, close }] }, { slug, in_hubspot: false }]
//   contacts (optional): text file, one email per line = contact emails that already exist in HubSpot
//   node scripts/apply_hubspot.mjs [matches.json] [hubspot_contacts.txt]
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

if (fs.existsSync(".env.local")) for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const rows = JSON.parse(fs.readFileSync(process.argv[2] || "data/verification/hubspot_matches.json", "utf8"));
const hsEmails = process.argv[3] ? fs.readFileSync(process.argv[3], "utf8").split("\n").map((e) => e.trim().toLowerCase()).filter(Boolean) : [];
// contact emails in HubSpot, grouped by app company
const byCompany = {};
if (hsEmails.length) {
  const { data: cs, error } = await db.from("contacts").select("company_id,email").not("email", "is", null);
  if (error) throw error;
  for (const c of cs) { const e = String(c.email).trim().toLowerCase(); if (hsEmails.includes(e)) (byCompany[c.company_id] ||= new Set()).add(e); }
}
const now = new Date().toISOString();
let yes = 0, no = 0, missing = 0, deals = 0, people = 0;
for (const r of rows) {
  const { data: c } = await db.from("companies").select("id,profile").eq("slug", r.slug).maybeSingle();
  if (!c) { missing++; continue; }
  const contact_emails = [...(byCompany[c.id] || [])];
  const HubSpot = r.in_hubspot
    ? { in_hubspot: true, hubspot_id: r.hubspot_id || null, hubspot_name: r.hubspot_name || null, records: r.records || 1, stage: r.stage || null, owner: r.owner || null,
        deals: r.deals || [], contact_emails, checked_at: now }
    : { in_hubspot: false, contact_emails, checked_at: now };
  const { error } = await db.from("companies").update({ profile: { ...(c.profile || {}), HubSpot } }).eq("id", c.id);
  if (error) throw error;
  r.in_hubspot ? yes++ : no++; deals += (r.deals || []).length; people += contact_emails.length;
}
console.log(`HubSpot: ${yes} in HubSpot, ${no} not in HubSpot, ${missing} slugs not found · ${deals} deals · ${people} contacts already in HubSpot`);
