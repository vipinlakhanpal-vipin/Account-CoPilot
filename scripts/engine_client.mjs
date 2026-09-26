// Client for scheduled Claude sessions: talks to the app's limited engine API (no Supabase key needed).
// Env: APP_URL (e.g. https://account-copilot.vercel.app) and ENGINE_TOKEN (Settings → Scheduled session access).
//   node scripts/engine_client.mjs claim
//   node scripts/engine_client.mjs queue <REGION> <LIMIT>              → writes data/verification/revenue_queue.json
//   node scripts/engine_client.mjs submit [dir]                         → sends every result file in data/verification/revenue (default) not yet sent
//   node scripts/engine_client.mjs add <file.json>                      → adds discovered companies (format: see scripts/add_companies.mjs)
//   node scripts/engine_client.mjs finish <id> done|error "<result>"
//   node scripts/engine_client.mjs log "<summary>" <verified_count> "<new names;…>"
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
const [cmd, a, b, c] = process.argv.slice(2);
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
  const { added, skipped } = await call({ action: "add_companies", companies: list });
  added.forEach((x) => console.log(`added ${x.company_name} (${x.slug})`)); console.log(`${added.length} added, ${skipped} already in the app`);
} else if (cmd === "finish") console.log(JSON.stringify(await call({ action: "finish", id: a, status: b === "error" ? "error" : "done", result: c || "" })));
else if (cmd === "log") console.log(JSON.stringify(await call({ action: "log", summary: a || "", verified: Number(b) || 0, new_companies: String(c || "").split(";").map((x) => x.trim()).filter(Boolean) })));
else console.log("usage: claim | queue <region> <limit> | submit [dir] | add <file> | finish <id> done|error <result> | log <summary> <verified> <names;…>");
