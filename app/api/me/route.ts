import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// The signed-in user's profile. On first call, records where they joined from (Vercel geo headers).
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  let meta = user.user_metadata || {};
  if (!meta.joined_from) {
    const h = await headers();
    const dec = (v: string | null) => (v ? decodeURIComponent(v) : "");
    const where = [dec(h.get("x-vercel-ip-city")), dec(h.get("x-vercel-ip-country-region")), dec(h.get("x-vercel-ip-country"))].filter(Boolean).join(", ");
    if (where) {
      meta = { ...meta, joined_from: where };
      await supabaseAdmin().auth.admin.updateUserById(user.id, { user_metadata: meta });
    }
  }
  return NextResponse.json({
    email: user.email, name: meta.full_name || "", joined_from: meta.joined_from || "Not recorded",
    joined_at: user.created_at, last_sign_in: user.last_sign_in_at, invited_by: meta.invited_by || "",
  });
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { name } = await req.json().catch(() => ({}));
  if (typeof name !== "string" || name.length > 120) return NextResponse.json({ error: "Enter a name up to 120 characters." }, { status: 400 });
  await supabaseAdmin().auth.admin.updateUserById(user.id, { user_metadata: { ...(user.user_metadata || {}), full_name: name.trim() } });
  return NextResponse.json({ ok: true });
}
