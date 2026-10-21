import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getAccess, canSeeCountry } from "@/lib/access";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { invalidateAllData } from "@/lib/dataCache";
import { canonCountry, regionOf } from "@/lib/icpDefinition.mjs";
import { REVIEW_KEY, type RegionReview } from "@/lib/regionReview";

// Region review (v6.56): move an account to another region (any country, even one that is not a region yet: it then shows under
// "Other regions"), or keep a flagged account where it is. Anyone who can see the account's current region may decide.
// Nothing else about the account changes; the decision and who made it stay in profile["Region review"].
export const dynamic = "force-dynamic";
const Body = z.object({ id: z.string().min(1), action: z.enum(["move", "keep"]), to: z.string().trim().max(80).optional() });

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const access = await getAccess(user);
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const db = supabaseAdmin();
  const { data: c } = await db.from("companies").select("id,company_name,country,profile,account_notes").eq("id", p.data.id).maybeSingle();
  if (!c) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  if (!canSeeCountry(access, c.country)) return NextResponse.json({ error: "This account is outside your regions." }, { status: 403 });

  const now = new Date().toISOString(), who = user.email || "a user", day = now.slice(0, 10);
  const profile = { ...(c.profile || {}) } as Record<string, unknown>;
  const prev = (profile[REVIEW_KEY] || null) as RegionReview | null;
  let country = c.country as string, note: string;
  if (p.data.action === "move") {
    const to = canonCountry(p.data.to || "");
    if (!to) return NextResponse.json({ error: "Choose the region to move it to." }, { status: 400 });
    if (to.toLowerCase() === String(c.country).toLowerCase()) return NextResponse.json({ error: "It is already filed there." }, { status: 400 });
    country = to;
    profile[REVIEW_KEY] = { status: "moved", hq_country: prev?.hq_country || to, reason: prev?.reason || "Moved by hand.", flagged_at: prev?.flagged_at || now, owner: prev?.owner, from: c.country, to, decided_by: who, decided_at: now } satisfies RegionReview;
    note = `Moved from ${c.country} to ${to} by ${who} on ${day}.`;
  } else {
    if (!prev) return NextResponse.json({ error: "Nothing to keep: this account is not flagged." }, { status: 400 });
    profile[REVIEW_KEY] = { ...prev, status: "kept", decided_by: who, decided_at: now } satisfies RegionReview;
    note = `Region review: kept in ${c.country} by ${who} on ${day}.`;
  }
  const { error } = await db.from("companies").update({ country, profile, account_notes: [c.account_notes, note].filter(Boolean).join(" "), updated_at: now }).eq("id", c.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  invalidateAllData();
  return NextResponse.json({ ok: true, country, region: regionOf(country) });
}
