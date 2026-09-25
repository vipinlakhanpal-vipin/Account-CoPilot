import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
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

/** RESEARCHER: web search + fetch, returns cited research notes. */
export async function researchNotes(opts: { company: string; country: string; roles: string[]; depth: Depth; existing?: string }) {
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
export async function extract(notes: string, company: string): Promise<ResearchResultT> {
  const res = await client.messages.parse({
    model: MODEL,
    max_tokens: 32000,
    thinking: { type: "adaptive" },
    system: EXTRACTOR_SYSTEM,
    messages: [{ role: "user", content: `Company: ${company}\n\nRESEARCH NOTES:\n${notes}` }],
    output_config: { effort: "medium", format: zodOutputFormat(ResearchResult) },
  });
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
