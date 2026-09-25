import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { pitchPlan } from "@/lib/research/engine";

export const maxDuration = 120;

export async function POST(req: Request) {
  if (!(await requireUser())) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const facts = await req.json().catch(() => null);
  if (!facts) return NextResponse.json({ error: "No account facts sent." }, { status: 400 });
  try {
    return NextResponse.json({ text: await pitchPlan(facts) });
  } catch {
    return NextResponse.json({ error: "Could not draft the pitch plan. Try again." }, { status: 502 });
  }
}
