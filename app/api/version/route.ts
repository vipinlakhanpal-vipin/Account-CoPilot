import { NextResponse } from "next/server";
import { APP_VERSION } from "@/lib/version";

export const dynamic = "force-dynamic";

// Returns the version of the deployment currently serving requests.
export function GET() {
  return NextResponse.json({ version: APP_VERSION, commit: (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7) },
    { headers: { "Cache-Control": "no-store" } });
}
