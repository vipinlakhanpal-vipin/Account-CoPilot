import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { fetchLogo } from "@/lib/logo";

// Company logo for the app's tables: /api/logo?d=example.com → the site's icon (cached by the browser for 7 days), 404 when there is none.
export async function GET(req: Request) {
  if (!(await requireUser())) return new NextResponse(null, { status: 401 });
  const d = (new URL(req.url).searchParams.get("d") || "").toLowerCase();
  const logo = await fetchLogo(d);
  if (!logo) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "private, max-age=86400" } });
  return new NextResponse(new Uint8Array(logo.buf), { headers: { "Content-Type": `image/${logo.ext}`, "Cache-Control": "private, max-age=604800" } });
}
