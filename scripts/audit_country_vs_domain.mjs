// Read-only audit: flag companies whose stored country contradicts their domain's country-code TLD.
// Does not change anything. GCC ccTLDs only (a mismatch elsewhere is not proof — many legitimate
// group HQs use .com regardless of where they're based).
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

if (fs.existsSync(".env.local")) for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const TLD_COUNTRY = { ".ae": "UAE", ".com.sa": "KSA", ".sa": "KSA", ".qa": "Qatar", ".kw": "Kuwait", ".om": "Oman", ".bh": "Bahrain", ".eg": "Egypt" };

const { data, error } = await db.from("companies").select("slug,company_name,country,domain").limit(5000);
if (error) { console.error(error); process.exit(1); }

const mismatches = [];
for (const c of data) {
  if (!c.domain) continue;
  const d = c.domain.toLowerCase();
  const tld = Object.keys(TLD_COUNTRY).find((t) => d.endsWith(t));
  if (!tld) continue;
  const expected = TLD_COUNTRY[tld];
  if (c.country && c.country !== expected) mismatches.push({ slug: c.slug, name: c.company_name, stored: c.country, domain_suggests: expected, domain: c.domain });
}
console.log(`Checked ${data.length} companies total. Found ${mismatches.length} country/domain-TLD mismatches:\n`);
for (const m of mismatches) console.log(`${m.slug} | ${m.name} | stored=${m.stored} domain=${m.domain} (suggests ${m.domain_suggests})`);
