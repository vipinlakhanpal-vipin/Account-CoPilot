import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireUser } from "@/lib/auth";
import { getAccess, canSeeRegion } from "@/lib/access";
import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { regionOf, effectiveEngine } from "@/lib/icpDefinition.mjs";

// Setup Wizard's "Add Data" step: upload a spreadsheet of the user's own companies. Stored in Supabase Storage
// (bucket "uploads"), logged in settings.uploaded_lists — the scheduled session reads and imports it later
// (ENGINE.md "Reading an uploaded list"), never overwriting anything, same as the original workbook import.
export const dynamic = "force-dynamic";

type UploadItem = { id: string; filename: string; region: string; path: string; uploaded_by: string; uploaded_at: string; rows: number; status: "waiting" | "done" | "error"; processed_at?: string; summary?: string; hash?: string };

/** Opens a GitHub issue so the instant job runner starts now (and reads the list first, ENGINE.md section 0c) instead of waiting for the 6am daily run. Same mechanism as a queued job; needs GITHUB_JOBS_TOKEN. */
async function openUploadIssue(item: UploadItem): Promise<string> {
  const token = process.env.GITHUB_JOBS_TOKEN;
  if (!token) return "not_set";
  try {
    const r = await fetch("https://api.github.com/repos/vipinlakhanpal-vipin/account-copilot-jobs/issues", {
      method: "POST", headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
      body: JSON.stringify({ title: `Upload ${item.id}: ${item.filename} (${item.region}, ${item.rows} rows)`, body: `Uploaded by ${item.uploaded_by} at ${item.uploaded_at}.\n\nAuto-opened by Account CoPilot so the instant job runner reads this list now instead of waiting for the next daily run (ENGINE.md section 0c). The upload itself is tracked in the app (Setup wizard, Add Data).` }),
    });
    return r.ok ? "ok" : `github_${r.status}`;
  } catch { return "failed"; }
}

async function getItems(db: ReturnType<typeof supabaseAdmin>): Promise<UploadItem[]> {
  const { data } = await db.from("settings").select("value").eq("key", "uploaded_lists").maybeSingle();
  return (data?.value as { items?: UploadItem[] } | null)?.items || [];
}

