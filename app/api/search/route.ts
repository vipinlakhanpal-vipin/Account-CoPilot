import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getAccess, scopeData } from "@/lib/access";
import { loadAllCached } from "@/lib/dataCache";
import { companyPasses, withDefaults, revenueOf, DEFAULT_CRITERIA } from "@/lib/icp";
import { parseGlobalQuery } from "@/lib/globalSearch";
import { regionOf } from "@/lib/icpDefinition.mjs";

const fmtM = (n: number | null) => n === null ? "" : n >= 1000 ? `$${(n / 1000).toFixed(2).replace(/\.?0+$/, "")}B` : `$${Math.round(n)}M`;

// Header's global search: a quick, read-only preview of what the query would match — same parsing and same hard
// filters (companyPasses) the Discovery panel uses, so the dropdown here and the Accounts tab always agree.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const q = new URL(req.url).searchParams.get("q") || "";
  if (!q.trim()) return NextResponse.json({ total: 0, items: [] });

  const access = await getAccess(user);
  const data = scopeData(await loadAllCached(), access);
  const parsed = parseGlobalQuery(q);
  const criteria = withDefaults({ company: { ...DEFAULT_CRITERIA.company, name: parsed.name, revenue: parsed.revenue, employees: parsed.employees,
    icpStatus: parsed.icpStatus, listing: parsed.listing, signal: parsed.signal } });
  const matches = data.accounts.filter((a) => companyPasses(a, criteria));
  const items = matches.slice(0, 8).map((a) => ({ slug: a.slug, company_name: a.company_name, country: a.country, region: regionOf(a.country),
    icp_status: a.icp_status || "Unknown", revenue: fmtM(revenueOf(a)), listing_status: a.listing_status || "" }));
  return NextResponse.json({ total: matches.length, items });
}
