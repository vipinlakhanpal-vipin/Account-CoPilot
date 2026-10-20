// Local equivalent of the worker's enrich_queue and enrich (uses the database key; run it only from a local session).
//   npx -y -p node@22 node scripts/enrich_local.mjs queue <REGION> [N]    → prints and saves data/verification/enrich_queue.json
//   npx -y -p node@22 node scripts/enrich_local.mjs apply <file.json>     → saves enrichment, same rules as app/api/engine/worker/route.ts
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { regionOf } from "../lib/icpDefinition.mjs";
if (fs.existsSync(".env.local")) for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const [cmd, a, b] = process.argv.slice(2);
if (cmd === "queue") {
  const { data } = await db.from("companies").select("slug,company_name,company_website,domain,industry,country,icp_status,verified_revenue_usd_m,existing_s2p_product,research_channel,account_notes,profile").in("icp_status", ["ICP — Verified", "ICP — Likely"]);
  const due = (data || []).filter((c) => regionOf(c.country) === (a || "UAE") && !["Reference", "User"].includes(String(c.research_channel || "")) && !/coupa/i.test(String(c.existing_s2p_product || "")) && !c.profile?.Enrichment);
  due.sort((x, y) => (x.icp_status === y.icp_status ? 0 : x.icp_status === "ICP — Verified" ? -1 : 1) || Number(y.verified_revenue_usd_m || 0) - Number(x.verified_revenue_usd_m || 0));
  const out = due.slice(0, Number(b) || 10).map((c) => ({ slug: c.slug, name: c.company_name, website: c.company_website || c.domain || "", industry: c.industry || "", rev_m: c.verified_revenue_usd_m, note: (c.account_notes || "").slice(0, 160) }));
  fs.mkdirSync("data/verification", { recursive: true }); fs.writeFileSync("data/verification/enrich_queue.json", JSON.stringify(out, null, 1));
  console.log(`${due.length} waiting in ${a}; first ${out.length}:`); out.forEach((c, i) => console.log(`${i + 1}. ${c.slug} | ${c.name} | ${c.industry} | $${c.rev_m}M | ${c.website}`));
} else if (cmd === "apply") {
  const list = JSON.parse(fs.readFileSync(a, "utf8")), now = new Date().toISOString(), today = now.slice(0, 10), isDef = (v, ...d) => !v || d.includes(String(v));
  for (const r of list) {
    const { data: c } = await db.from("companies").select("id,company_name,research_channel,erp,existing_s2p_product,s2p_signal_level,existing_s2p_detail,known_implementation_partner,profile").eq("slug", r.slug).maybeSingle();
    if (!c) { console.log(`${r.slug}: not found`); continue; }
    if (["Reference", "User"].includes(String(c.research_channel || ""))) { console.log(`${c.company_name}: skipped (reference record)`); continue; }
    const src = r.source_url ? ` Source: ${r.source_url}` : "", noSrc = !r.source_url;
    const level = noSrc && /STRONG/.test(r.s2p_signal_level || "") ? "MODERATE SIGNAL" : r.s2p_signal_level || "NO SIGNAL", erpStatus = noSrc && r.erp_status === "FACT" ? "LIKELY" : r.erp_status || "UNKNOWN";
    const patch = { last_researched: today }, done = [];
    if (isDef(c.erp) && r.erp) { Object.assign(patch, { erp: r.erp, erp_status: erpStatus, erp_evidence: ((r.erp_evidence || "") + src).trim() }); done.push(`ERP ${r.erp}`); }
    const prod = r.existing_s2p_product || "Unknown";
    if (isDef(c.existing_s2p_product, "Unknown") && prod !== "Unknown") { Object.assign(patch, { existing_s2p_product: prod, s2p_platform_status: r.s2p_platform_status || (prod === "No Evidence" ? "No Evidence" : "Unknown") }); if (r.existing_s2p_detail && isDef(c.existing_s2p_detail)) patch.existing_s2p_detail = (r.existing_s2p_detail + src).trim(); done.push(`S2P ${prod}`); }
    if (isDef(c.s2p_signal_level, "NO SIGNAL") && level !== "NO SIGNAL") { Object.assign(patch, { s2p_signal_level: level, s2p_strong_signals: ((r.s2p_strong_signals || "") + src).trim() }); done.push(level.toLowerCase()); }
    if (r.known_implementation_partner && isDef(c.known_implementation_partner)) patch.known_implementation_partner = r.known_implementation_partner;
    patch.profile = { ...(c.profile || {}), Enrichment: { at: now, source_url: r.source_url || null, found: done, by: "local session" } };
    const { error } = await db.from("companies").update(patch).eq("id", c.id);
    console.log(`${c.company_name}: ${error ? "ERROR " + error.message : done.length ? done.join(", ") : "searched, nothing found"}`);
  }
}
