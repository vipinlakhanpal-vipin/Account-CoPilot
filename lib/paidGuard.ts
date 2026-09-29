import "server-only";
import { NextResponse } from "next/server";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAccess } from "@/lib/access";

// Paid-actions PIN: every action that calls the Anthropic API (and costs money) needs this PIN, checked here on the server
// before anything is spent. Set by a Super Admin in Setup → Settings. Stored as a salted scrypt hash in settings.paid_pin.
//   Standard users: always asked.  Super Admins: asked only if "ask Super Admins too" is on.
//   No PIN set yet: Super Admins may proceed; everyone else is blocked.
type PinSetting = { hash?: string; salt?: string; ask_super?: boolean; set_by?: string; set_at?: string };
const hashPin = (pin: string, salt: string) => scryptSync(pin, salt, 32).toString("hex");
const fails = new Map<string, { n: number; until: number }>(); // simple lock-out: 5 wrong PINs → 15 minutes

export async function pinSetting(): Promise<PinSetting> {
  const { data } = await supabaseAdmin().from("settings").select("value").eq("key", "paid_pin").maybeSingle();
  return (data?.value as PinSetting) || {};
}
export async function savePin(pin: string | null, askSuper: boolean, by: string) {
  const cur = await pinSetting();
  const salt = randomBytes(16).toString("hex");
  const value: PinSetting = pin ? { hash: hashPin(pin, salt), salt, ask_super: askSuper, set_by: by, set_at: new Date().toISOString() }
    : { ...cur, ask_super: askSuper, set_by: by, set_at: new Date().toISOString() };
  const { error } = await supabaseAdmin().from("settings").upsert({ key: "paid_pin", value, updated_at: new Date().toISOString() });
  return error ? error.message : ""; // "" = saved
}

/** Shared PIN check against settings.paid_pin. missingMsg/wrongMsg let callers phrase the reason (cost vs. a sensitive setting). */
async function checkPin(req: Request, user: User, body: { pin?: unknown } | undefined, missingMsg: string, wrongMsg: string): Promise<NextResponse | null> {
  const st = await pinSetting();
  if (!st.hash || !st.salt) return null; // no PIN ever set — nothing to check against (page-level access control still applies)
  const key = user.id, f = fails.get(key);
  if (f && f.until > Date.now()) return NextResponse.json({ needPin: true, error: "Too many wrong PINs. Try again in 15 minutes." }, { status: 429 });
  const pin = String(req.headers.get("x-paid-pin") || body?.pin || "").trim();
  if (!pin) return NextResponse.json({ needPin: true, error: missingMsg }, { status: 403 });
  const ok = timingSafeEqual(Buffer.from(hashPin(pin, st.salt), "hex"), Buffer.from(st.hash, "hex"));
  if (!ok) {
    const n = (f?.n || 0) + 1;
    fails.set(key, { n, until: n >= 5 ? Date.now() + 15 * 60_000 : 0 });
    return NextResponse.json({ needPin: true, error: n >= 5 ? "Too many wrong PINs. Try again in 15 minutes." : wrongMsg }, { status: 403 });
  }
  fails.delete(key);
  return null;
}

/** null = allowed; otherwise the response to return (403 with needPin so the app can ask for the PIN). */
export async function requirePaidApproval(req: Request, user: User, body?: { pin?: unknown }): Promise<NextResponse | null> {
  const access = await getAccess(user);
  const st = await pinSetting();
  const need = !access.isSuper || !!st.ask_super;
  if (!need) return null;
  if (!st.hash || !st.salt) return NextResponse.json({ needPin: false, error: "Paid actions are switched off: a Super Admin needs to set the paid-actions PIN in Setup → Settings first." }, { status: 403 });
  return checkPin(req, user, body, "This action uses the Anthropic API. Enter the paid-actions PIN to continue.", "Wrong PIN. Nothing was spent.");
}

/** For sensitive but free settings (e.g. Contact tiers, which now drives live research classification): always asks for the
 * PIN if one is set, regardless of the "ask Super Admins too" toggle (that toggle is about API spend, not this). If no PIN
 * has ever been set, this is a no-op — the page's own Super-Admin-only access is the only gate until one is configured. */
export async function requirePin(req: Request, user: User, body?: { pin?: unknown }): Promise<NextResponse | null> {
  return checkPin(req, user, body, "This changes what live research classifies contacts as. Enter the paid-actions PIN to continue.", "Wrong PIN. Nothing was saved.");
}
/** Fingerprint for logs (never the PIN itself). */
export const pinHint = (pin: string) => createHash("sha256").update(pin).digest("hex").slice(0, 6);
