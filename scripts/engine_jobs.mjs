// Job queue for scheduled Claude sessions (Settings → Discovery & refresh engine → Search companies).
//   node scripts/engine_jobs.mjs claim            → prints the oldest queued job as JSON and marks it running (or "none")
//   node scripts/engine_jobs.mjs done <id> "<result summary>"
//   node scripts/engine_jobs.mjs error <id> "<message>"
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

if (fs.existsSync(".env.local")) for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const [cmd, id, text] = process.argv.slice(2);
const { data } = await db.from("settings").select("value").eq("key", "engine_jobs").maybeSingle();
const jobs = data?.value?.jobs || [];
const save = () => db.from("settings").upsert({ key: "engine_jobs", value: { jobs }, updated_at: new Date().toISOString() });
if (cmd === "claim") {
  const job = [...jobs].reverse().find((j) => j.status === "queued");
  if (!job) { console.log("none"); process.exit(0); }
  job.status = "running"; job.started_at = new Date().toISOString();
  await save(); console.log(JSON.stringify(job));
} else if (cmd === "done" || cmd === "error") {
  const job = jobs.find((j) => j.id === id);
  if (!job) throw new Error(`job ${id} not found`);
  job.status = cmd; job.done_at = new Date().toISOString(); job.result = text || "";
  await save(); console.log(`${id} → ${cmd}`);
} else console.log("usage: claim | done <id> <result> | error <id> <message>");
