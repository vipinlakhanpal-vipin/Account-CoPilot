import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// The facts a pitch plan is written from: the same ones the paid button sends, read on the server. Contacts are names, titles and roles only (never emails or phones).
export async function pitchFacts(db: SupabaseClient, slug: string) {
  const { data: a } = await db.from("companies").select("*").eq("slug", slug).maybeSingle();
  if (!a) return null;
  const [{ data: cs }, { data: sg }, { data: tech }, { data: bs }] = await Promise.all([
    db.from("contacts").select("full_name,title_verbatim,role_family,contact_tier").eq("company_id", a.id),
    db.from("s2p_signals").select("level,signal,evidence,date,source_url").eq("company_id", a.id),
    db.from("technology_evidence").select("name,category,status").eq("company_id", a.id),
    db.from("settings").select("value").eq("key", "buying_signals").maybeSingle(),
  ]);
  const mine = ((bs?.value as { items?: { slug: string; lane: string; strength: string; title: string; evidence: string; source_url: string; published: string; closes: string; status: string }[] } | null)?.items || []).filter((i) => i.slug === slug && i.status !== "dismissed");
  return {
    company: a.company_name, country: a.country, hq_city: a.hq_city, industry: a.industry, listing: a.listing_status, website: a.company_website,
    revenue_usd_m: a.verified_revenue_usd_m ?? a.revenue_usd_m, revenue_status: a.verified_revenue_status, revenue_source: a.verified_revenue_source,
    icp_status: a.icp_status, icp_reason: a.icp_fit_reason, erp: a.erp, existing_s2p: a.existing_s2p_product, s2p_detail: a.existing_s2p_detail, s2p_status: a.s2p_platform_status, signal: a.s2p_signal_level,
    s2p_signals: a.s2p_strong_signals, procurement_transformation: a.procurement_transformation_signals, digital: a.digital_transformation_signals, procurement_model: a.procurement_model,
    coupa_opportunity: a.coupa_opportunity_type, ariba_opportunity: a.ariba_opportunity_type, opportunity: a.potential_opportunity, notes: a.account_notes,
    technology: (tech || []).map((t) => `${t.name} (${t.category}, ${t.status})`),
    signals: (sg || []).map((s) => `${s.level}: ${s.signal} — ${s.evidence} (${s.date || ""}) ${s.source_url || ""}`),
    buying_signals: mine.map((i) => `${i.strength} ${i.lane}: ${i.title} — ${i.evidence} (${i.published || ""}${i.closes ? `, closes ${i.closes}` : ""}) ${i.source_url}`),
    contacts: (cs || []).map((p) => `${p.full_name} — ${p.title_verbatim} — ${p.role_family || ""} ${p.contact_tier || ""}`),
  };
}
