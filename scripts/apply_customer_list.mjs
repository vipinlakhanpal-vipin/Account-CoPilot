// Marks the user's confirmed platform customers (e.g. Coupa) in Supabase from data/seed/<file>.json (git-ignored).
// Existing accounts: set existing_s2p_product / status / signal, keep the previous finding as a conflict row, add a signal + source.
// New accounts: insert as channel "User" with the list tag, then run scripts/recompute_icp.mjs.
//   node scripts/apply_customer_list.mjs data/seed/coupa_customers.json
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const cfg = JSON.parse(fs.readFileSync(process.argv[2] || "data/seed/coupa_customers.json", "utf8"));
const { platform, confirmed_by, confirmed_on, list } = cfg;
const now = new Date().toISOString();
const detail = `${platform} customer — confirmed by ${confirmed_by}, ${confirmed_on} (FACT, user-confirmed).`;
const account = {
  existing_s2p_product: platform, s2p_platform_status: "Confirmed Current", s2p_signal_level: "VERY STRONG SIGNAL",
  [platform === "Coupa" ? "coupa_opportunity_type" : "ariba_opportunity_type"]: `Existing ${platform} customer — managed services / optimisation / expansion`,
  updated_at: now, last_verified: now,
};

async function mark(c) {
  if (c.existing_s2p_product === platform && (c.lists || []).includes(list)) return false; // already applied — safe to re-run
  const prev = [c.existing_s2p_product, c.existing_s2p_detail].filter(Boolean).join(" — ");
  const lists = [...new Set([...(c.lists || []), list])];
  const { error } = await db.from("companies").update({ ...account, lists, existing_s2p_detail: detail + (prev && c.existing_s2p_product !== platform ? ` Previous research finding kept in Conflicts: ${prev}` : ""),
    s2p_strong_signals: [detail, c.s2p_strong_signals].filter(Boolean).join(" | ") }).eq("id", c.id);
  if (error) throw error;
  if (prev && !["Unknown", "No Evidence", platform].includes(c.existing_s2p_product))
    await db.from("conflicts").insert({ company_id: c.id, entity: c.company_name, field: "existing_s2p_product", value_a: prev, source_a: "Claude research (public evidence)",
      value_b: platform, source_b: confirmed_by, determination: `${confirmed_by} confirmed`, resolution: `Shown as ${platform}; research finding retained.` });
  await db.from("s2p_signals").insert({ company_id: c.id, category: "Existing S2P platform", signal: `${platform} customer (user-confirmed)`, level: "VERY STRONG SIGNAL",
    platform, evidence: detail, date: confirmed_on, research_channel: "User" });
  await db.from("sources").insert({ company_id: c.id, source: confirmed_by, source_type: "User confirmation", source_tier: "User", research_channel: "User",
    information_found: `${platform} customer`, evidence: detail, confidence: "HIGH", supports_s2p_status: "Yes" });
}

const { data: existing, error } = await db.from("companies").select("*").in("slug", cfg.existing);
if (error) throw error;
for (const c of existing) if (await mark(c) !== false) console.log("marked", c.company_name);
for (const n of cfg.new) {
  let { data: c } = await db.from("companies").select("*").eq("slug", n.slug).maybeSingle();
  if (!c) {
    const ins = await db.from("companies").insert({ ...n, research_channel: "User", lists: [list], icp_status: "Unknown",
      account_notes: `Added from ${confirmed_by}'s ${platform} customer list on ${confirmed_on}. Revenue/ICP not yet researched.` }).select("*").single();
    if (ins.error) throw ins.error;
    c = ins.data;
    console.log("added", c.company_name, `(${c.country})`);
  }
  await mark(c);
}
console.log(`done — now run: node scripts/recompute_icp.mjs`);
