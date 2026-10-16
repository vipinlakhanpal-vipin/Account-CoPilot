import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getAccess } from "@/lib/access";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ACTIVITY_KINDS, pageLabel } from "@/lib/activity";

// POST: any signed-in user records an action or a heartbeat. GET (Super Admin only): ?view=active = who is online now; otherwise the activity feed and a per-person summary.
export const dynamic = "force-dynamic";
const ONLINE_SECONDS = 120;

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { kind?: string; detail?: string; path?: string };
  if (!b.kind || !(ACTIVITY_KINDS as readonly string[]).includes(b.kind)) return NextResponse.json({ error: "Invalid kind." }, { status: 400 });
  const db = supabaseAdmin(), path = String(b.path || "").slice(0, 200), email = user.email || "";
  await db.from("user_presence").upsert({ user_id: user.id, email, path, last_seen: new Date().toISOString() });
  if (b.kind !== "ping") await db.from("activity_log").insert({ user_id: user.id, email, kind: b.kind, detail: String(b.detail || "").slice(0, 200), path });
  return NextResponse.json({ ok: true });
}

export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!(await getAccess(user)).isSuper) return NextResponse.json({ error: "Only a Super Admin can see activity." }, { status: 403 });
  const db = supabaseAdmin(), sp = new URL(req.url).searchParams;
  const { data: au } = await db.auth.admin.listUsers({ perPage: 200 });
  const people = new Map((au?.users || []).map((u) => [u.id, { email: u.email || "", name: String((u.user_metadata as Record<string, unknown> | null)?.name || (u.user_metadata as Record<string, unknown> | null)?.full_name || ""), last_sign_in: u.last_sign_in_at || null }]));
  if (sp.get("view") === "active") {
    const since = new Date(Date.now() - ONLINE_SECONDS * 1000).toISOString();
    const { data, error } = await db.from("user_presence").select("user_id,email,path,last_seen").gte("last_seen", since).order("last_seen", { ascending: false });
    if (error) return NextResponse.json({ ready: false, active: [] });
    return NextResponse.json({ ready: true, active: (data || []).map((r) => ({ email: r.email, name: people.get(r.user_id)?.name || "", page: pageLabel(r.path || ""), seconds: Math.round((Date.now() - new Date(r.last_seen).getTime()) / 1000) })) });
  }
  const days = Math.min(Math.max(Number(sp.get("days")) || 7, 1), 90), who = sp.get("user") || "";
  const since = new Date(Date.now() - days * 864e5).toISOString();
  let q = db.from("activity_log").select("id,user_id,email,kind,detail,path,created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(1000);
  if (who) q = q.eq("email", who);
  const { data, error } = await q;
  if (error) return NextResponse.json({ ready: false, feed: [], summary: [] });
  const { data: pres } = await db.from("user_presence").select("user_id,email,path,last_seen");
  const rows = data || [];
  const emails = new Set<string>([...rows.map((r) => r.email), ...(pres || []).map((p) => p.email), ...[...people.values()].map((p) => p.email)].filter(Boolean));
  const summary = [...emails].map((email) => {
    const mine = rows.filter((r) => r.email === email), pr = (pres || []).find((p) => p.email === email), p = [...people.values()].find((x) => x.email === email);
    const pages = new Map<string, number>(); mine.filter((r) => r.kind === "page").forEach((r) => pages.set(pageLabel(r.path), (pages.get(pageLabel(r.path)) || 0) + 1));
    return { email, name: p?.name || "", last_sign_in: p?.last_sign_in || null, last_seen: pr?.last_seen || null, visits: mine.filter((r) => r.kind === "visit").length, actions: mine.filter((r) => !["visit", "page"].includes(r.kind)).length,
      top_pages: [...pages.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k} (${n})`) };
  }).sort((a, b) => String(b.last_seen || b.last_sign_in || "").localeCompare(String(a.last_seen || a.last_sign_in || "")));
  return NextResponse.json({ ready: true, days, summary, feed: rows.slice(0, 300).map((r) => ({ id: r.id, at: r.created_at, email: r.email, kind: r.kind, detail: r.detail, page: pageLabel(r.path || "") })) });
}
