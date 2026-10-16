import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { requirePaidApproval } from "@/lib/paidGuard";
import { getAccess, scopeData, ALL_REGIONS } from "@/lib/access";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadAllCached } from "@/lib/dataCache";
import { makeContext } from "@/lib/aria/tools";
import { runAria } from "@/lib/aria/agent";
import { tryFree, conversation } from "@/lib/aria/router";

// Aria, the in-app assistant. Paid (Anthropic API): behind the paid-actions PIN like every other paid action.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const Body = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(3000) })).min(1).max(20),
  flow: z.boolean().optional(), // the message answers one of Aria's own buttons
});

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || parsed.data.messages[parsed.data.messages.length - 1].role !== "user") return NextResponse.json({ error: "Ask Aria a question." }, { status: 400 });
  try {
    const access = await getAccess(user);
    const db = supabaseAdmin();
    const [data, def, crit, log] = await Promise.all([
      loadAllCached().then((d) => scopeData(d, access)),
      db.from("settings").select("value").eq("key", "icp_definition").maybeSingle().then((r) => r.data?.value),
      db.from("settings").select("value").eq("key", "icp_criteria").maybeSingle().then((r) => r.data?.value),
      access.isSuper ? db.from("settings").select("value").eq("key", "engine_log").maybeSingle().then((r) => (r.data?.value as { entries?: Record<string, unknown>[] } | undefined)?.entries || []) : Promise.resolve([]),
    ]);
    const regions = access.isSuper ? ALL_REGIONS : access.regions;
    const ctx = makeContext(data, def, crit, log);
    const msgs = parsed.data.messages;
    let typed = msgs[msgs.length - 1].content;
    // Buttons from the understanding guard: §ai: = hand it to the AI (paid), §plain: = run the reduced question
    const forceAi = typed.startsWith("§ai:");
    typed = typed.replace(/^§(ai|plain):\s*/, "");
    // The chat is one topic until the person completes it: refinements build on the earlier questions, a new topic is confirmed first.
    const conv = conversation(typed, msgs.slice(0, -1).filter((m) => m.role === "user").map((m) => m.content), !!parsed.data.flow);
    if (conv.ask) return NextResponse.json({ ...conv.ask, mode: "free", note: "Free answer · no API cost" });
    const question = conv.question;
    // 1) Free first: plain rules answer the common questions straight from the database, with no AI and no API cost, so no PIN either.
    const free = forceAi ? null : await tryFree(question, ctx);
    if (free) return NextResponse.json({ ...free, mode: "free", note: "Free answer · read from your data, no API cost" });
    // 2) Only what the rules cannot read goes to the AI (the cheaper model), behind the paid-actions PIN.
    const blocked = await requirePaidApproval(req, user); if (blocked) return blocked;
    const out = await runAria([...msgs.slice(0, -1), { role: "user" as const, content: question }], ctx, regions);
    return NextResponse.json({ text: out.text, actions: out.actions, choices: out.choices, mode: "ai", note: "AI answer · this question used Anthropic API credit" });
  } catch {
    return NextResponse.json({ error: "Aria could not answer that just now. Try again." }, { status: 502 });
  }
}
