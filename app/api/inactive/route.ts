import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { requireUser } from "@/lib/auth";
import { getAccess } from "@/lib/access";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { INACTIVE_DAYS, scanUsers, suspendIdle, type IdleUser } from "@/lib/inactivity";

// Inactive users (Super Admin only). 15 days with no activity: the person is suspended (they cannot sign in; nothing is deleted).
// The Super Admin then keeps them (the 15 days restart), or archives and deletes them. The archive holds a snapshot so they can be reactivated.
export const dynamic = "force-dynamic";
type Db = ReturnType<typeof supabaseAdmin>;
const doc = async <T,>(db: Db, key: string, fb: T): Promise<T> => ((await db.from("settings").select("value").eq("key", key).maybeSingle()).data?.value as T) ?? fb;

async function owner() {
  const me = await requireUser();
  if (!me) return { error: NextResponse.json({ error: "Sign in required" }, { status: 401 }) };
  const access = await getAccess(me);
  if (!access.isOwner) return { error: NextResponse.json({ error: "Only the Super Admin can do this." }, { status: 403 }) };
  return { me };
}

/** What deleting a user would remove, and what stays, with counts. */
async function footprint(db: Db, u: IdleUser) {
  const { count: act } = await db.from("activity_log").select("id", { count: "exact", head: true }).eq("user_id", u.id);
  const reports = (await doc<{ items?: { created_by?: string }[] }>(db, "saved_reports", {})).items || [];
  const sugg = (await doc<{ items?: { submitted_by?: string }[] }>(db, "suggestions", {})).items || [];
  const jobs = (await doc<{ jobs?: { requested_by?: string }[] }>(db, "engine_jobs", {})).jobs || [];
  const mine = (e: string | undefined) => (e || "").toLowerCase() === u.email.toLowerCase();
  return {
    removes: [{ what: "Their sign-in account and role", n: 1 }, { what: "Their activity log entries (pages opened, searches, downloads)", n: act || 0 }, { what: "Filters and reports they saved", n: reports.filter((r) => mine(r.created_by)).length }],
    stays: [{ what: "Every company, contact, partner and signal they caused to be added or researched", n: null }, { what: "Suggestions they submitted (shown as from a former user)", n: sugg.filter((s) => mine(s.submitted_by)).length }, { what: "Jobs they requested (history only)", n: jobs.filter((j) => mine(j.requested_by)).length }],
  };
}

