// ICP revenue check for companies in your target list (listed or private).
// Uses Claude Opus 5 with web search/fetch via your ANTHROPIC_API_KEY (in .env.local). Resumable: results are cached
// in data/verification/revenue/<slug>.json and skipped on re-run.
//   node scripts/verify_revenue.mjs            → all "Your target" companies
//   node scripts/verify_revenue.mjs --limit 3  → first 3 (trial run)
//   node scripts/verify_revenue.mjs --apply    → write cached results to Supabase
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { createClient } from "@supabase/supabase-js";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const args = process.argv.slice(2);
const LIMIT = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : Infinity;
const APPLY = args.includes("--apply");
const ONLY = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",").map((x) => x.toLowerCase()) : null;
const CONCURRENCY = 3;
const OUT = "data/verification/revenue";
fs.mkdirSync(OUT, { recursive: true });

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const { data: companies, error } = await db.from("companies").select("id,slug,company_name,company_website,domain,revenue_usd_m,icp_status,profile").in("icp_status", ["ICP — Likely", "ICP — Needs check", "Unknown"]);
if (error) throw error;

const Result = z.object({
  listing_status: z.enum(["Listed", "Private", "Government-owned", "Subsidiary of listed group", "Unknown"]),
  exchange: z.string(), ticker: z.string(), parent_company: z.string(),
  net_revenue_usd_m: z.number().nullable(), fiscal_year: z.string(),
  revenue_type: z.enum(["Net revenue", "Gross revenue", "Total operating income", "Estimate", "Not found"]),
  revenue_local: z.string(), source_name: z.string(), source_url: z.string(),
  source_kind: z.enum(["Company report/website", "Parent or bond disclosure", "Business press", "Estimate/aggregator", "None"]),
  revenue_status: z.enum(["FACT", "LIKELY", "UNVERIFIED", "UNKNOWN"]),
  employees: z.string(), employees_source_url: z.string(),
  icp_verdict: z.enum(["Verified ICP", "Likely ICP", "Below $250M", "Revenue not found"]),
  reasoning: z.string(),
});

const client = new Anthropic();
const SYSTEM = `You verify the latest annual NET revenue and headcount of a UAE company for B2B sales qualification.
ICP = net revenue >= USD 250M AND >= 100 employees. Stock listing is NOT required; record it separately.
Search the web. Prefer, in order: (1) company annual/sustainability reports, results releases, website statements; (2) listed parent segment
disclosures, bond/sukuk prospectuses, credit-rating reports; (3) reputable business press (Forbes Middle East, Arabian Business, Zawya, Gulf News,
The National, Bloomberg, Reuters); (4) estimates/aggregators (Wikipedia, D&B, Growjo, Zoominfo snippets) — these can only support LIKELY.
Rules: convert AED at 3.6725 per USD. Use the most recent fiscal year you can source (2024 or 2025 preferred). Group revenue of a conglomerate counts
only if the named company IS that group. Never invent a figure or URL; if nothing credible is found, use null and "Revenue not found".
icp_verdict: "Verified ICP" only when revenue_status is FACT (source kinds 1-3) and revenue >= 250 and employees plausibly >= 100;
"Likely ICP" when only an estimate or older/indirect figure puts it >= 250; "Below $250M" when a credible figure is below 250.`;

