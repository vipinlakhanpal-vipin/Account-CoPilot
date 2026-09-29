import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Setup Wizard's "Data sources" step: informational only (no live integration for most of these yet), but persisted so
// re-opening the wizard doesn't lose what you'd already told it. One record per account, not region-specific.
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const db = supabaseAdmin();
  const { data } = await db.from("settings").select("value").eq("key", "wizard_sources").maybeSingle();
  return NextResponse.json(data?.value || {});
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const db = supabaseAdmin();
  const { error } = await db.from("settings").upsert({ key: "wizard_sources", value: body, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
