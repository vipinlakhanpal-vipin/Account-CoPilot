import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getAccess } from "@/lib/access";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ACTIVITY_KINDS, USAGE_AREAS, areaOf, pageLabel, isPlayPath } from "@/lib/activity";

// POST: any signed-in user records an action or a heartbeat. GET (Super Admin only): ?view=active = who is online now; otherwise the activity feed and a per-person summary.
export const dynamic = "force-dynamic";
const ONLINE_SECONDS = 300; // 5 minutes: a short switch to another tab or app does not drop someone from "online now"

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { kind?: string; detail?: string; path?: string };
  if (!b.kind || !(ACTIVITY_KINDS as readonly string[]).includes(b.kind)) return NextResponse.json({ error: "Invalid kind." }, { status: 400 });
  const db = supabaseAdmin(), path = String(b.path || "").slice(0, 200), email = user.email || "";
  const now = new Date().toISOString();
  await db.from("user_presence").upsert({ user_id: user.id, email, path, last_seen: now });
  // Time on a page: every heartbeat or action moves last_seen on the person's current page row, unless they were idle for over 2 minutes (then the gap is not counted).
  const { data: cur } = await db.from("activity_log").select("id,created_at,last_seen").eq("user_id", user.id).eq("kind", "page").order("created_at", { ascending: false }).limit(1);
  const row = cur?.[0];
  if (row && Date.now() - new Date(row.last_seen || row.created_at).getTime() < 120000) await db.from("activity_log").update({ last_seen: now }).eq("id", row.id);
  if (b.kind !== "ping") await db.from("activity_log").insert({ user_id: user.id, email, kind: b.kind, detail: String(b.detail || "").slice(0, 200), path, last_seen: b.kind === "page" ? now : null });
  return NextResponse.json({ ok: true });
}

