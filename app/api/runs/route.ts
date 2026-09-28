import { requireUser } from "@/lib/auth";
import { getAccess, canSeeCountry } from "@/lib/access";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const access = await getAccess(user);
  const sb = await supabaseServer();
  const { data, error } = await sb.from("research_runs").select("*").order("started_at", { ascending: false }).limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ runs: (data || []).filter((r) => canSeeCountry(access, r.country)) });
}
