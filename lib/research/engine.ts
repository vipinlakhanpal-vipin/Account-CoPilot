import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { ResearchResult, type ResearchResultT } from "./schema";
import { RESEARCHER_SYSTEM, EXTRACTOR_SYSTEM, researcherPrompt } from "./prompts";

const MODEL = "claude-opus-5";

export type Depth = "quick" | "standard" | "deep";
const DEPTH: Record<Depth, { searches: number; fetches: number; effort: "medium" | "high" }> = {
  quick: { searches: 5, fetches: 3, effort: "medium" },
  standard: { searches: 10, fetches: 6, effort: "high" },
  deep: { searches: 20, fetches: 12, effort: "high" },
};

const client = new Anthropic();

/** Usage meter: every paid call adds its tokens and searches so each run records its real cost. Opus 5 prices: $5 / $25 per M tokens, $0.01 per search. */
export type Meter = { input: number; output: number; searches: number };
export const newMeter = (): Meter => ({ input: 0, output: 0, searches: 0 });
export const meterCost = (m: Meter) => +(m.input * 5e-6 + m.output * 25e-6 + m.searches * 0.01).toFixed(3);
type Usage = { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null; server_tool_use?: { web_search_requests?: number } | null };
const track = (m: Meter | undefined, u?: Usage | null) => { if (!m || !u) return;
  m.input += (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0); m.output += u.output_tokens || 0; m.searches += u.server_tool_use?.web_search_requests || 0; };

/** RESEARCHER: web search + fetch, returns cited research notes. */
export async function researchNotes(opts: { company: string; country: string; roles: string[]; depth: Depth; existing?: string }, meter?: Meter) {
  const d = DEPTH[opts.depth];
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: "user", content: researcherPrompt(opts.company, opts.country, opts.roles, opts.existing) },
  ];
  let text = "";
  for (let turn = 0; turn < 6; turn++) {
    // Server-side refusal fallback (fallbacks: "default") routes a declined request to Anthropic's recommended model.
    const params = {
      model: MODEL,
      max_tokens: 32000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: d.effort },
      system: RESEARCHER_SYSTEM,
      tools: [
        { type: "web_search_20260209", name: "web_search", max_uses: d.searches },
        { type: "web_fetch_20260209", name: "web_fetch", max_uses: d.fetches },
      ],
      messages,
    } as unknown as Anthropic.Beta.MessageCreateParamsStreaming;
    const msg = await client.beta.messages.stream(params).finalMessage();
    track(meter, msg.usage as Usage);
    for (const b of msg.content) if (b.type === "text") text += b.text;
    if (msg.stop_reason === "refusal") throw new Error("The research request was declined by the model's safety system.");
    if (msg.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: msg.content as Anthropic.Beta.BetaContentBlockParam[] });
      continue;
    }
    break;
  }
  if (!text.trim()) throw new Error("Research returned no notes.");
  return text;
}

/** EXTRACTOR + VERIFIER: turns notes into the structured record. */
export async function extract(notes: string, company: string, meter?: Meter): Promise<ResearchResultT> {
  const res = await client.messages.parse({
    model: MODEL,
    max_tokens: 32000,
    thinking: { type: "adaptive" },
    system: EXTRACTOR_SYSTEM,
    messages: [{ role: "user", content: `Company: ${company}\n\nRESEARCH NOTES:\n${notes}` }],
    output_config: { effort: "medium", format: zodOutputFormat(ResearchResult) },
  });
  track(meter, res.usage as Usage);
  if (res.stop_reason === "refusal") throw new Error("Extraction was declined by the model's safety system.");
  if (!res.parsed_output) throw new Error(`Extraction did not return valid data (stop reason: ${res.stop_reason}).`);
  return res.parsed_output;
}

/** Pitch planner for the account brief. */
export async function pitchPlan(facts: unknown) {
  const params = {
    model: MODEL,
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium" },
    system: `You are a pre-sales strategist for a Coupa and SAP Ariba implementation, integration and managed-services partner in the Middle East.
Use ONLY the facts given. Where something is unknown, say it must be validated. Write a concise pitch plan (under 350 words, plain text) with these headings:
1. Situation (2-3 bullets citing the evidence)
2. What to pitch, ranked (managed services, optimisation, integration, implementation, evaluation support) and why
3. Who to approach first, and the angle for each named contact
4. Five discovery questions for the first call
5. Risks and what to validate`,
    messages: [{ role: "user", content: `FACTS: ${JSON.stringify(facts)}` }],
  } as unknown as Anthropic.Beta.MessageCreateParamsNonStreaming;
  const msg = await client.beta.messages.create(params);
  if (msg.stop_reason === "refusal") return "The pitch plan request was declined. Try again with fewer details.";
  return msg.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
}

/** DISCOVERY: find new companies in a country that match the ICP (user-triggered from the left panel; paid). */
const Discovered = z.object({ companies: z.array(z.object({
  name: z.string(), website: z.string(), industry: z.string(), hq_city: z.string(), ownership: z.string(),
  revenue_estimate_usd_m: z.number().nullable(), revenue_basis: z.string(), employees: z.string(), why_icp: z.string(), source_url: z.string(),
})) });
export type DiscoveredT = z.infer<typeof Discovered>;
export async function discoverCompanies(opts: { country: string; criteria: string; exclude: string[]; limit: number }, meter?: Meter): Promise<DiscoveredT> {
  const system = `You find new B2B target accounts for a Coupa / SAP Ariba partner. Use web search. Return ONLY real companies headquartered in ${opts.country}
that are the decision-making entity (group or company HQ). Exclude: ministries, police, military and other government bodies; single hotels, hospitals,
schools or attractions; local branches of foreign-headquartered groups; companies already listed below. ICP: net revenue >= USD 250M and >= 100 employees
(listing not required). Prefer companies with an official revenue figure (annual report, results, filing, reputable press quoting the company); otherwise give
the best estimate and say it is an estimate. Never invent a company, figure or URL. Cite a source URL for each company.`;
  const prompt = `Find up to ${opts.limit} NEW companies in ${opts.country} matching these criteria:\n${opts.criteria}\n\nAlready in the app (do not return): ${opts.exclude.slice(0, 600).join("; ")}`;
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: prompt }];
  let notes = "";
  for (let turn = 0; turn < 4; turn++) {
    const msg = await client.beta.messages.stream({
      model: MODEL, max_tokens: 16000, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default", thinking: { type: "adaptive" },
      output_config: { effort: "medium" }, system,
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 8 }, { type: "web_fetch_20260209", name: "web_fetch", max_uses: 4 }], messages,
    } as unknown as Anthropic.Beta.MessageCreateParamsStreaming).finalMessage();
    track(meter, msg.usage as Usage);
    for (const b of msg.content) if (b.type === "text") notes += b.text;
    if (msg.stop_reason === "refusal") throw new Error("The discovery request was declined by the model's safety system.");
    if (msg.stop_reason === "pause_turn") { messages.push({ role: "assistant", content: msg.content as Anthropic.Beta.BetaContentBlockParam[] }); continue; }
    break;
  }
  const res = await client.messages.parse({
    model: MODEL, max_tokens: 8000, system: "Convert the discovery notes into the list. Use only companies and facts the notes support; unknown → empty string or null.",
    messages: [{ role: "user", content: `NOTES:\n${notes}` }], output_config: { effort: "low", format: zodOutputFormat(Discovered) },
  });
  track(meter, res.usage as Usage);
  return res.parsed_output || { companies: [] };
}
