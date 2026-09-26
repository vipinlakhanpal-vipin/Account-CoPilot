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

import { statusPatch } from "../lib/icpStatus.mjs";

let changed = 0;
const tally = {};
for (const c of cos) {
  const { status, patch } = statusPatch(c);
  tally[status] = (tally[status] || 0) + 1;
  const { error: e } = await db.from("companies").update(patch).eq("id", c.id);
  if (e) throw e;
  changed++;
}
console.log(`recomputed ${changed} companies`, tally);
