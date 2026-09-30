import { NextResponse } from "next/server";
import { z } from "zod";
import { Resend } from "resend";
import { requireUser } from "@/lib/auth";
import { getAccess } from "@/lib/access";
import { supabaseAdmin } from "@/lib/supabase/admin";

// A visible "Suggest" button in the header: anyone signed in can raise something to improve and where; a Super
// Admin moves it through Received -> Pending -> In Progress -> Completed with an optional note at each stage.
export const dynamic = "force-dynamic";

export type Suggestion = { id: string; where: string; category: string; description: string; submitted_by: string; submitted_at: string;
  status: "received" | "pending" | "in_progress" | "completed"; note?: string; updated_by?: string; updated_at?: string };

async function getItems(db: ReturnType<typeof supabaseAdmin>): Promise<Suggestion[]> {
  const { data } = await db.from("settings").select("value").eq("key", "suggestions").maybeSingle();
  return (data?.value as { items?: Suggestion[] } | null)?.items || [];
}
const setItems = (db: ReturnType<typeof supabaseAdmin>, items: Suggestion[]) =>
  db.from("settings").upsert({ key: "suggestions", value: { items: items.slice(0, 500) }, updated_at: new Date().toISOString() });

// Best-effort: if RESEND_API_KEY isn't set yet, this silently does nothing rather than failing the status update.
async function notifyCompleted(item: Suggestion) {
  if (!process.env.RESEND_API_KEY || !item.submitted_by) return;
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "Account CoPilot <onboarding@resend.dev>",
      to: item.submitted_by,
      subject: "Your suggestion has been completed",
      text: `Your suggestion has been completed:\n\n"${item.description}"\n(${item.where} · ${item.category})\n\n`
        + `${item.note ? `Note: ${item.note}\n\n` : ""}You can check it in the app under ${item.where}.`,
    });
  } catch (e) { console.error("suggestion completion email failed", e); }
}

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const db = supabaseAdmin();
  const access = await getAccess(user);
  return NextResponse.json({ items: await getItems(db), isSuper: access.isSuper });
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("submit"), where: z.string().min(1).max(60), category: z.string().min(1).max(60), description: z.string().min(3).max(2000) }),
  z.object({ action: z.literal("update_status"), id: z.string(), status: z.enum(["received", "pending", "in_progress", "completed"]), note: z.string().max(2000).optional().default("") }),
]);

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const b = parsed.data, db = supabaseAdmin(), now = new Date().toISOString();
  const items = await getItems(db);

  if (b.action === "submit") {
    const item: Suggestion = { id: crypto.randomUUID().slice(0, 8), where: b.where, category: b.category, description: b.description,
      submitted_by: user.email || "", submitted_at: now, status: "received" };
    items.unshift(item);
    const { error } = await setItems(db, items);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ items });
  }

  // update_status: Super Admin only
  const access = await getAccess(user);
  if (!access.isSuper) return NextResponse.json({ error: "Only a Super Admin can update a suggestion's status." }, { status: 403 });
  const item = items.find((x) => x.id === b.id);
  if (!item) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const wasCompleted = item.status === "completed";
  item.status = b.status; item.note = b.note; item.updated_by = user.email || ""; item.updated_at = now;
  const { error } = await setItems(db, items);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (b.status === "completed" && !wasCompleted) await notifyCompleted(item);
  return NextResponse.json({ items });
}
