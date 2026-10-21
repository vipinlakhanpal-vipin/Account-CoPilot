// Flags accounts whose head office is in another country (Region review, v6.56) from a JSON file:
//   {"owner":"Nardus","owner_email":"…","items":[{"slug":"","hq":"UK","why":""}]}
// Sets companies.profile["Region review"] = {status:"open", …} and fills account_owner only when it is empty. The country stays as it is
// until someone moves the account in the app. Safe to re-run: an account already decided (moved / kept) is left alone.
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
if (fs.existsSync(".env.local")) for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const cfg = JSON.parse(fs.readFileSync(process.argv[2] || "data/verification/region_review.json", "utf8"));
const now = new Date().toISOString(), day = now.slice(0, 10);
let done = 0;
for (const it of cfg.items) {
  const { data: c } = await db.from("companies").select("id,company_name,country,profile,account_owner,account_notes").eq("slug", it.slug).maybeSingle();
  if (!c) { console.log("not found:", it.slug); continue; }
  if (["moved", "kept"].includes(c.profile?.["Region review"]?.status)) { console.log("already decided:", c.company_name); continue; }
  const profile = { ...(c.profile || {}), "Region review": { status: "open", hq_country: it.hq, reason: it.why, flagged_at: now, owner: cfg.owner_email ? `${cfg.owner} (${cfg.owner_email})` : cfg.owner } };
  const patch = { profile, account_notes: [c.account_notes, `Region review: head office in ${it.hq}, filed under ${c.country} for review (${day}).`].filter(Boolean).join(" "), updated_at: now };
  if (!c.account_owner && cfg.owner) patch.account_owner = cfg.owner;
  const { error } = await db.from("companies").update(patch).eq("id", c.id);
  if (error) throw error; done++;
}
console.log(`flagged ${done} of ${cfg.items.length}`);
