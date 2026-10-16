import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { requirePaidApproval } from "@/lib/paidGuard";
import { pitchPlan } from "@/lib/research/engine";
import { getAccess, canSeeCountry } from "@/lib/access";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const maxDuration = 120;

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const blocked = await requirePaidApproval(req, user); if (blocked) return blocked; // paid-actions PIN
  const facts = await req.json().catch(() => null);
  if (!facts) return NextResponse.json({ error: "No account facts sent." }, { status: 400 });
  try {
    return NextResponse.json({ text: await pitchPlan(facts) });
  } catch {
    return NextResponse.json({ error: "Could not draft the pitch plan. Try again." }, { status: 502 });
  }
}

// The pitch plan a free scheduled session saved for an account (profile["Pitch plan"]), scoped to the person's regions.
export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const slug = new URL(req.url).searchParams.get("slug") || "";
  const { data } = await supabaseAdmin().from("companies").select("country,profile").eq("slug", slug).maybeSingle();
  if (!data || !canSeeCountry(await getAccess(user), data.country)) return NextResponse.json({ plan: null });
  const p = (data.profile as Record<string, { text?: string; at?: string; via?: string }> | null)?.["Pitch plan"];
  return NextResponse.json({ plan: p?.text ? { text: p.text, at: p.at, via: p.via } : null });
}
