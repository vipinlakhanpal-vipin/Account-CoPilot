// Shared date/time display format for the whole app: DD/MM/YY | HH:MM AM/PM (viewer's local time unless a
// timeZone is given, e.g. to pin a value to Asia/Dubai regardless of who's looking). One place to change the
// format everywhere at once, instead of each component picking its own toLocaleString() options.

function datePart(d: Date, timeZone?: string): string {
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit", ...(timeZone ? { timeZone } : {}) });
}
function timePart(d: Date, timeZone?: string): string {
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true, ...(timeZone ? { timeZone } : {}) });
}

/** "30/09/26" */
export function fmtDate(iso?: string | null, timeZone?: string): string {
  if (!iso) return "";
  return datePart(new Date(iso), timeZone);
}

/** "30/09/26 | 06:24 AM" */
export function fmtDateTime(iso?: string | null, timeZone?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${datePart(d, timeZone)} | ${timePart(d, timeZone)}`;
}

/** "6:24am" — compact, no leading zero, lowercase am/pm, no space. For tight spaces like table cells. */
export function fmtTimeShort(iso?: string | null, timeZone?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const t = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, ...(timeZone ? { timeZone } : {}) });
  return t.replace(/\s/g, "").toLowerCase();
}

// ---- Date filter on every table: "Data added" and "Data enriched" ----
// Added = when the row first entered the app (created_at). Enriched = the latest time anything was researched, verified or filled in:
// an enrichment or revenue check stamped on the company, last_verified, the day a source was accessed (date_accessed), a signal's date,
// or the row being updated after it was created.
type DateRow = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const parts = (r: DateRow): DateRow[] => [r, ...(Array.isArray(r.rows) ? (r.rows as DateRow[]) : [])]; // a person row carries its source rows
const ts = (v: unknown) => { const t = v ? new Date(String(v)).getTime() : NaN; return Number.isFinite(t) ? t : NaN; };
/** Calendar day (YYYY-MM-DD) of a date or timestamp, in the viewer's time zone for timestamps. */
export function dayKey(v: unknown): string {
  const s = String(v || ""); if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const t = ts(s); if (Number.isNaN(t)) return "";
  const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function addedAt(r: DateRow): string {
  const t = parts(r).map((x) => ts(x.created_at)).filter((x) => !Number.isNaN(x));
  return t.length ? new Date(Math.min(...t)).toISOString() : "";
}
export function enrichedAt(r: DateRow): string {
  const out: number[] = [];
  for (const x of parts(r)) {
    const created = ts(x.created_at);
    const upd = ts(x.updated_at); if (!Number.isNaN(upd) && (Number.isNaN(created) || upd - created > 60_000)) out.push(upd);
    for (const v of [x.last_verified, x.date_accessed, x.date, x.date_found, x.profile?.["Enrichment"]?.at, x.profile?.["Revenue check"]?.at, x.profile?.["Revenue check"]?.checked_at]) { const t = ts(v); if (!Number.isNaN(t)) out.push(t); }
  }
  return out.length ? new Date(Math.max(...out)).toISOString() : "";
}
