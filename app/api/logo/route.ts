import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { fetchLogo, logoDomain } from "@/lib/logo";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Company logo for the app's tables: /api/logo?d=example.com → the company's icon/logo (browser caches 7 days), 404 when there is none.
// Only domains of companies in the app are looked up (the server never fetches arbitrary addresses).
let known: { at: number; set: Set<string> } | null = null;
async function knownDomains() {
  if (!known || Date.now() - known.at > 5 * 60_000) {
    const { data } = await supabaseAdmin().from("companies").select("domain,company_website");
    known = { at: Date.now(), set: new Set((data || []).map((c) => logoDomain(c)).filter(Boolean)) };
  }
  return known.set;
}

export async function GET(req: Request) {
  if (!(await requireUser())) return new NextResponse(null, { status: 401 });
  const d = (new URL(req.url).searchParams.get("d") || "").toLowerCase();
  if (!(await knownDomains()).has(d)) return new NextResponse(null, { status: 404 });
  const logo = await fetchLogo(d);
  if (!logo) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "private, max-age=3600" } });
  return new NextResponse(new Uint8Array(logo.buf), { headers: { "Content-Type": logo.type, "Cache-Control": "private, max-age=604800", "X-Content-Type-Options": "nosniff",
    ...(logo.ext === "svg" ? { "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox" } : {}) } });
}
