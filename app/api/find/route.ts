import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getAccess, scopeData } from "@/lib/access";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadAllCached } from "@/lib/dataCache";
import { findCompanies, existingMatches } from "@/lib/findSearch";

// Find company page. Search Company: ranked search over what is already in the app (scoped to the user's regions).
// ?exists=A||B||C: which of these names are already in the app, so Find New Company never researches one twice.
export const dynamic = "force-dynamic";

const list = (v: string | null) => (v ? v.split("||").map((x) => x.trim()).filter(Boolean) : []);

export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const access = await getAccess(user);
  const data = scopeData(await loadAllCached(), access);
  const exists = list(sp.get("exists"));
  if (exists.length) return NextResponse.json({ results: existingMatches(data, exists.slice(0, 30)) });
  const def = (await supabaseAdmin().from("settings").select("value").eq("key", "icp_definition").maybeSingle()).data?.value;
  const sort = sp.get("sort");
  const out = findCompanies(data, def, {
    q: (sp.get("q") || "").slice(0, 200), region: list(sp.get("region")), status: list(sp.get("status")), listing: list(sp.get("listing")),
    signal: list(sp.get("signal")), platform: list(sp.get("platform")), contacts: sp.get("contacts") === "1",
    sort: sort === "revenue" || sort === "name" ? sort : "best", limit: Number(sp.get("limit")) || 25,
  });
  return NextResponse.json(out);
}
