import { requireUser } from "@/lib/auth";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET() {
  if (!(await requireUser())) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const sb = await supabaseServer();
  const { data, error } = await sb.from("research_runs").select("*").order("started_at", { ascending: false }).limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ runs: data });
}