async function check(c) {
  const file = path.join(OUT, `${c.slug}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  const yours = c.profile?.["Vipin-Profiling"]?.["Size (USD m)"] ?? c.revenue_usd_m;
  const messages = [{ role: "user", content: `Company: ${c.company_name}\nWebsite: ${c.company_website || c.domain || "unknown"}\nThe user's own size estimate: ${yours ?? "none"} USD m (verify independently; do not copy it).` }];
  let notes = "";
  const usage = { input: 0, output: 0, searches: 0 };
  const add = (u) => { if (!u) return; usage.input += (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
    usage.output += u.output_tokens || 0; usage.searches += u.server_tool_use?.web_search_requests || 0; };
  for (let turn = 0; turn < 4; turn++) {
    const msg = await client.beta.messages.stream({
      model: "claude-opus-5", max_tokens: 16000, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
      thinking: { type: "adaptive" }, output_config: { effort: "medium" }, system: SYSTEM,
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 6 }, { type: "web_fetch_20260209", name: "web_fetch", max_uses: 4 }],
      messages,
    }).finalMessage();
    add(msg.usage);
    for (const b of msg.content) if (b.type === "text") notes += b.text;
    if (msg.stop_reason === "pause_turn") { messages.push({ role: "assistant", content: msg.content }); continue; }
    break;
  }
  const parsed = await client.messages.parse({
    model: "claude-opus-5", max_tokens: 4000, output_config: { effort: "low", format: zodOutputFormat(Result) },
    system: "Convert the research notes into the JSON fields. Use only what the notes support; unknown → empty string, null or the 'not found' option.",
    messages: [{ role: "user", content: `Company: ${c.company_name}\nNOTES:\n${notes}` }],
  });
  add(parsed.usage);
  usage.cost_usd = +(usage.input * 5e-6 + usage.output * 25e-6 + usage.searches * 0.01).toFixed(3);
  const out = { _usage: usage, slug: c.slug, company_name: c.company_name, checked_at: new Date().toISOString(), ...(parsed.parsed_output || { icp_verdict: "Revenue not found", reasoning: "Extraction failed" }) };
  fs.writeFileSync(file, JSON.stringify(out, null, 1));
  return out;
}

if (!APPLY) {
  const todo = companies.filter((c) => !fs.existsSync(path.join(OUT, `${c.slug}.json`)))
    .filter((c) => !ONLY || ONLY.some((o) => c.company_name.toLowerCase().includes(o))).slice(0, LIMIT);
  console.log(`${companies.length} target companies · ${todo.length} to check now`);
  let done = 0;
  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    await Promise.all(todo.slice(i, i + CONCURRENCY).map(async (c) => {
      try { const r = await check(c); done++; console.log(`[${done}/${todo.length}] ${c.company_name}: ${r.icp_verdict} ${r.net_revenue_usd_m ?? ""} (${r.fiscal_year || ""}) · ~$${r._usage?.cost_usd ?? "?"}`); }
      catch (e) { console.log(`[error] ${c.company_name}: ${e.message}`); }
    }));
  }
} else {
  let n = 0;
  for (const c of companies) {
    const file = path.join(OUT, `${c.slug}.json`);
    if (!fs.existsSync(file)) continue;
    const r = JSON.parse(fs.readFileSync(file, "utf8"));
    const status = r.icp_verdict === "Verified ICP" ? "ICP — Verified" : r.icp_verdict === "Likely ICP" ? "ICP — Likely"
      : r.icp_verdict === "Below $250M" ? "Not ICP" : c.icp_status;
    const { error: e } = await db.from("companies").update({
      icp_status: status, listing_status: r.listing_status, exchange: r.exchange || null, ticker: r.ticker || null,
      verified_revenue_usd_m: r.net_revenue_usd_m, verified_revenue_fy: r.fiscal_year || null, verified_revenue_type: r.revenue_type,
      verified_revenue_source: r.source_name || null, verified_revenue_url: r.source_url || null, verified_revenue_status: r.revenue_status,
      icp_fit: r.icp_verdict === "Verified ICP" ? "Yes" : r.icp_verdict === "Below $250M" ? "No" : "Borderline",
      icp_fit_reason: r.reasoning, last_verified: r.checked_at,
    }).eq("id", c.id);
    if (e) throw e;
    if (r.source_url) await db.from("sources").insert({ company_id: c.id, source: r.source_name, source_type: r.source_kind, url: r.source_url,
      information_found: `Revenue ${r.revenue_local || r.net_revenue_usd_m + " USD m"} (${r.fiscal_year}, ${r.revenue_type})`, evidence: r.reasoning,
      confidence: r.revenue_status === "FACT" ? "HIGH" : r.revenue_status === "LIKELY" ? "MEDIUM" : "LOW", supports_s2p_status: "N/A" });
    n++;
  }
  console.log(`applied ${n} revenue checks — now run: node scripts/recompute_icp.mjs`);
}
