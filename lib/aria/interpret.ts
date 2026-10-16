import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { AccountFilter } from "@/lib/aria/tools";

// Plan first: one small call to Claude (Haiku by default) turns the person's sentence into a structured plan. The app then runs that plan with its own
// deterministic tools, so the numbers always come from the database, and the person can confirm the reading when it was not certain.
export type Plan = {
  intent: "list" | "count" | "company" | "contacts" | "report" | "rules" | "other";
  summary: string; filters: AccountFilter; limit?: number; sort_by?: "revenue" | "name"; group_by?: string; format?: "pdf" | "xlsx"; company?: string; role?: string;
  assumptions: string[]; not_supported: string[]; confident: boolean;
};

const GROUPS = ["icp_status", "country", "signal", "platform", "erp", "industry", "entity_type"];
const SYSTEM = (regions: string[], today: string) => `You read a request typed into Account CoPilot (a B2B procurement-intelligence app for SCP, a Coupa / SAP Ariba partner) and turn it into a plan by calling the plan tool. You do not answer the question yourself.
Today is ${today}. The user may see these regions only: ${regions.join(", ") || "none"}.
What the app can filter on: region; ICP status (Verified, Likely, Needs check, Unknown, Not ICP); existing platform (coupa, ariba, other, none); ERP name contains (SAP, Oracle, Dynamics...); industry text; S2P signal strength; part of a company name; net revenue range in US dollar MILLIONS (convert: 1b = 1000, AED at 3.6725 per USD); has contacts; platforms to EXCLUDE (coupa, ariba: "SAP Ariba" means the platform Ariba, not the SAP ERP); ERP names to EXCLUDE.
Intents: list (companies), count (how many, optionally grouped by ${GROUPS.join(", ")}), company (about ONE named company), contacts (people, optionally a role such as cfo, cpo, procurement), report (PDF or Excel; set format), rules (ICP rules), other (anything else about the data).
Rules: read plain English and misspellings. "revenue between/of X upto/to Y" is a range with min X and max Y. Put in summary one short sentence of how you read it. List in assumptions anything you had to guess or that could mean two things (for example region not stated, "big" companies, "recent"). List in not_supported any limit the app cannot filter on (staff size, ownership or listing type, a city, a time period, growth). Set confident false when you guessed anything important or the request is vague. Never invent a filter the person did not ask for. Use the earlier messages of the chat to understand follow-ups such as "only verified".`;

const TOOL: Anthropic.Tool = { name: "plan", description: "The structured reading of the request.", input_schema: { type: "object", required: ["intent", "summary", "confident"], properties: {
  intent: { type: "string", enum: ["list", "count", "company", "contacts", "report", "rules", "other"] }, summary: { type: "string" }, confident: { type: "boolean" },
  assumptions: { type: "array", items: { type: "string" } }, not_supported: { type: "array", items: { type: "string" } },
  filters: { type: "object", properties: { region: { type: "string" }, icp_status: { type: "array", items: { type: "string", enum: ["Verified", "Likely", "Needs check", "Unknown", "Not ICP"] } }, platform: { type: "string", enum: ["coupa", "ariba", "other", "none"] },
    erp_contains: { type: "string" }, industry_contains: { type: "string" }, signal: { type: "array", items: { type: "string" } }, name_contains: { type: "string" }, min_revenue_usd_m: { type: "number" }, max_revenue_usd_m: { type: "number" }, has_contacts: { type: "boolean" }, exclude_platform: { type: "array", items: { type: "string", enum: ["coupa", "ariba"] } }, exclude_erp: { type: "array", items: { type: "string" } } } },
  limit: { type: "integer" }, sort_by: { type: "string", enum: ["revenue", "name"] }, group_by: { type: "string", enum: GROUPS }, format: { type: "string", enum: ["pdf", "xlsx"] }, company: { type: "string" }, role: { type: "string" } } } };

const num = (v: unknown) => (typeof v === "number" && isFinite(v) && v >= 0 ? v : undefined);
const strs = (v: unknown) => (Array.isArray(v) ? v.map(String).filter(Boolean).slice(0, 8) : []);
/** Whatever Claude returned is cleaned to known fields only. */
export function cleanPlan(raw: unknown): Plan | null {
  const r = (raw || {}) as Record<string, unknown>, fl = (r.filters || {}) as Record<string, unknown>;
  const intent = ["list", "count", "company", "contacts", "report", "rules", "other"].includes(String(r.intent)) ? (r.intent as Plan["intent"]) : null;
  if (!intent) return null;
  const f: AccountFilter = {};
  if (typeof fl.region === "string" && fl.region) f.region = fl.region;
  const st = strs(fl.icp_status).filter((x) => ["Verified", "Likely", "Needs check", "Unknown", "Not ICP"].includes(x)); if (st.length) f.icp_status = st;
  if (["coupa", "ariba", "other", "none"].includes(String(fl.platform))) f.platform = String(fl.platform);
  if (typeof fl.erp_contains === "string" && fl.erp_contains) f.erp_contains = fl.erp_contains.slice(0, 30);
  if (typeof fl.industry_contains === "string" && fl.industry_contains) f.industry_contains = fl.industry_contains.slice(0, 40);
  if (typeof fl.name_contains === "string" && fl.name_contains) f.name_contains = fl.name_contains.slice(0, 60);
  const sg = strs(fl.signal); if (sg.length) f.signal = sg;
  const lo = num(fl.min_revenue_usd_m), hi = num(fl.max_revenue_usd_m); if (lo !== undefined) f.min_revenue_usd_m = lo; if (hi !== undefined) f.max_revenue_usd_m = hi;
  if (fl.has_contacts === true) f.has_contacts = true;
  const xp = strs(fl.exclude_platform).filter((x) => x === "coupa" || x === "ariba"); if (xp.length) f.exclude_platform = xp;
  const xe = strs(fl.exclude_erp).map((x) => x.slice(0, 30)); if (xe.length) f.exclude_erp = xe;
  return { intent, summary: String(r.summary || "").slice(0, 300), filters: f, limit: num(r.limit) ? Math.min(Math.round(Number(r.limit)), 200) : undefined,
    sort_by: r.sort_by === "name" ? "name" : r.sort_by === "revenue" ? "revenue" : undefined, group_by: GROUPS.includes(String(r.group_by)) ? String(r.group_by) : undefined,
    format: r.format === "pdf" || r.format === "xlsx" ? r.format : undefined, company: typeof r.company === "string" ? r.company.slice(0, 120) : undefined, role: typeof r.role === "string" ? r.role.slice(0, 30) : undefined,
    assumptions: strs(r.assumptions), not_supported: strs(r.not_supported), confident: r.confident !== false };
}

export async function interpret(history: { role: "user" | "assistant"; content: string }[], regions: string[]): Promise<{ plan: Plan | null; input: number; output: number }> {
  const client = new Anthropic();
  const msgs = history.slice(-8).map((m) => ({ role: m.role, content: m.content.replace(/^§\w+:\s*/, "").slice(0, 1200) }));
  const res = await client.messages.create({ model: process.env.ARIA_MODEL || "claude-haiku-4-5-20251001", max_tokens: 600, system: SYSTEM(regions, new Date().toISOString().slice(0, 10)),
    tools: [TOOL], tool_choice: { type: "tool", name: "plan" }, messages: msgs });
  const use = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  return { plan: use ? cleanPlan(use.input) : null, input: res.usage.input_tokens, output: res.usage.output_tokens };
}