export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const acc = await getAccess(user);
  if (!acc.isSuper) return NextResponse.json({ error: "Only a Super Admin can see activity." }, { status: 403 });
  const db = supabaseAdmin(), sp = new URL(req.url).searchParams;
  // The activity log and usage figures belong to the Team tab, which only the Super Admin opens; Admins keep just the Online now chip.
  if (sp.get("view") !== "active" && !acc.isOwner) return NextResponse.json({ error: "Only the Super Admin can see the activity log." }, { status: 403 });
  const { data: au } = await db.auth.admin.listUsers({ perPage: 200 });
  const people = new Map((au?.users || []).map((u) => [u.id, { email: u.email || "", name: String((u.user_metadata as Record<string, unknown> | null)?.name || (u.user_metadata as Record<string, unknown> | null)?.full_name || ""), last_sign_in: u.last_sign_in_at || null }]));
  if (sp.get("view") === "active") {
    const since = new Date(Date.now() - ONLINE_SECONDS * 1000).toISOString();
    const { data, error } = await db.from("user_presence").select("user_id,email,path,last_seen").gte("last_seen", since).order("last_seen", { ascending: false });
    if (error) return NextResponse.json({ ready: false, active: [] });
    return NextResponse.json({ ready: true, active: (data || []).map((r) => ({ email: r.email, name: people.get(r.user_id)?.name || "", page: pageLabel(r.path || ""), seconds: Math.round((Date.now() - new Date(r.last_seen).getTime()) / 1000) })) });
  }
  if (sp.get("view") === "usage") {
    // % used: of the places and features a person can use, how many they opened in the last 30 days.
    const since = new Date(Date.now() - 30 * 864e5).toISOString();
    const { data: rows, error } = await db.from("activity_log").select("email,kind,path").gte("created_at", since).limit(20000);
    if (error) return NextResponse.json({ ready: false, usage: {} });
    const { data: acc } = await db.from("user_access").select("email,role");
    const out: Record<string, { pct: number; used: string[]; missing: string[]; total: number }> = {};
    for (const a of acc || []) {
      const mine = new Set((rows || []).filter((r) => r.email === a.email).map((r) => areaOf(r.kind, r.path)).filter(Boolean));
      const areas = USAGE_AREAS.filter((x) => a.role !== "standard" || !x.adminOnly).map((x) => x.label);
      const used = areas.filter((x) => mine.has(x)), missing = areas.filter((x) => !mine.has(x));
      out[a.email] = { pct: Math.round((used.length / areas.length) * 100), used, missing, total: areas.length };
    }
    return NextResponse.json({ ready: true, days: 30, usage: out });
  }
  const days = Math.min(Math.max(Number(sp.get("days")) || 7, 1), 90), who = sp.get("user") || "";
  const since = new Date(Date.now() - days * 864e5).toISOString();
  let q = db.from("activity_log").select("id,user_id,email,kind,detail,path,created_at,last_seen").gte("created_at", since).order("created_at", { ascending: false }).limit(5000);
  if (who) q = q.eq("email", who);
  const { data, error } = await q;
  if (error) return NextResponse.json({ ready: false, feed: [], summary: [], totals: [] });
  const { data: pres } = await db.from("user_presence").select("user_id,email,path,last_seen");
  const rows = data || [];
  const dubaiDay = (ms: number) => new Date(ms + 4 * 36e5).toISOString().slice(0, 10); // days are Dubai days
  const secs = (r: { created_at: string; last_seen: string | null }) => Math.max(0, Math.round((new Date(r.last_seen || r.created_at).getTime() - new Date(r.created_at).getTime()) / 1000));
  // Total time per person per day: the pages' time spans merged, so two tabs open at once are not counted twice.
  const spans = new Map<string, [number, number][]>();
  for (const r of rows) if (r.kind === "page" && !isPlayPath(r.path)) { const a = new Date(r.created_at).getTime(), b2 = new Date(r.last_seen || r.created_at).getTime(); const k = `${dubaiDay(a)}|${r.email}`; (spans.get(k) || spans.set(k, []).get(k)!).push([a, b2]); }
  const totals = [...spans.entries()].map(([k, list]) => {
    list.sort((x, y) => x[0] - y[0]); let total = 0, end = -1, start = 0;
    for (const [a, b2] of list) { if (a > end) { if (end >= 0) total += end - start; start = a; end = b2; } else end = Math.max(end, b2); }
    if (end >= 0) total += end - start;
    const [day, email] = k.split("|"); return { day, email, secs: Math.round(total / 1000) };
  });
  const emails = new Set<string>([...rows.map((r) => r.email), ...(pres || []).map((p) => p.email), ...[...people.values()].map((p) => p.email)].filter(Boolean));
  const summary = [...emails].map((email) => {
    const mine = rows.filter((r) => r.email === email), pr = (pres || []).find((p) => p.email === email), p = [...people.values()].find((x) => x.email === email);
    const pages = new Map<string, number>(); mine.filter((r) => r.kind === "page" && !isPlayPath(r.path)).forEach((r) => pages.set(pageLabel(r.path), (pages.get(pageLabel(r.path)) || 0) + secs(r)));
    return { email, name: p?.name || "", last_sign_in: p?.last_sign_in || null, last_seen: pr?.last_seen || null, visits: mine.filter((r) => r.kind === "visit").length, actions: mine.filter((r) => !["visit", "page"].includes(r.kind)).length,
      time_secs: totals.filter((t) => t.email === email).reduce((n, t) => n + t.secs, 0), top_pages: [...pages.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => k) };
  }).sort((a, b) => String(b.last_seen || b.last_sign_in || "").localeCompare(String(a.last_seen || a.last_sign_in || "")));
  return NextResponse.json({ ready: true, days, summary, totals,
    feed: rows.slice(0, 2500).map((r) => ({ id: r.id, at: r.created_at, day: dubaiDay(new Date(r.created_at).getTime()), email: r.email, kind: r.kind, detail: r.detail, page: pageLabel(r.path || ""), secs: r.kind === "page" ? secs(r) : 0 })) });
}
