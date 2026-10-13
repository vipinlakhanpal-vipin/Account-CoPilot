import Anthropic from "@anthropic-ai/sdk";
import type { AriaAction, AriaMessage, AriaResult, ToolDef, ToolOutput } from "./types";

// Aria's reasoning loop, independent of any app: you give it instructions and tools, it asks Claude, runs the tools Claude picks, and
// returns the final words, any file actions your tools prepared, and tap-able choices when Claude needs to ask the user something.
export const ASK_USER_TOOL: ToolDef = {
  name: "ask_user",
  description: "Ask the user a short clarifying question with 2-6 tap-able options. Use it BEFORE building a file, and whenever a request is ambiguous. Ends your turn.",
  input_schema: { type: "object", required: ["question", "options"], properties: { question: { type: "string" }, options: { type: "array", items: { type: "string" } } } },
};

export type RunOptions = {
  history: AriaMessage[];
  system: string;
  tools: ToolDef[];
  /** Runs one tool. Return {result} for Claude to read, and {action} to give the user a button (for example a file download). */
  run: (name: string, input: Record<string, unknown>) => Promise<ToolOutput>;
  model?: string;       // default claude-sonnet-5
  maxSteps?: number;    // default 7 tool rounds
  maxTokens?: number;   // default 1800
  maxResultChars?: number; // default 14000 per tool result
};

export async function runAgent(o: RunOptions): Promise<AriaResult> {
  const client = new Anthropic();
  const tools = (o.tools.some((t) => t.name === ASK_USER_TOOL.name) ? o.tools : [...o.tools, ASK_USER_TOOL]) as unknown as Anthropic.Tool[];
  const msgs: Anthropic.MessageParam[] = o.history.map((m) => ({ role: m.role, content: m.content }));
  const actions: AriaAction[] = [];
  const usage = { input: 0, output: 0 };
  for (let step = 0; step < (o.maxSteps ?? 7); step++) {
    const res = await client.messages.create({ model: o.model ?? "claude-sonnet-5", max_tokens: o.maxTokens ?? 1800, system: o.system, tools, messages: msgs });
    usage.input += res.usage.input_tokens; usage.output += res.usage.output_tokens;
    const words = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
    if (res.stop_reason !== "tool_use") return { text: words || "I could not put an answer together. Could you rephrase that?", actions, choices: [], usage };
    const ask = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === ASK_USER_TOOL.name);
    if (ask) {
      const a = (ask.input || {}) as { question?: string; options?: string[] };
      return { text: [words, String(a.question || "Which one do you mean?")].filter(Boolean).join("\n\n"), actions, choices: (a.options || []).map(String).slice(0, 8), usage };
    }
    msgs.push({ role: "assistant", content: res.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const b of res.content) {
      if (b.type !== "tool_use") continue;
      let out: ToolOutput;
      try { out = await o.run(b.name, (b.input || {}) as Record<string, unknown>); } catch { out = { result: { error: "That lookup failed." } }; }
      if (out.action) actions.push(out.action);
      results.push({ type: "tool_result", tool_use_id: b.id, content: JSON.stringify(out.result).slice(0, o.maxResultChars ?? 14000) });
    }
    msgs.push({ role: "user", content: results });
  }
  return { text: "That needs more steps than I allow in one go. Could you narrow it down?", actions, choices: [], usage };
}
