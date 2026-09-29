// Client for scheduled Claude sessions: talks to the app's limited engine API (no Supabase key needed).
// Env: APP_URL (e.g. https://account-copilot.vercel.app) and ENGINE_TOKEN (Settings → Scheduled session access).
//   node scripts/engine_client.mjs claim
//   node scripts/engine_client.mjs queue <REGION> <LIMIT>              → writes data/verification/revenue_queue.json
//   node scripts/engine_client.mjs submit [dir]                         → sends every result file in data/verification/revenue (default) not yet sent
//   node scripts/engine_client.mjs add <file.json>                      → adds discovered companies (format: see scripts/add_companies.mjs)
//   node scripts/engine_client.mjs hold <file.json>                     → queues a company whose real country's region isn't Active yet (same format as add); shown as a banner until a Super Admin activates that region
//   node scripts/engine_client.mjs finish <id> done|error "<result>"
//   node scripts/engine_client.mjs log "<summary>" <verified_count> "<new names;…>" <daily|instant>  → source is which routine you are (required — see ENGINE.md step 3); also
//                                                                                                sends data/verification/run_details.json if present: [{"name","status","revenue"}]
//                                                                                                (one row per company checked this run), for the bell's table
import fs from "node:fs";
import path from "node:path";

const { APP_URL, ENGINE_TOKEN } = process.env;
if (!APP_URL || !ENGINE_TOKEN) { console.error("APP_URL and ENGINE_TOKEN must be set in the environment."); process.exit(2); }
const call = async (body) => {
  const r = await fetch(`${APP_URL.replace(/\/$/, "")}/api/engine/worker`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${ENGINE_TOKEN}` }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { console.error(`HTTP ${r.status}: ${JSON.stringify(j)}`); process.exit(1); }
  return j;
};
const [cmd, a, b, c, d] = process.argv.slice(2);
if (cmd === "claim") console.log(JSON.stringify((await call({ action: "claim" })).job));
else if (cmd === "queue") {
  const { queue } = await call({ action: "queue", region: a || "UAE", limit: Number(b) || 50 });
  fs.mkdirSync("data/verification", { recursive: true });
  fs.writeFileSync("data/verification/revenue_queue.json", JSON.stringify(queue, null, 1));
  console.log(`queue: ${queue.length} companies → data/verification/revenue_queue.json`);
} else if (cmd === "submit") {
  const dir = a || "data/verification/revenue", sentFile = path.join(dir, ".sent.json");
  const sent = new Set(fs.existsSync(sentFile) ? JSON.parse(fs.readFileSync(sentFile, "utf8")) : []);
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith(".") && !sent.has(f)) : [];
  for (let i = 0; i < files.length; i += 20) {
    const batch = files.slice(i, i + 20);
    const { applied } = await call({ action: "submit", results: batch.map((f) => { const r = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); delete r._usage; return r; }) });
    applied.forEach((x) => console.log(x)); batch.forEach((f) => sent.add(f));
    fs.writeFileSync(sentFile, JSON.stringify([...sent]));
  }
  console.log(`submitted ${files.length} result file(s)`);
} else if (cmd === "add") {
  const list = JSON.parse(fs.readFileSync(a || "data/verification/new_companies.json", "utf8"));
  const { added, skipped, skipped_detail = [] } = await call({ action: "add_companies", companies: list });
  added.forEach((x) => console.log(`added ${x.company_name} (${x.slug})`));
  skipped_detail.forEach((x) => console.log(`SKIPPED ${x.name}: already in the app as "${x.matches}"`));
  console.log(`${added.length} added, ${skipped} already in the app${skipped ? " (find replacements so the day still adds 5)" : ""}`);
} else if (cmd === "hold") {
  const list = JSON.parse(fs.readFileSync(a || "data/verification/new_companies.json", "utf8"));
  const { held, skipped, skipped_detail = [] } = await call({ action: "hold_companies", companies: list });
  held.forEach((x) => console.log(`held ${x.name} — queued for ${x.region} (not Active yet)`));
  skipped_detail.forEach((x) => console.log(`SKIPPED ${x.name}: already in the app or already held as "${x.matches}"`));
  console.log(`${held.length} held, ${skipped} already in the app or already held`);
} else if (cmd === "icp") {
  const j = await call({ action: "icp" });
  fs.mkdirSync("data/verification", { recursive: true });
  fs.writeFileSync("data/verification/icp_rules.json", JSON.stringify(j, null, 1));
  console.log(`ICP definition (updated ${j.updated_at || "never — defaults"}${j.updated_by ? " by " + j.updated_by : ""}) written to data/verification/icp_rules.json`);
  j.summary.forEach((x) => console.log("  " + x));
  console.log("Active regions: " + (j.active.map((a) => `${a.region} (find ${a.discover_per_day}, verify ${a.verify_per_day})`).join(", ") || "none"));
} else if (cmd === "watch") {
  // watch            → writes the watch list that is due for a re-check to data/verification/revenue_queue.json
  // watch <slug>     → adds an existing company to the watch list
  if (a) { console.log(JSON.stringify(await call({ action: "watch", slug: a }))); }
  else { const { queue } = await call({ action: "watch" }); fs.mkdirSync("data/verification", { recursive: true });
    fs.writeFileSync("data/verification/revenue_queue.json", JSON.stringify(queue, null, 1)); console.log(`${queue.length} watched compan${queue.length === 1 ? "y" : "ies"} due for a re-check`); }
} else if (cmd === "names") {
  const { companies } = await call({ action: "names" });
  fs.mkdirSync("data/verification", { recursive: true });
  fs.writeFileSync("data/verification/existing_companies.json", JSON.stringify(companies, null, 1));
  console.log(`${companies.length} existing companies written to data/verification/existing_companies.json — do not propose any of these (or their group/subsidiary under another name)`);
} else if (cmd === "finish") console.log(JSON.stringify(await call({ action: "finish", id: a, status: b === "error" ? "error" : "done", result: c || "", ...(process.argv[6] ? { slug: process.argv[6] } : {}) })));
else if (cmd === "log") {
  const detailsFile = "data/verification/run_details.json";
  const details = fs.existsSync(detailsFile) ? JSON.parse(fs.readFileSync(detailsFile, "utf8")) : [];
  console.log(JSON.stringify(await call({ action: "log", summary: a || "", verified: Number(b) || 0, new_companies: String(c || "").split(";").map((x) => x.trim()).filter(Boolean), details, source: d === "instant" ? "instant" : "daily" })));
}
else console.log("usage: claim | icp | names | watch [slug] | queue <region> <limit> | submit [dir] | add <file> | hold <file> | finish <id> done|error <result> | log <summary> <verified> <names;…>");
