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
