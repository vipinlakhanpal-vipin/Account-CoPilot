// Third-party apps shown with an account: only evidence that says something about procurement and finance systems.
// Seamless technographics also tags generic web and developer tools (a music app, a framework, a web analytics script): those rows stay in the database
// but are left out of the app, the PDF, the Excel and Aria, so the ERP landscape lists only what makes sense.
import type { Row } from "@/lib/data";

const GENERIC_CATEGORY = /^(technographics|web\b.*|content\b.*|domain\b.*|development|cloud\b.*)$/i;
/** True for an unverified tag in a generic web, content, domain, cloud or developer category: nothing to learn about the account's procurement and finance systems. */
export const isNoiseApp = (r: Row) => String(r.status || "").toUpperCase() === "UNVERIFIED" && GENERIC_CATEGORY.test(String(r.category || "").trim());

/** "not_public" and "unknown" are stored values, not names of an ERP. */
export const erpText = (v: unknown) => {
  const t = String(v ?? "").trim();
  return !t || /^(unknown|no evidence|n\/a)$/i.test(t) ? "Unknown" : /^not[ _]public$/i.test(t) ? "Not public" : t;
};
