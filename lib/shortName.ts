// Company names in tables are short: "ADNOC (Abu Dhabi National Oil Company)" shows as ADNOC, "Emirates Telecommunications Group Company PJSC (e&)" as e&.
// The full name is the tooltip and is on the account page. Rule: a short bracketed name wins over a long main name; otherwise the main name without the bracket;
// legal endings (PJSC, LLC, Ltd, PLC ...) are dropped; very long names are cut with an ellipsis.
const LEGAL = /(?:[\s,]+(?:company|p\.?j\.?s\.?c\.?|p\.?s\.?c\.?|l\.?l\.?c\.?|f\.?z\.?[- ]?l\.?l\.?c\.?|f\.?z\.?e\.?|f\.?z\.?c\.?o\.?|dmcc|ltd\.?|limited|plc|inc\.?|co\.?|corp\.?|s\.?a\.?o\.?c\.?|s\.?a\.?o\.?g\.?|k\.?s\.?c\.?p?\.?|b\.?s\.?c\.?))+\s*$/i;
export function shortName(full: unknown, max = 26): string {
  const raw = String(full ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  const m = raw.match(/^(.*?)\s*\(([^)]*)\)\s*(.*)$/);
  let n = raw;
  if (m) {
    const main = (m[1] + " " + m[3]).trim(), inner = m[2].trim();
    n = inner && inner.length <= 10 && !/\s/.test(inner) && main.length > 18 ? inner : (main || inner);
  }
  n = n.replace(LEGAL, "").replace(/[,\s]+$/, "").trim() || raw;
  return n.length > max ? n.slice(0, max - 1).trimEnd() + "…" : n;
}
