// One record per person, with trust = how many independent sources agree.
// Contact rows come from your Stakeholders sheet (contributors: CoPilot, Claude in Copilot, Claude-Seamless) and from
// Claude checks (verification rows). Rows for the same person at the same company are grouped; nothing is deleted.
import type { Row } from "@/lib/data";

export type Trust = "Confirmed by 2+ sources" | "Single source" | "Conflicting";
export const TRUST_ORDER: Trust[] = ["Confirmed by 2+ sources", "Single source", "Conflicting"];

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
export const nameKey = (n: unknown) => s(n).toLowerCase().replace(/^(dr|eng|mr|ms|mrs|h\.?e)\.?\s+/, "").replace(/[^a-z]/g, "");

/** Which contributor a contact row came from. */
export function contributorOf(p: Row): string {
  const c = s(p.channel_state);
  if (!p.is_reference && c === "Claude") return "Claude check";
  if (c === "CoPilot") return "CoPilot";
  if (c === "Claude-Seamless") return "Claude-Seamless";
  if (/^Claude/.test(c)) return "Claude in Copilot";
  return c && c !== "-" ? c : "Your sheet";
}

export type Person = Row & { person_key: string; rows: Row[]; sources: string[]; trust: Trust; trust_reason: string; best_id: string };

const emailNorm = (e: unknown) => s(e).trim().toLowerCase();
export function buildPeople(contacts: Row[]): Person[] {
  const groups = new Map<string, Row[]>();
  for (const p of contacts) {
    const k = `${p.company_id}|${nameKey(p.full_name)}`;
    if (!nameKey(p.full_name)) continue;
    (groups.get(k) || groups.set(k, []).get(k)!).push(p);
  }
  const out: Person[] = [];
  for (const [k, rows] of groups) {
    const sources = [...new Set(rows.map(contributorOf))];
    const emails = [...new Set(rows.map((r) => emailNorm(r.email)).filter(Boolean))];
    const conflict = rows.find((r) => r.verification_status === "CONFLICTING") ? "Sources disagree (Claude check: conflicting)"
      : rows.find((r) => /^Recently Changed/.test(s(r.employment_status))) ? "May have changed job (employment check)"
      : emails.length > 1 ? `Different emails across sources (${emails.length})`
      : rows.find((r) => /differs from reference/.test(s(r.record_status))) ? "Claude check differs from your sheet" : "";
    const verified = rows.some((r) => r.verification_status === "VERIFIED");
    const trust: Trust = conflict ? "Conflicting" : sources.length >= 2 || verified ? "Confirmed by 2+ sources" : "Single source";
    const reason = conflict || (sources.length >= 2 ? `Agree: ${sources.join(" + ")}` : verified ? `${sources[0]} + official source (Claude verified)` : `Only ${sources[0]}`);
    // Best record: a verified Claude check first, then a sheet row with an email, then the first row. Missing fields are filled from other rows.
    const best = rows.find((r) => r.verification_status === "VERIFIED") || rows.find((r) => r.is_reference && r.email) || rows.find((r) => r.email) || rows[0];
    const pick = (f: string) => s(best[f]) || s(rows.find((r) => s(r[f]))?.[f]);
    const title = s(rows.find((r) => r.is_reference && r.title_verbatim)?.title_verbatim) || pick("title_verbatim");
    out.push({ ...best, title_verbatim: title, email: pick("email"), email_status: s(best.email) ? best.email_status : s(rows.find((r) => s(r.email))?.email_status),
      phone: pick("phone"), linkedin_url: pick("linkedin_url"), contact_tier: pick("contact_tier"), role_family: pick("role_family"),
      person_key: k, rows, sources, trust, trust_reason: reason, best_id: best.id });
  }
  return out;
}
