import "server-only";
import { type AriaContext, searchAccounts, countAccounts, searchContacts, icpRules } from "@/lib/aria/tools";
import { tryFree, table, readable, revenuePhrase, type FreeReply } from "@/lib/aria/router";
import type { Plan } from "@/lib/aria/interpret";

const says = (p: Plan) => [readable(p.filters), revenuePhrase(p.filters), p.filters.industry_contains && `industry: ${p.filters.industry_contains}`, p.filters.name_contains && `name contains "${p.filters.name_contains}"`].filter(Boolean).join(", ");

/** A short confirmation when the reading was not certain: what Aria understood, what it guessed, and what it cannot apply. */
export function confirmation(p: Plan): FreeReply {
  const lines = [`**I read this as:** ${p.summary || says(p) || "your request"}.`];
  if (p.assumptions.length) lines.push(`I assumed: ${p.assumptions.join("; ")}.`);
  if (p.not_supported.length) lines.push(`I cannot apply: ${p.not_supported.join("; ")} (the app cannot filter on that), so it would be left out.`);
  lines.push("Is that right?");
  return { text: lines.join("\n\n"), actions: [], choices: [{ label: "Yes, run it", value: `§plan:${JSON.stringify(p)}` }, { label: "No, let me rephrase", value: "§rephrase" }] };
}

/** Runs a confirmed or confident plan with the app's own tools: the figures always come from the database. null = not a plan Aria can run itself. */
export async function runPlan(p: Plan, ctx: AriaContext): Promise<FreeReply | null> {
  const head = `**I read this as:** ${p.summary || says(p)}.`;
  if (p.intent === "list") {
    const r = searchAccounts(ctx, { ...p.filters, sort_by: p.sort_by, limit: Math.min(p.limit || 15, 25) });
    if (!r.total) return { text: `${head}\n\nNo companies match that.`, actions: [], choices: [] };
    const md = table(["Company", "Country", "ICP status", "Revenue", "ERP", "Platform", "Signal", "Contacts"], r.rows.map((x) => [x.company, x.country, x.icp_status.replace("ICP — ", ""), x.revenue, x.erp, x.s2p_platform, x.signal, x.contacts]));
    return { text: `${head}\n\n**${r.total}** match${r.total > r.shown ? `, showing the ${r.shown} largest by revenue` : ""}:\n\n${md}`, actions: [], choices: [] };
  }
  if (p.intent === "count") {
    const r = countAccounts(ctx, { ...p.filters, group_by: p.group_by });
    return { text: `${head}\n\n**${r.all_accounts}** companies.\n\n${table(["Group", "Prospects", "Existing Coupa customers", "All accounts"], r.groups.map((g) => [g.key, g.prospects, g.existing_coupa_customers, g.all_accounts]))}`, actions: [], choices: [] };
  }
  if (p.intent === "contacts") {
    const r = searchContacts(ctx, { ...p.filters, role: p.role || undefined, limit: 25 } as Parameters<typeof searchContacts>[1]);
    return { text: `${head}\n\n**${r.total}** people${r.total > r.shown ? `, showing ${r.shown}` : ""}:\n\n${table(["Person", "Company", "Title", "Email", "Phone"], r.rows.map((x: Record<string, unknown>) => [x.person, x.company, x.title, x.email, x.phone]))}`, actions: [], choices: [] };
  }
  if (p.intent === "rules") { const r = icpRules(ctx, p.filters.region); return { text: `${head}\n\n${JSON.stringify(r).slice(0, 1500)}`, actions: [], choices: [] }; }
  // company and report: hand a clean sentence to the free router, which already knows the report questions (format, how many, how to pick)
  const sentence = p.intent === "company" && p.company ? `tell me about ${p.company}`
    : p.intent === "report" ? `${p.format === "xlsx" ? "excel contact list" : p.format === "pdf" ? "pdf report" : "report"} for ${(p.filters.icp_status || []).join(" and ").toLowerCase()} companies${p.filters.region ? ` in ${p.filters.region}` : ""}${revenuePhrase(p.filters) ? ` with ${revenuePhrase(p.filters)}` : ""}${p.limit ? `, top ${p.limit}` : ""}` : "";
  if (!sentence) return null;
  const out = await tryFree(sentence, ctx);
  return out ? { ...out, text: `${head}\n\n${out.text}` } : null;
}
