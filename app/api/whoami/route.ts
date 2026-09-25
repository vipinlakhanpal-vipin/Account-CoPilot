import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";
import { emailAllowed } from "@/lib/auth";

// Diagnostic: what the server sees for this browser session. No secrets are returned.
export async function GET() {
  const store = await cookies();
  const sb = await supabaseServer();
  const { data, error } = await sb.auth.getUser();
  const email = data.user?.email ?? null;
  const allowed = (process.env.ALLOWED_EMAIL_DOMAINS || "").split(/[,;\s]+/)
    .map((d) => d.trim().toLowerCase().replace(/^["'@]+|["']+$/g, "").replace(/^.*@/, "")).filter(Boolean);
  return NextResponse.json({
    signedIn: !!data.user, email, domainAllowed: emailAllowed(email), allowedDomains: allowed,
    authCookieSeen: store.getAll().some((c) => c.name.startsWith("sb-")), authError: error?.message ?? null,
    configured: { supabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL, publishableKey: !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
  });
}
