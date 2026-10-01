import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getAccess } from "@/lib/access";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { invalidateAllData } from "@/lib/dataCache";

// Resolving a conflict group (Conflicts tab / account brief): a Super Admin picks one candidate value and it
// is written to the real record (today: contacts.title_verbatim for a Title conflict), then every conflict row
// for that company+entity+field is stamped with a resolution note so the group reads as resolved everywhere.
export const dynamic = "force-dynamic";

const Body = z.object({ action: z.literal("resolve"), company_id: z.string().min(1), entity: z.string().min(1), field: z.string().min(1),
  value: z.string().min(1), sources: z.array(z.string()).default([]) });

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const access = await getAccess(user);
  if (!access.isSuper) return NextResponse.json({ error: "Only a Super Admin can resolve a conflict." }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { company_id, entity, field, value, sources } = parsed.data;
  const db = supabaseAdmin();

  const { data: rows, error: selErr } = await db.from("conflicts").select("id").eq("company_id", company_id).eq("entity", entity).eq("field", field);
  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 });
  if (!rows || rows.length === 0) return NextResponse.json({ error: "No matching conflict found." }, { status: 404 });

  const resolution = `Resolved: "${value}" selected (${sources.join(", ") || "n/a"}) by ${user.email || "a Super Admin"} on ${new Date().toISOString().slice(0, 10)}.`;
  const { error: updErr } = await db.from("conflicts").update({ resolution }).in("id", rows.map((r) => r.id));
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  // Title is the only field currently written back to the real record; Name-conflict detection doesn't exist
  // yet (reconcile.ts only flags Title mismatches), so a future "Name" group resolves here without a patch.
  if (field === "Title") {
    const { error: cErr } = await db.from("contacts").update({ title_verbatim: value }).eq("company_id", company_id).eq("full_name", entity);
    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
  }

  invalidateAllData();
  return NextResponse.json({ ok: true });
}
