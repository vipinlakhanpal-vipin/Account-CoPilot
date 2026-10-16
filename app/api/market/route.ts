import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getAccess, canSeeRegion } from "@/lib/access";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeDefinition } from "@/lib/icpDefinition.mjs";
import { partnerId } from "@/lib/marketServer";
import { vendorList, VENDORS_KEY, marketKey, cleanVendor, validVendor, DEFAULT_VENDORS, type MarketDoc } from "@/lib/market";

// Market intelligence: partners of SAP, Coupa, Oracle and Microsoft per region and the customers they publish. Read-only, scoped to the user's regions.
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const access = await getAccess(user);
  const db = supabaseAdmin();
  const custom = ((await db.from("settings").select("value").eq("key", VENDORS_KEY).maybeSingle()).data?.value as { custom?: string[] } | null)?.custom || [];
  const { data } = await db.from("settings").select("key,value").like("key", "market_intel:%");
  const docs = (data || []).map((r) => r.value as MarketDoc).filter((d) => d && canSeeRegion(access, d.region));
  const def = normalizeDefinition((await db.from("settings").select("value").eq("key", "icp_definition").maybeSingle()).data?.value);
  const regions = Object.entries(def.regions).filter(([k, r]) => canSeeRegion(access, k) && (r as { status: string }).status === "active").map(([k]) => k);
  const jobs = ((await db.from("settings").select("value").eq("key", "engine_jobs").maybeSingle()).data?.value as { jobs: { mode: string; vendor?: string; customer?: string; slug?: string; contacts_only?: boolean; region: string; status: string; requested_at: string }[] } | null)?.jobs || [];
  const { data: co } = await db.from("companies").select("slug");
  const inApp = new Set((co || []).map((c) => c.slug as string));
  // People already on file in the app for customers that are in the database (shown as a link to the account instead of "none published").
  const slugs = [...new Set(docs.flatMap((d) => (d.customers || []).map((c) => c.slug)).filter((x) => x && inApp.has(x)))];
  const people: Record<string, number> = {};
  if (slugs.length) {
    const { data: ids } = await db.from("companies").select("id,slug").in("slug", slugs);
    const idSlug = new Map((ids || []).map((r) => [r.id as string, r.slug as string]));
    const { data: cs } = await db.from("contacts").select("company_id").in("company_id", [...idSlug.keys()]).limit(10000);
    for (const c of cs || []) { const sl = idSlug.get(c.company_id as string); if (sl) people[sl] = (people[sl] || 0) + 1; }
  }
  return NextResponse.json({
    vendors: vendorList(custom), custom_vendors: custom, is_super: access.isSuper, defaults: DEFAULT_VENDORS, regions,
    partners: docs.flatMap((d) => d.partners || []),
    customers: docs.flatMap((d) => (d.customers || []).map((c) => ({ ...c, in_app: !!c.slug && inApp.has(c.slug), people_on_file: people[c.slug] || 0 }))),
    scans: Object.fromEntries(docs.map((d) => [`${d.vendor}|${d.region}`, d.scanned_at])),
    jobs: jobs.filter((j) => (j.mode === "market" || j.mode === "contacts") && (j.status === "queued" || (j.status === "running" && Date.now() - new Date((j as { started_at?: string }).started_at || j.requested_at).getTime() < 60 * 60000)) && canSeeRegion(access, j.region)).slice(0, 40),
  });
}

// Anyone with access to the region can add a partner the scans missed. It joins the list like a found one and "Find more customers" then searches its customers.
async function addPartner(user: { email?: string | null }, b: { name?: string; vendor?: string; region?: string; website?: string; tier?: string; services?: string; source_url?: string }) {
  const access = await getAccess(user as Parameters<typeof getAccess>[0]);
  const db = supabaseAdmin();
  const vendor = String(b.vendor || ""), region = String(b.region || ""), name = String(b.name || "").trim().replace(/\s+/g, " ").slice(0, 140);
  const custom = ((await db.from("settings").select("value").eq("key", VENDORS_KEY).maybeSingle()).data?.value as { custom?: string[] } | null)?.custom || [];
  if (!vendorList(custom).includes(vendor)) return NextResponse.json({ error: "Unknown vendor." }, { status: 400 });
  if (!canSeeRegion(access, region)) return NextResponse.json({ error: "That region is outside your access." }, { status: 403 });
  if (name.length < 2) return NextResponse.json({ error: "Enter the partner's name." }, { status: 400 });
  const key = marketKey(vendor, region);
  const doc = ((await db.from("settings").select("value").eq("key", key).maybeSingle()).data?.value as MarketDoc | null) || { vendor, region, partners: [], customers: [], scanned_at: "" };
  doc.partners ||= []; doc.customers ||= [];
  const id = partnerId(vendor, region, name);
  if (doc.partners.some((p) => p.id === id)) return NextResponse.json({ error: `${name} is already on the ${vendor} list for ${region}.` }, { status: 409 });
  const site = String(b.website || "").trim().slice(0, 200);
  const src = /^https?:\/\//.test(String(b.source_url || "")) ? String(b.source_url) : site ? (/^https?:\/\//.test(site) ? site : `https://${site}`) : "https://www.google.com/search?q=" + encodeURIComponent(`${name} ${vendor} partner ${region}`);
  doc.partners.unshift({ id, vendor, region, name, website: site, tier: String(b.tier || "").slice(0, 80), services: String(b.services || "").slice(0, 300), hq_city: "", source_url: src, label: "LIKELY", contacts: [], found_at: new Date().toISOString(), added_by: user.email || "" });
  await db.from("settings").upsert({ key, value: doc, updated_at: new Date().toISOString() });
  return NextResponse.json({ ok: true, id });
}

// Super Admin: add a vendor to the list (or remove one that was added). The built-in vendors stay.
export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { action?: string; name?: string; vendor?: string; region?: string; website?: string; tier?: string; services?: string; source_url?: string };
  if (b.action === "add_partner") return addPartner(user, b);
  if (!(await getAccess(user)).isSuper) return NextResponse.json({ error: "Only a Super Admin can change the vendor list." }, { status: 403 });
  const name = cleanVendor(String(b.name || ""));
  const db = supabaseAdmin();
  const cur = ((await db.from("settings").select("value").eq("key", VENDORS_KEY).maybeSingle()).data?.value as { custom?: string[] } | null)?.custom || [];
  let next = cur;
  if (b.action === "add_vendor") {
    if (!validVendor(name)) return NextResponse.json({ error: "Enter a vendor name (2 to 30 letters or numbers)." }, { status: 400 });
    if (vendorList(cur).some((v) => v.toLowerCase() === name.toLowerCase())) return NextResponse.json({ error: `${name} is already on the list.` }, { status: 409 });
    if (cur.length >= 20) return NextResponse.json({ error: "The list is full (20 added vendors)." }, { status: 400 });
    next = [...cur, name];
  } else if (b.action === "remove_vendor") {
    next = cur.filter((v) => v.toLowerCase() !== name.toLowerCase());
    if (next.length === cur.length) return NextResponse.json({ error: "Only vendors you added can be removed." }, { status: 400 });
  } else return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  await db.from("settings").upsert({ key: VENDORS_KEY, value: { custom: next }, updated_at: new Date().toISOString() });
  return NextResponse.json({ ok: true, vendors: vendorList(next) });
}
