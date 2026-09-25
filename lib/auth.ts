import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

export function emailAllowed(email?: string | null) {
  if (!email) return false;
  const allowed = (process.env.ALLOWED_EMAIL_DOMAINS || "")
    .split(/[,;\s]+/).map((d) => d.trim().toLowerCase().replace(/^["'@]+|["']+$/g, "").replace(/^.*@/, "").replace(/^(https?:\/\/)?(www\.)?/, "").replace(/\/.*$/, "")).filter(Boolean);
  if (!allowed.length) return true;
  return allowed.includes(email.split("@")[1]?.trim().toLowerCase() ?? "");
}

/** Returns the signed-in, allowed user or null. Use in API routes. */
export async function requireUser() {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  const user = data.user;
  if (!user || !emailAllowed(user.email)) return null;
  return user;
}

/** For pages: sends visitors who are not signed in (or not on an allowed domain) to the login page. */
export async function requirePageUser() {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  if (!data.user) redirect("/login");
  if (!emailAllowed(data.user.email)) redirect("/login?denied=1");
  return data.user;
}
