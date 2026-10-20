import "server-only";
import type { supabaseAdmin } from "@/lib/supabase/admin";

type Db = ReturnType<typeof supabaseAdmin>;
export const INACTIVE_DAYS = 15;
export type IdleUser = { id: string; email: string; name: string; role: string; regions: string[]; created_at: string; last_active: string; days_idle: number; suspended_at: string | null; invited_by: string };

const iso = (v: unknown) => (v ? new Date(String(v)).getTime() : 0);

/** Everyone except the Super Admin, with the last time they did anything: a sign-in, a page or action, the online signal, or the day you chose Keep. A user never seen counts from the day they were added. */
export async function scanUsers(db: Db): Promise<IdleUser[]> {
  const { data: list } = await db.auth.admin.listUsers({ perPage: 200 });
  const users = list?.users || [];
  const { data: acc } = await db.from("user_access").select("user_id,role,regions,suspended_at,kept_at");
  const accBy = new Map((acc || []).map((a) => [a.user_id as string, a]));
  const { data: pres } = await db.from("user_presence").select("user_id,last_seen");
  const presBy = new Map((pres || []).map((p) => [p.user_id as string, iso(p.last_seen)]));
  const { data: log } = await db.from("activity_log").select("user_id,created_at").order("created_at", { ascending: false }).limit(5000);
  const logBy = new Map<string, number>();
  for (const r of log || []) { const k = r.user_id as string; if (k && !logBy.has(k)) logBy.set(k, iso(r.created_at)); }
  const now = Date.now();
  return users.map((u) => {
    const a = accBy.get(u.id);
    const last = Math.max(iso(u.created_at), iso(u.last_sign_in_at), presBy.get(u.id) || 0, logBy.get(u.id) || 0, iso(a?.kept_at));
    return { id: u.id, email: u.email || "", name: String(u.user_metadata?.full_name || ""), role: String(a?.role || "standard"), regions: (a?.regions as string[]) || [],
      created_at: u.created_at, last_active: new Date(last).toISOString(), days_idle: Math.floor((now - last) / 864e5), suspended_at: (a?.suspended_at as string) || null,
      invited_by: String(u.user_metadata?.invited_by || "") };
  }).filter((u) => u.role !== "super_admin");
}

/** Suspends (reversibly) anyone idle for 15 days who is not yet suspended: they cannot sign in, and nothing is deleted. */
export async function suspendIdle(db: Db, users: IdleUser[]) {
  for (const u of users) {
    if (u.days_idle < INACTIVE_DAYS || u.suspended_at) continue;
    const { error } = await db.auth.admin.updateUserById(u.id, { ban_duration: "876000h" });
    if (!error) { const at = new Date().toISOString(); await db.from("user_access").update({ suspended_at: at }).eq("user_id", u.id); u.suspended_at = at; }
  }
}
