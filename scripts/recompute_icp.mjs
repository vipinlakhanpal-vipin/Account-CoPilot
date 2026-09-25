// Recomputes ICP status for every company on one revenue-based scale.
// ICP = net revenue >= USD 250M and >= 100 employees. Stock listing is recorded separately and is NOT a criterion.
//   ICP — Verified   : revenue >= 250 from an official source (Claude research from annual reports / results, or a FACT revenue check)
//   ICP — Likely     : >= 250 per your data and/or Seamless, not yet confirmed from an official source
//   ICP — Needs check: your data and Seamless fall on opposite sides of 250
//   Not ICP          : revenue < 250 (verified, or your data and Seamless agree)
//   Unknown          : no revenue figure from any source
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const { data: cos, error } = await db.from("companies").select("*");
if (error) throw error;

const fmt = (m) => (m >= 1000 ? `$${(m / 1000).toFixed(2).replace(/\.?0+$/, "")}B` : `$${Math.round(m)}M`);
const BAND = { "$1B+": [1000, Infinity], "$500M - $1B": [500, 1000], "$100M - $500M": [100, 500], "$50M - $100M": [50, 100],
  "$20M - $50M": [20, 50], "$5M - $20M": [5, 20], "$1M - $5M": [1, 5], "$100K - $1M": [0.1, 1], "$0 - $100K": [0, 0.1] };

function seamless(c) {
  const v = c.profile?.["Claude verification (Seamless, 2026-09-25)"];
  if (!v) return null;
  const exact = Number(v.annual_revenue) / 1e6;
  const band = BAND[v.revenue_range];
  if (isFinite(exact) && exact > 0) return { value: exact, label: `Seamless ~${fmt(exact)}`, low: exact, high: exact };
  if (band) return { value: null, label: `Seamless band ${v.revenue_range}`, low: band[0], high: band[1] };
  return null;
}

let changed = 0;
const tally = {};
for (const c of cos) {
  const claude = (c.lists || []).includes("Claude research") || c.research_channel === "Claude";
  const yours = Number(c.profile?.["Vipin-Profiling"]?.["Size (USD m)"]);
  const hasYours = isFinite(yours) && yours > 0;
  const s = seamless(c);
  let status, reason, display = null, displaySrc = null;

  if (c.verified_revenue_status === "FACT" && c.verified_revenue_usd_m) {
    const v = Number(c.verified_revenue_usd_m);
    status = v >= 250 ? "ICP — Verified" : "Not ICP";
    reason = `Revenue check: ${fmt(v)} (${c.verified_revenue_fy || "latest"}, ${c.verified_revenue_type || "revenue"}) — ${c.verified_revenue_source || "source"}.`;
    display = v; displaySrc = "Verified";
  } else if (claude && c.revenue_usd_m) {
    const v = Number(c.revenue_usd_m);
    status = v >= 250 ? "ICP — Verified" : "Not ICP";
    reason = `Claude research: ${fmt(v)} (${c.revenue_fy || "latest FY"}${c.revenue_local ? `, ${c.revenue_local}` : ""}) from ${c.revenue_source_url || "company disclosures"}.`
      + (v >= 250 && v < 260 ? " Close to the $250M line." : v < 250 && v >= 230 ? " Just below the $250M line." : "")
      + (c.exchange && /delist|buy-out|taken private/i.test(`${c.exchange} ${c.icp_fit_reason || ""}`) ? " Listing changes do not affect ICP." : "");
    display = v; displaySrc = "Claude research";
  } else if (hasYours || s) {
    const yHigh = hasYours && yours >= 250;
    const sHigh = s && s.low >= 250;
    const sLow = s && s.high <= 250;
    display = hasYours ? yours : s?.value ?? null;
    displaySrc = hasYours ? "Your data" : s?.value ? "Seamless est." : null;
    const parts = [hasYours ? `Your data ${fmt(yours)}` : "No figure in your data", s ? s.label : "not in Seamless"];
    if (hasYours && s && ((yHigh && sLow) || (!yHigh && sHigh))) { status = "ICP — Needs check"; reason = `${parts.join(" vs ")} — sources disagree about the $250M line.`; }
    else if (yHigh || sHigh) { status = "ICP — Likely"; reason = `${parts.join(" · ")} — above $250M, not yet confirmed from an official source.`; }
    else if ((hasYours && !yHigh) || sLow) { status = "Not ICP"; reason = `${parts.join(" · ")} — below $250M.`; }
    else { status = "ICP — Needs check"; reason = `${parts.join(" · ")} — Seamless band straddles $250M.`; }
  } else {
    status = "Unknown"; reason = "No revenue figure in your data, Seamless or research yet.";
  }
  tally[status] = (tally[status] || 0) + 1;
  const patch = { icp_status: status, icp_fit: status === "ICP — Verified" ? "Yes" : status === "Not ICP" ? "No" : "Borderline", icp_fit_reason: reason,
    profile: { ...(c.profile || {}), "Display revenue": display ? { value_usd_m: display, source: displaySrc } : null } };
  const { error: e } = await db.from("companies").update(patch).eq("id", c.id);
  if (e) throw e;
  changed++;
}
console.log(`recomputed ${changed} companies`, tally);
