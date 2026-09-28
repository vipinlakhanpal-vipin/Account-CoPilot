import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { requirePaidApproval } from "@/lib/paidGuard";
import { pitchPlan } from "@/lib/research/engine";

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
