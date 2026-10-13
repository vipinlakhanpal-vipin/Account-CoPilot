import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { requirePaidApproval } from "@/lib/paidGuard";
import { getAccess, scopeData, ALL_REGIONS } from "@/lib/access";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadAllCached } from "@/lib/dataCache";
import { makeContext } from "@/lib/aria/tools";
import { runAria } from "@/lib/aria/agent";

// Aria, the in-app assistant. Paid (Anthropic API): behind the paid-actions PIN like every other paid action.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const Body = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(3000) })).min(1).max(20),
});

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const blocked = await requirePaidApproval(req, user); if (blocked) return blocked;
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
    const out = await runAria(parsed.data.messages, makeContext(data, def, crit, log), regions);
    return NextResponse.json({ text: out.text, actions: out.actions, choices: out.choices });
  } catch {
    return NextResponse.json({ error: "Aria could not answer that just now. Try again." }, { status: 502 });
  }
}
