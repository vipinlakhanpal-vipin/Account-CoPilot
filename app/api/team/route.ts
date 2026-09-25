import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { emailAllowed, requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireUser())) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { data, error } = await supabaseAdmin().auth.admin.listUsers({ perPage: 200 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ users: data.users.map((u) => ({ email: u.email, name: u.user_metadata?.full_name || "", invited_by: u.user_metadata?.invited_by || "",
    joined_from: u.user_metadata?.joined_from || "", created_at: u.created_at, last_sign_in: u.last_sign_in_at })) });
}

// Invite a colleague. mode "password" creates the account with a one-time temporary password (no email needed);
// mode "email" asks Supabase to send an invitation email.
export async function POST(req: Request) {
  const me = await requireUser();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { email, name, mode } = await req.json().catch(() => ({}));
  if (typeof email !== "string" || !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  if (!emailAllowed(email)) return NextResponse.json({ error: "That email domain is not allowed. Add it to ALLOWED_EMAIL_DOMAINS in Vercel first." }, { status: 400 });
  const admin = supabaseAdmin().auth.admin;
  const meta = { full_name: typeof name === "string" ? name.trim() : "", invited_by: me.email };
  if (mode === "email") {
    const origin = new URL(req.url).origin;
    const { error } = await admin.inviteUserByEmail(email, { data: meta, redirectTo: `${origin}/auth/callback` });
    if (error) return NextResponse.json({ error: `Invitation email could not be sent: ${error.message}. Use a temporary password instead.` }, { status: 400 });
    return NextResponse.json({ ok: true, message: `Invitation email sent to ${email}.` });
  }
  const temp = randomBytes(9).toString("base64url");
  const { error } = await admin.createUser({ email, password: temp, email_confirm: true, user_metadata: meta });
  if (error) return NextResponse.json({ error: error.message.includes("already") ? "That person already has an account." : error.message }, { status: 400 });
  return NextResponse.json({ ok: true, tempPassword: temp, message: `Account created for ${email}.` });
}
