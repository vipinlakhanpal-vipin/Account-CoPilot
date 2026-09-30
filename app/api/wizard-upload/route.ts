import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireUser } from "@/lib/auth";
import { getAccess, canSeeRegion } from "@/lib/access";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Setup Wizard's "Add Data" step: upload a spreadsheet of the user's own companies. Stored in Supabase Storage
// (bucket "uploads"), logged in settings.uploaded_lists — the scheduled session reads and imports it later
// (ENGINE.md "Reading an uploaded list"), never overwriting anything, same as the original workbook import.
export const dynamic = "force-dynamic";

type UploadItem = { id: string; filename: string; region: string; path: string; uploaded_by: string; uploaded_at: string; rows: number; status: "waiting" | "done" | "error"; processed_at?: string; summary?: string };

async function getItems(db: ReturnType<typeof supabaseAdmin>): Promise<UploadItem[]> {
  const { data } = await db.from("settings").select("value").eq("key", "uploaded_lists").maybeSingle();
  return (data?.value as { items?: UploadItem[] } | null)?.items || [];
}

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const access = await getAccess(user);
  const db = supabaseAdmin();
  const items = (await getItems(db)).filter((x) => canSeeRegion(access, x.region));
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const access = await getAccess(user);
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const region = String(form?.get("region") || "");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file received." }, { status: 400 });
  if (!region || !canSeeRegion(access, region)) return NextResponse.json({ error: "Pick a region you have access to first." }, { status: 403 });
  if (!/\.(xlsx|xls)$/i.test(file.name)) return NextResponse.json({ error: "Only .xlsx or .xls files are accepted." }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "File is too large (10MB limit)." }, { status: 400 });

  const arrayBuf = await file.arrayBuffer();
  const buf = Buffer.from(arrayBuf);
  let rows = 0;
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(arrayBuf);
    const ws = wb.worksheets[0];
    rows = Math.max(0, (ws?.rowCount || 1) - 1); // minus the header row
  } catch {
    return NextResponse.json({ error: "Could not read that file — make sure it's a valid Excel workbook." }, { status: 400 });
  }
  if (rows === 0) return NextResponse.json({ error: "That sheet doesn't have any data rows below the header." }, { status: 400 });

  const db = supabaseAdmin();
  const id = crypto.randomUUID().slice(0, 8);
  const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, "_");
  const path = `${region}/${Date.now()}-${safeName}`;
  const { error: upErr } = await db.storage.from("uploads").upload(path, buf, { contentType: file.type || "application/octet-stream", upsert: false });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const items = await getItems(db);
  const item: UploadItem = { id, filename: file.name, region, path, uploaded_by: user.email || "", uploaded_at: new Date().toISOString(), rows, status: "waiting" };
  items.unshift(item);
  const { error: setErr } = await db.from("settings").upsert({ key: "uploaded_lists", value: { items: items.slice(0, 100) }, updated_at: new Date().toISOString() });
  if (setErr) return NextResponse.json({ error: setErr.message }, { status: 500 });
  return NextResponse.json({ ok: true, item });
}
