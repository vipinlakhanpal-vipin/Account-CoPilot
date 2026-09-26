// ICP status rules — shared by scripts/recompute_icp.mjs, scripts/verify_revenue.mjs and the app (engine worker API).
// Keep this the single source of truth; see CLAUDE.md "ICP definition".
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


/** Returns the update patch (icp_status, icp_fit, icp_fit_reason, profile with Display revenue / Status changed, updated_at) for one company row. */
export function statusPatch(c) {
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
  } else if (["LIKELY", "UNVERIFIED"].includes(c.verified_revenue_status) && c.verified_revenue_usd_m) {
    const v = Number(c.verified_revenue_usd_m);
    status = v >= 250 ? "ICP — Likely" : "ICP — Needs check";
    reason = `Revenue check (estimate): ${fmt(v)} (${c.verified_revenue_fy || "latest"}) — ${c.verified_revenue_source || "estimate"}. No official figure published.`;
    display = v; displaySrc = "Estimate";
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
  } else if (c.profile?.["Seamless discovery"]) {
    // Seamless discovery rows: Seamless revenue bands are unreliable on their own (single hotels show "$1B+"),
    // so the band only counts when headcount agrees. 1,001+ staff → Likely; 201-1,000 staff → Needs check.
    const d = c.profile["Seamless discovery"];
    const staff = Number(String(d.employee_count || "").replace(/\D/g, "")) || 0;
    const band = BAND[d.revenue_range];
    display = band ? band[0] : null; displaySrc = "Seamless band";
    if (band && band[0] >= 250 && staff >= 1001) { status = "ICP — Likely"; reason = `Seamless discovery: revenue band ${d.revenue_range}, ${d.staff_range} — band and headcount agree, not yet confirmed from an official source.`; }
    else if (band && band[0] >= 250) { status = "ICP — Needs check"; reason = `Seamless discovery: revenue band ${d.revenue_range} but only ${d.staff_range} — headcount looks small for that revenue; needs an official figure.`; }
    else { status = "Unknown"; reason = "Seamless discovery record without a usable revenue band."; }
  } else {
    status = "Unknown"; reason = "No revenue figure in your data, Seamless or research yet.";
  }
  // Keep the revenue-check explanation (written by verify_revenue.mjs --apply) so findings are not lost on recompute.
  const check = c.profile?.["Revenue check"]?.reasoning;
  if (check && !reason.includes(check)) reason += ` Revenue check notes: ${check}`;
  const patch = { icp_status: status, icp_fit: status === "ICP — Verified" ? "Yes" : status === "Not ICP" ? "No" : "Borderline", icp_fit_reason: reason,
    profile: { ...(c.profile || {}), "Display revenue": display ? { value_usd_m: display, source: displaySrc } : null } };
  // Record dates: stamp updated_at and "Status changed" only when the ICP status actually changes.
  if (status !== c.icp_status) {
    const now = new Date().toISOString();
    patch.updated_at = now;
    patch.profile["Status changed"] = { at: now, from: c.icp_status || null, to: status };
  }
  return { status, patch };
}

/** Applies one revenue-check result (CLAUDE.md format) to a company: Claude-owned fields, "Revenue check" note, deduplicated source row. */
export async function applyRevenueResult(db, c, r) {
  const status = r.icp_verdict === "Verified ICP" ? "ICP — Verified" : r.icp_verdict === "Likely ICP" ? "ICP — Likely"
    : r.icp_verdict === "Below $250M" ? "Not ICP" : c.icp_status;
  const now = new Date().toISOString();
  const profile = { ...(c.profile || {}), "Revenue check": { at: r.checked_at, verdict: r.icp_verdict, status: r.revenue_status, reasoning: r.reasoning },
    ...(status !== c.icp_status ? { "Status changed": { at: now, from: c.icp_status || null, to: status } } : {}) };
  const fields = {
    icp_status: status, listing_status: r.listing_status, exchange: r.exchange || null, ticker: r.ticker || null,
    verified_revenue_usd_m: r.net_revenue_usd_m, verified_revenue_fy: r.fiscal_year || null, verified_revenue_type: r.revenue_type,
    verified_revenue_source: r.source_name || null, verified_revenue_url: r.source_url || null, verified_revenue_status: r.revenue_status,
    icp_fit: r.icp_verdict === "Verified ICP" ? "Yes" : r.icp_verdict === "Below $250M" ? "No" : "Borderline",
    icp_fit_reason: r.reasoning, last_verified: r.checked_at, updated_at: now, profile,
  };
  const { error } = await db.from("companies").update(fields).eq("id", c.id);
  if (error) throw error;
  // One source row per company + URL + finding: re-running must not duplicate the audit trail.
  const info = `Revenue ${r.revenue_local || r.net_revenue_usd_m + " USD m"} (${r.fiscal_year}, ${r.revenue_type})`;
  if (r.source_url) {
    const { data: dupe } = await db.from("sources").select("id").eq("company_id", c.id).eq("url", r.source_url).eq("information_found", info).limit(1);
    if (!dupe?.length) await db.from("sources").insert({ company_id: c.id, source: r.source_name, source_type: r.source_kind, url: r.source_url,
      information_found: info, evidence: r.reasoning, confidence: r.revenue_status === "FACT" ? "HIGH" : r.revenue_status === "LIKELY" ? "MEDIUM" : "LOW", supports_s2p_status: "N/A" });
  }
  return { ...c, ...fields };
}
