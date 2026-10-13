// Aria: shared types. Nothing in this folder depends on a particular app.
export type AriaAction = { kind: string; label: string; body: Record<string, unknown> };
export type AriaMessage = { role: "user" | "assistant"; content: string };
/** A tap-able answer: a short label to show, and the full text to send. A plain string is both. */
export type AriaChoice = string | { label: string; value: string };
export type AriaResult = { text: string; actions: AriaAction[]; choices: AriaChoice[]; usage: { input: number; output: number } };
export type ToolDef = { name: string; description: string; input_schema: Record<string, unknown> };
export type ToolOutput = { result: unknown; action?: AriaAction };
