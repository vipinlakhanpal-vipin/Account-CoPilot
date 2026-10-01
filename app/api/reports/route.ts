import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Criteria } from "@/lib/icp";

// Dashboard → Reports: a saved search/filter, re-run live (not a frozen snapshot) whenever it's opened again.
export const dynamic = "force-dynamic";

export type SavedReport = { id: string; name: string; criteria: Criteria; created_by: string; created_at: string; match_count: number };

async function getItems(db: ReturnType<typeof supabaseAdmin>): Promise<SavedReport[]> {
  const { data } = await db.from("settings").select("value").eq("key", "saved_reports").maybeSingle();
  return (data?.value as { items?: SavedReport[] } | null)?.items || [];
}

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const db = supabaseAdmin();
  return NextResponse.json({ items: await getItems(db) });
}

const Body = z.object({ action: z.literal("save"), name: z.string().min(1).max(80), criteria: z.record(z.string(), z.unknown()), match_count: z.number().int().min(0) });

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const b = parsed.data, db = supabaseAdmin();
  const items = await getItems(db);
  const item: SavedReport = { id: crypto.randomUUID().slice(0, 8), name: b.name, criteria: b.criteria as Criteria, created_by: user.email || "",
    created_at: new Date().toISOString(), match_count: b.match_count };
  items.unshift(item);
  const { error } = await db.from("settings").upsert({ key: "saved_reports", value: { items: items.slice(0, 200) }, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items });
}
