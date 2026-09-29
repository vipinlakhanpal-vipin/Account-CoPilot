import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getAccess } from "@/lib/access";
import { requirePin } from "@/lib/paidGuard";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Contact tiers (Setup → Settings → Contact tiers): Super Admin only, and — since this now drives live research
// classification (lib/research/prompts.ts) — the paid-actions PIN is required to save a change, if one is set.
export const dynamic = "force-dynamic";

const Tier = z.object({ tier: z.string().max(20), label: z.string().max(120), examples: z.string().max(500) });
const Body = z.object({ tiers: z.array(Tier).max(10), pin: z.string().optional() });

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!(await getAccess(user)).isSuper) return NextResponse.json({ error: "Only a Super Admin can change Contact tiers." }, { status: 403 });
  const raw = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Invalid tiers." }, { status: 400 });
  const blocked = await requirePin(req, user, { pin: parsed.data.pin });
  if (blocked) return blocked;
  const db = supabaseAdmin();
  const { error } = await db.from("settings").upsert({ key: "contact_tiers", value: parsed.data.tiers, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
