import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { emailAllowed, requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAccess, ALL_REGIONS } from "@/lib/access";

export const dynamic = "force-dynamic";

// Team (Super Admin only): list people with their role and region(s), invite someone with a role and region, change a person's access.
//   Super Admin   — every region (consolidated view), team, engine, all ICPs.
//   Standard User — only the assigned region(s): its data and its ICP.
type Role = "super_admin" | "standard";
const clean = (role: unknown, regions: unknown): { role: Role; regions: string[] } | null => {
  const r: Role = role === "super_admin" ? "super_admin" : "standard";
  const regs = Array.isArray(regions) ? [...new Set(regions.map(String).filter((x) => ALL_REGIONS.includes(x)))] : [];
  if (r === "standard" && !regs.length) return null;
  return { role: r, regions: r === "super_admin" ? [] : regs };
};

async function superOnly() {
  const me = await requireUser();
  if (!me) return { error: NextResponse.json({ error: "Sign in required" }, { status: 401 }) };
  const access = await getAccess(me);
  if (!access.isSuper) return { error: NextResponse.json({ error: "Only a Super Admin can manage the team." }, { status: 403 }) };
  return { me, access };
}

export async function GET() {
  const g = await superOnly(); if ("error" in g) return g.error;
  const db = supabaseAdmin();
  const { data, error } = await db.auth.admin.listUsers({ perPage: 200 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { data: acc, error: e2 } = await db.from("user_access").select("user_id,role,regions,updated_at,updated_by");
  const byId = new Map((acc || []).map((a) => [a.user_id, a]));
  return NextResponse.json({ ready: !e2, users: data.users.map((u) => ({ id: u.id, email: u.email, name: u.user_metadata?.full_name || "", invited_by: u.user_metadata?.invited_by || "",
    joined_from: u.user_metadata?.joined_from || "", created_at: u.created_at, last_sign_in: u.last_sign_in_at,
    role: byId.get(u.id)?.role || (e2 ? "super_admin" : "standard"), regions: byId.get(u.id)?.regions || [] })) });
}

// Invite a colleague with a role and region. mode "password" creates the account with a one-time temporary password (no email needed);
// mode "email" asks Supabase to send an invitation email.
export async function POST(req: Request) {
  const g = await superOnly(); if ("error" in g) return g.error;
  const body = await req.json().catch(() => ({}));

  // Someone already created with a temporary password that never reached them (lost, or the admin didn't copy it)
  // has no other way back in: re-inviting fails with "already has an account", so this sets a fresh one instead.
  if (body.action === "reset_password") {
    const { id } = body;
    if (typeof id !== "string") return NextResponse.json({ error: "Bad request." }, { status: 400 });
    const db = supabaseAdmin();
    const temp = randomBytes(9).toString("base64url");
    const { data, error } = await db.auth.admin.updateUserById(id, { password: temp });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, tempPassword: temp, message: `New temporary password set for ${data.user.email}.` });
  }

  const { email, name, mode, role, regions } = body;
  if (typeof email !== "string" || !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  if (!emailAllowed(email)) return NextResponse.json({ error: "That email domain is not allowed. Add it to ALLOWED_EMAIL_DOMAINS in Vercel first." }, { status: 400 });
  const acc = clean(role, regions);
  if (!acc) return NextResponse.json({ error: "Choose the region this Standard User will work on." }, { status: 400 });
  const db = supabaseAdmin(), admin = db.auth.admin;
  const meta = { full_name: typeof name === "string" ? name.trim() : "", invited_by: g.me.email };
  let userId = "", temp = "";
  if (mode === "email") {
    const origin = new URL(req.url).origin;
    const { data, error } = await admin.inviteUserByEmail(email, { data: meta, redirectTo: `${origin}/auth/callback` });
    if (error) return NextResponse.json({ error: `Invitation email could not be sent: ${error.message}. Use a temporary password instead.` }, { status: 400 });
    userId = data.user.id;
  } else {
    temp = randomBytes(9).toString("base64url");
    const { data, error } = await admin.createUser({ email, password: temp, email_confirm: true, user_metadata: meta });
    if (error) return NextResponse.json({ error: error.message.includes("already") ? "That person already has an account." : error.message }, { status: 400 });
    userId = data.user.id;
  }
  const { error: e3 } = await db.from("user_access").upsert({ user_id: userId, email: email.toLowerCase(), ...acc, updated_at: new Date().toISOString(), updated_by: g.me.email });
  const what = acc.role === "super_admin" ? "Super Admin (all regions)" : `Standard User for ${acc.regions.join(", ")}`;
  const warn = e3 ? " Note: roles are not active yet — run the region-access database update first (see Setup → Team)." : "";
  return NextResponse.json({ ok: true, tempPassword: temp || undefined, message: mode === "email" ? `Invitation email sent to ${email} as ${what}.${warn}` : `Account created for ${email} as ${what}.${warn}` });
}

// Change someone's role / region(s).
export async function PATCH(req: Request) {
  const g = await superOnly(); if ("error" in g) return g.error;
  const { id, role, regions } = await req.json().catch(() => ({}));
  if (typeof id !== "string") return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const acc = clean(role, regions);
  if (!acc) return NextResponse.json({ error: "A Standard User needs at least one region." }, { status: 400 });
  const db = supabaseAdmin();
  if (id === g.me.id && acc.role !== "super_admin") {
    const { count } = await db.from("user_access").select("user_id", { count: "exact", head: true }).eq("role", "super_admin");
    if ((count || 0) <= 1) return NextResponse.json({ error: "You are the only Super Admin. Make someone else Super Admin first." }, { status: 400 });
  }
  const { data: u } = await db.auth.admin.getUserById(id);
  if (!u?.user) return NextResponse.json({ error: "User not found." }, { status: 404 });
  const { error } = await db.from("user_access").upsert({ user_id: id, email: String(u.user.email || "").toLowerCase(), ...acc, updated_at: new Date().toISOString(), updated_by: g.me.email });
  if (error) return NextResponse.json({ error: `Could not save: ${error.message}. Run the region-access database update first.` }, { status: 500 });
  return NextResponse.json({ ok: true });
}
