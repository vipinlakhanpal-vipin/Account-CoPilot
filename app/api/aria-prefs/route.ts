import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAccess } from "@/lib/access";

export const dynamic = "force-dynamic";

// Aria's quiet-mode default for everyone. Anyone signed in reads it (Aria needs it to know how lively to be); only the Super Admin changes it.
// A person's own choice (the Quiet mode switch under Aria) is kept in their browser and wins over this default.
const KEY = "aria_prefs";
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { data } = await supabaseAdmin().from("settings").select("value").eq("key", KEY).maybeSingle();
  const access = await getAccess(user);
  const meta = (user.user_metadata || {}) as Record<string, unknown>, full = String(meta.full_name || meta.name || "").trim();
  const name = (full.split(/\s+/)[0] || String(user.email || "").split("@")[0] || "").replace(/^./, (c) => c.toUpperCase());
  return NextResponse.json({ quietDefault: !!(data?.value as { quietDefault?: boolean } | null)?.quietDefault, canSet: access.isOwner, name });
}
export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!(await getAccess(user)).isOwner) return NextResponse.json({ error: "Only the Super Admin can change Aria's default." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const { error } = await supabaseAdmin().from("settings").upsert({ key: KEY, value: { quietDefault: !!b.quietDefault, by: user.email, at: new Date().toISOString() }, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, quietDefault: !!b.quietDefault });
}