export async function GET(req: Request) {
  const g = await owner(); if ("error" in g) return g.error;
  const db = supabaseAdmin(), url = new URL(req.url);
  const archiveId = url.searchParams.get("archive");
  if (archiveId) {
    const { data } = await db.from("user_archive").select("*").eq("id", archiveId).maybeSingle();
    if (!data) return NextResponse.json({ error: "Archive not found." }, { status: 404 });
    return new NextResponse(JSON.stringify(data, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="archived_user_${String(data.email).split("@")[0]}.json"`, "Cache-Control": "no-store" } });
  }
  const users = await scanUsers(db);
  await suspendIdle(db, users);
  const idle = users.filter((u) => u.days_idle >= INACTIVE_DAYS || u.suspended_at);
  if (url.searchParams.get("count")) return NextResponse.json({ n: idle.length }, { headers: { "Cache-Control": "no-store" } });
  const withFoot = await Promise.all(idle.map(async (u) => ({ ...u, ...(await footprint(db, u)) })));
  const { data: arch } = await db.from("user_archive").select("id,email,name,role,regions,last_active,archived_at,archived_by,reactivated_at").order("archived_at", { ascending: false }).limit(100);
  return NextResponse.json({ days: INACTIVE_DAYS, idle: withFoot, archives: arch || [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const g = await owner(); if ("error" in g) return g.error;
  const b = await req.json().catch(() => ({})) as { action?: string; id?: string; archiveId?: string; confirm?: boolean };
  const db = supabaseAdmin(), me = g.me.email || "";
  const now = new Date().toISOString();

  if (b.action === "keep" && b.id) {
    await db.auth.admin.updateUserById(b.id, { ban_duration: "none" });
    await db.from("user_access").update({ suspended_at: null, kept_at: now }).eq("user_id", b.id);
    return NextResponse.json({ ok: true, message: "Kept. Their 15 days start again from today and they can sign in." });
  }

  if (b.action === "archive_delete" && b.id) {
    if (!b.confirm) return NextResponse.json({ error: "Confirm first." }, { status: 400 });
    const users = await scanUsers(db), u = users.find((x) => x.id === b.id);
    if (!u) return NextResponse.json({ error: "That user was not found, or is the Super Admin." }, { status: 404 });
    const { data: act } = await db.from("activity_log").select("*").eq("user_id", u.id).order("created_at").limit(20000);
    const { data: pres } = await db.from("user_presence").select("*").eq("user_id", u.id).maybeSingle();
    const mine = (e: string | undefined) => (e || "").toLowerCase() === u.email.toLowerCase();
    const reportsDoc = await doc<{ items?: { created_by?: string }[] }>(db, "saved_reports", {});
    const savedReports = (reportsDoc.items || []).filter((r) => mine(r.created_by));
    const sugg = ((await doc<{ items?: { submitted_by?: string }[] }>(db, "suggestions", {})).items || []).filter((s) => mine(s.submitted_by));
    const jobs = ((await doc<{ jobs?: { requested_by?: string }[] }>(db, "engine_jobs", {})).jobs || []).filter((j) => mine(j.requested_by));
    const snapshot = { archived_at: now, archived_by: me, reason: `No activity for ${u.days_idle} days`, profile: { id: u.id, email: u.email, name: u.name, role: u.role, regions: u.regions, created_at: u.created_at, last_active: u.last_active, invited_by: u.invited_by },
      activity_log: act || [], presence: pres || null, saved_reports: savedReports, suggestions: sugg, jobs_requested: jobs };
    const ins = await db.from("user_archive").insert({ user_id: u.id, email: u.email, name: u.name, role: u.role, regions: u.regions, last_active: u.last_active, archived_by: me, snapshot });
    if (ins.error) return NextResponse.json({ error: `Could not save the archive, so nothing was deleted: ${ins.error.message}` }, { status: 500 });
    // the archive is saved: now remove what the user owns
    await db.from("activity_log").delete().eq("user_id", u.id);
    await db.from("user_presence").delete().eq("user_id", u.id);
    if (savedReports.length) await db.from("settings").upsert({ key: "saved_reports", value: { ...reportsDoc, items: (reportsDoc.items || []).filter((r) => !mine(r.created_by)) }, updated_at: now });
    const del = await db.auth.admin.deleteUser(u.id);
    if (del.error) return NextResponse.json({ error: `Archived, but the sign-in could not be deleted: ${del.error.message}` }, { status: 500 });
    await db.from("user_access").delete().eq("user_id", u.id);
    return NextResponse.json({ ok: true, message: `${u.email} was archived and deleted. You can download the archive or reactivate them from Archived users.` });
  }

  if (b.action === "reactivate" && b.archiveId) {
    const { data: a } = await db.from("user_archive").select("*").eq("id", b.archiveId).maybeSingle();
    if (!a) return NextResponse.json({ error: "Archive not found." }, { status: 404 });
    if (a.reactivated_at) return NextResponse.json({ error: "This user was already reactivated." }, { status: 400 });
    const temp = randomBytes(9).toString("base64url");
    const { data, error } = await db.auth.admin.createUser({ email: a.email, password: temp, email_confirm: true, user_metadata: { full_name: a.name, invited_by: me } });
    if (error) return NextResponse.json({ error: error.message.includes("already") ? "That email already has an account." : error.message }, { status: 400 });
    await db.from("user_access").upsert({ user_id: data.user.id, email: String(a.email).toLowerCase(), role: a.role, regions: a.regions, kept_at: now, updated_at: now, updated_by: me });
    const restore = ((a.snapshot as { saved_reports?: { id: string }[] })?.saved_reports) || [];
    if (restore.length) { const rd = await doc<{ items?: { id: string }[] }>(db, "saved_reports", {}); const have = new Set((rd.items || []).map((r) => r.id)); await db.from("settings").upsert({ key: "saved_reports", value: { ...rd, items: [...(rd.items || []), ...restore.filter((r) => !have.has(r.id))] }, updated_at: now }); }
    await db.from("user_archive").update({ reactivated_at: now }).eq("id", a.id);
    const origin = new URL(req.url).origin;
    const draftEmail = { subject: "Your Account CoPilot access is back", body: `Hi ${a.name || ""},\n\nYour Account CoPilot access has been restored.\n\nSign in here: ${origin}/login\nEmail: ${a.email}\nTemporary password: ${temp}\n\nOpen your profile and use "Change password" to set your own.` };
    return NextResponse.json({ ok: true, tempPassword: temp, draftEmail, message: `${a.email} is reactivated as ${a.role === "admin" ? "Admin" : a.role === "super_admin" ? "Super Admin" : "Standard User"}, with their role, regions and saved filters back. Their activity history stays in the archive.` });
  }

  if (b.action === "delete_archive" && b.archiveId && b.confirm) {
    await db.from("user_archive").delete().eq("id", b.archiveId);
    return NextResponse.json({ ok: true, message: "Archive deleted." });
  }
  return NextResponse.json({ error: "Bad request." }, { status: 400 });
}
