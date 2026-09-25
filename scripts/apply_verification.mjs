// Applies data/verification/updates.json to Supabase: company ICP verdicts, Claude Check on your rows,
// and new Channel State = Claude rows for material differences. Your reference values are not edited.
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const u = JSON.parse(fs.readFileSync("data/verification/updates.json", "utf8"));

const pool = async (items, n, fn) => { for (let i = 0; i < items.length; i += n) await Promise.all(items.slice(i, i + n).map(fn)); };
const { data: cos } = await db.from("companies").select("id,slug,profile");
const bySlug = Object.fromEntries(cos.map((c) => [c.slug, c]));
await pool(u.companies, 15, async (c) => {
  const row = bySlug[c.slug]; if (!row) return;
  const profile = { ...(row.profile || {}), "Claude verification (Seamless, 2026-09-25)": c.claude_verification };
  const { error } = await db.from("companies").update({ icp_status: c.icp_status, icp_fit_reason: c.icp_fit_reason, profile, last_verified: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", row.id);
  if (error) throw error;
  if (c.technologies?.length) {
    const { count } = await db.from("technology_evidence").select("*", { count: "exact", head: true }).eq("company_id", row.id);
    if (!count) await db.from("technology_evidence").insert(c.technologies.slice(0, 40).map((t) => ({ company_id: row.id, name: t, category: "Technographics",
      status: "UNVERIFIED", evidence: "Seamless.ai technographics" })));
  }
});
console.log(`companies verified: ${u.companies.length}`);
if (process.argv.includes("--companies-only")) process.exit(0);

await pool(u.contact_checks, 20, async (c) => {
  const { error } = await db.from("contacts").update({ claude_check: c.claude_check, last_researched: new Date().toISOString() }).eq("external_id", c.external_id);
  if (error) throw error;
});
console.log(`contact checks written: ${u.contact_checks.length}`);

// replace earlier verification rows (CLV-…) so a corrected run leaves no stale differences behind
{ const { error } = await db.from("contacts").delete().like("external_id", "CLV-%"); if (error) throw error; }
const rows = u.new_contacts.map(({ company_slug, ...r }) => ({ ...r, company_id: bySlug[company_slug]?.id })).filter((r) => r.company_id);
for (let i = 0; i < rows.length; i += 200) {
  const { error } = await db.from("contacts").upsert(rows.slice(i, i + 200), { onConflict: "external_id" });
  if (error) throw error;
}
console.log(`new Claude rows: ${rows.length}`, u.stats);