export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const access = await getAccess(user);
  const db = supabaseAdmin();
  // ?download=<id>: the original file, through a one-minute link. Only the Super Admin (downloads) or the person who uploaded it, and only for their regions.
  const dl = new URL(req.url).searchParams.get("download");
  if (dl) {
    const item = (await getItems(db)).find((x) => x.id === dl);
    if (!item || !canSeeRegion(access, item.region)) return NextResponse.json({ error: "File not found." }, { status: 404 });
    if (!access.canDownload && item.uploaded_by !== (user.email || "")) return NextResponse.json({ error: "Only the Super Admin or the person who uploaded this file can download it." }, { status: 403 });
    const { data, error } = await db.storage.from("uploads").createSignedUrl(item.path, 60, { download: item.filename });
    if (error || !data?.signedUrl) return NextResponse.json({ error: "Could not open the stored file." }, { status: 500 });
    return NextResponse.redirect(data.signedUrl);
  }
  const items = (await getItems(db)).filter((x) => canSeeRegion(access, x.region));
  // Where each country stands today (read-only counts), for the wizard's "No, build one from scratch" card.
  const coverage: Record<string, { total: number; verified: number; likely: number; check: number; other: number }> = {};
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from("companies").select("icp_status,country").range(from, from + 999);
    for (const c of data || []) {
      const r = regionOf(c.country); if (!canSeeRegion(access, r)) continue;
      const k = (coverage[r] ||= { total: 0, verified: 0, likely: 0, check: 0, other: 0 }); k.total++;
      if (c.icp_status === "ICP — Verified") k.verified++; else if (c.icp_status === "ICP — Likely") k.likely++; else if (c.icp_status === "ICP — Needs check") k.check++; else k.other++;
    }
    if (!data || data.length < 1000) break;
  }
  return NextResponse.json({ items, coverage });
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
  let rows = 0, hash = "";
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(arrayBuf);
    const ws = wb.worksheets[0];
    rows = Math.max(0, (ws?.rowCount || 1) - 1); // minus the header row
    // A fingerprint of what is IN the sheets (every cell value), so the same list saved under another file name is recognised.
    const h = createHash("sha256");
    wb.eachSheet((sh) => sh.eachRow((row) => h.update(JSON.stringify(row.values))));
    hash = h.digest("hex");
  } catch {
    return NextResponse.json({ error: "Could not read that file — make sure it's a valid Excel workbook." }, { status: 400 });
  }
  if (rows === 0) return NextResponse.json({ error: "That sheet doesn't have any data rows below the header." }, { status: 400 });

  const db = supabaseAdmin();
  // Same data (even under another file name) or the same name and number of rows, from anyone, for this country: ask before storing it.
  const have = await getItems(db), norm = (n: string) => n.trim().toLowerCase();
  const matches = have.filter((x) => x.region === region && x.status !== "error" && ((hash && x.hash === hash) || (norm(x.filename) === norm(file.name) && x.rows === rows)));
  if (matches.length && String(form?.get("force") || "") !== "1")
    return NextResponse.json({ duplicate: true, matches: matches.map((m) => ({ filename: m.filename, uploaded_by: m.uploaded_by, uploaded_at: m.uploaded_at, rows: m.rows, sameData: !!hash && m.hash === hash })) }, { status: 409 });
  const id = crypto.randomUUID().slice(0, 8);
  const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, "_");
  const path = `${region}/${Date.now()}-${safeName}`;
  const { error: upErr } = await db.storage.from("uploads").upload(path, buf, { contentType: file.type || "application/octet-stream", upsert: false });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const items = have;
  const item: UploadItem = { id, filename: file.name, region, path, uploaded_by: user.email || "", uploaded_at: new Date().toISOString(), rows, status: "waiting", hash };
  items.unshift(item);
  const { error: setErr } = await db.from("settings").upsert({ key: "uploaded_lists", value: { items: items.slice(0, 100) }, updated_at: new Date().toISOString() });
  if (setErr) return NextResponse.json({ error: setErr.message }, { status: 500 });
  const instant = await openUploadIssue(item);
  // Approximate times, said honestly as estimates: when a session will open the file, and how long rating the new companies takes at this country's daily pace.
  const { data: defRow } = await db.from("settings").select("value").eq("key", "icp_definition").maybeSingle();
  const eng = effectiveEngine((defRow?.value as { regions?: Record<string, unknown> } | null)?.regions?.[region]);
  const next = new Date(); next.setUTCHours(2, 0, 0, 0); if (next.getTime() <= Date.now()) next.setUTCDate(next.getUTCDate() + 1); // the daily run: 02:00 UTC = 6:00 am Dubai
  const hours = Math.max(1, Math.round((next.getTime() - Date.now()) / 3600000));
  const read = instant === "ok" ? "Reading it should take about 10 minutes (the instant runner has been started)." : `Reading it waits for the next daily run at 6:00 am Dubai time, about ${hours} hour${hours === 1 ? "" : "s"} from now, and takes about 10 minutes.`;
  const days = eng.verify_per_day > 0 ? Math.max(1, Math.ceil(rows / eng.verify_per_day)) : 0;
  const sync = days ? `Rating every new company (revenue, ICP status, contacts) then takes up to about ${days} day${days === 1 ? "" : "s"} at ${eng.verify_per_day} a day; it is quicker when many are already in the app.` : "Revenue checks, ICP status and contacts then follow over the daily runs.";
  return NextResponse.json({ ok: true, item, instant, estimate: { read, sync } });
}

// Only the Super Admin can delete an uploaded file. Companies already added from it stay in the app.
export async function DELETE(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const access = await getAccess(user);
  if (!access.isOwner) return NextResponse.json({ error: "Only the Super Admin can delete an uploaded file." }, { status: 403 });
  const { id } = await req.json().catch(() => ({}));
  if (typeof id !== "string") return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const db = supabaseAdmin();
  const items = await getItems(db), item = items.find((x) => x.id === id);
  if (!item) return NextResponse.json({ error: "File not found." }, { status: 404 });
  await db.storage.from("uploads").remove([item.path]);
  const { error } = await db.from("settings").upsert({ key: "uploaded_lists", value: { items: items.filter((x) => x.id !== id) }, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
