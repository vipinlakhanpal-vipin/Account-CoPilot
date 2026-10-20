// Local equivalent of the worker's add_signals (uses the database key, so run it only from a local session).
//   npx -y -p node@22 node scripts/add_signals_local.mjs data/verification/new_signals.json
// Same rules as app/api/engine/worker/route.ts: ECC needs a company already in the app; a closed tender is skipped; Hot needs label FACT; id = hash of lane, company and source page, so
// the daily run updates the same signal instead of duplicating it. A company is matched to the app only on an identical normalised name (the worker's looser matching runs later).
import fs from "node:fs";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { regionOf } from "../lib/icpDefinition.mjs";

if (fs.existsSync(".env.local")) for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const body = JSON.parse(fs.readFileSync(process.argv[2] || "data/verification/new_signals.json", "utf8"));
const norm = (t) => String(t).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
const { data: row } = await db.from("settings").select("value").eq("key", "buying_signals").maybeSingle();
const st = row?.value || { items: [], scans: {}, sweeps: {} };
st.items ||= []; st.scans ||= {}; st.sweeps ||= {};
const { data: have } = await db.from("companies").select("slug,company_name,country");
const now = new Date().toISOString(), today = now.slice(0, 10), added = [], updated = [], skipped = [];
for (const x of body.signals || []) {
  const co = (have || []).find((c) => (x.slug && c.slug === x.slug) || norm(c.company_name) === norm(x.company_name));
  if (x.lane === "ecc" && !co) { skipped.push([x.title, "ECC needs a company already in the app"]); continue; }
  if (x.lane === "rfp" && x.closes && x.closes < today) { skipped.push([x.title, "tender already closed"]); continue; }
  const strength = x.strength === "Hot" && x.label !== "FACT" ? "Warm" : x.strength;
  const slug = co?.slug || "", region = co ? regionOf(co.country) : regionOf(x.region);
  const id = createHash("sha1").update(`${x.lane}|${slug || norm(x.company_name)}|${x.source_url.replace(/[#?].*$/, "")}`).digest("hex").slice(0, 16);
  const old = st.items.find((i) => i.id === id);
  if (old) { Object.assign(old, { strength, label: x.label, evidence: x.evidence, why: x.why || old.why, closes: x.closes || old.closes, doc_url: x.doc_url || old.doc_url }); updated.push(x.title); continue; }
  st.items.unshift({ id, lane: x.lane, strength, label: x.label, company_name: co?.company_name || x.company_name, slug, region, title: x.title, evidence: x.evidence, why: x.why || "",
    source_name: x.source_name || "", source_url: x.source_url, doc_url: x.doc_url || "", needs_login: !!x.needs_login, published: x.published || "", closes: x.closes || "", detected_at: now, status: "new" });
  added.push(`${x.title} [${region}${slug ? ", in app" : ""}]`);
}
for (const r of body.sweep_regions || []) st.sweeps[regionOf(r)] = now;
const cutoff = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
st.items = st.items.filter((i) => !(i.lane === "rfp" && i.closes && i.closes < cutoff)).slice(0, 1500);
const { error } = await db.from("settings").upsert({ key: "buying_signals", value: st, updated_at: now });
if (error) throw error;
console.log(JSON.stringify({ added, updated, skipped }, null, 2));
