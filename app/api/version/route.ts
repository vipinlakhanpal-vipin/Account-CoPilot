import { NextResponse } from "next/server";
import { APP_VERSION, RELEASES, RELEASE_AUTHOR } from "@/lib/version";

export const dynamic = "force-dynamic";

const newer = (a: string, b: string) => { const [a1, a2] = a.split(".").map(Number), [b1, b2] = b.split(".").map(Number); return a1 > b1 || (a1 === b1 && a2 > b2); };

// Returns the version of the deployment currently serving requests, plus the releases newer than ?since= (for the update banner).
export function GET(req: Request) {
  const since = new URL(req.url).searchParams.get("since") || "";
  const releases = /^\d+\.\d+$/.test(since) ? RELEASES.filter((r) => newer(r.version, since)).slice(0, 10) : [];
  return NextResponse.json({ version: APP_VERSION, commit: (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7), releases, author: RELEASE_AUTHOR },
    { headers: { "Cache-Control": "no-store" } });
}
