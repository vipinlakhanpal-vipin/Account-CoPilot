import type { SupabaseClient } from "@supabase/supabase-js";
import { isNoiseApp } from "@/lib/techApps";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;
export type AllData = {
  accounts: Row[]; contacts: Row[]; signals: Row[]; sources: Row[]; conflicts: Row[]; apps: Row[]; history: Row[]; runs: Row[];
  /** Excel lists uploaded in the Setup wizard (settings.uploaded_lists), with how many rows were new and how many were already in the app. */
  uploads: Row[];
};

// Pages of 1,000 rows are requested three at a time, so a table of 1,800 rows costs one round trip instead of two.
async function fetchAll(sb: SupabaseClient, table: string, order = "created_at"): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 3000) {
    const pages = await Promise.all([0, 1000, 2000].map(async (off) => {
      const { data, error } = await sb.from(table).select("*").order(order, { ascending: true }).range(from + off, from + off + 999);
      if (error) throw new Error(`${table}: ${error.message}`);
      return data || [];
    }));
    for (const pg of pages) out.push(...pg);
    if (pages[2].length < 1000) break;
  }
  return out;
}

/** Loads every table and shapes rows for the UI and the export (company_id + company name on each row). */
export async function loadAll(sb: SupabaseClient): Promise<AllData> {
  const [companies, contacts, signals, sources, conflicts, apps, history, runs] = await Promise.all([
    fetchAll(sb, "companies"), fetchAll(sb, "contacts"), fetchAll(sb, "s2p_signals"), fetchAll(sb, "sources"),
    fetchAll(sb, "conflicts"), fetchAll(sb, "technology_evidence"), fetchAll(sb, "employment_history"),
    fetchAll(sb, "research_runs", "started_at"),
  ]);
  const { data: upSetting } = await sb.from("settings").select("value").eq("key", "uploaded_lists").maybeSingle();
  const uploads = ((upSetting?.value as { items?: Row[] } | null)?.items || []).map((u) => {
    const m = String(u.summary || "").match(/(\d+)\s*added[^\d]*(\d+)\s*already/i); // the summary the daily run (or a local session) wrote: "N added, M already in the app"
    return { id: u.id, filename: u.filename, region: u.region, rows: u.rows, status: u.status, uploaded_at: u.uploaded_at, added: m ? Number(m[1]) : null, already: m ? Number(m[2]) : null };
  });
  const byId = new Map(companies.map((c) => [c.id, c]));
  const withCo = (r: Row) => ({ ...r, company: r.company ?? byId.get(r.company_id)?.company_name ?? "" });
  const accounts = companies.map((c) => ({ ...c, company_id: c.id }));
  const people = contacts.map((p) => {
    const a = byId.get(p.company_id) || {};
    return {
      ...p, company: a.company_name ?? "", company_website: a.company_website ?? "",
      existing_s2p_product: a.existing_s2p_product, s2p_platform_status: a.s2p_platform_status,
      account_s2p_signal: a.s2p_signal_level, coupa_opportunity_type: a.coupa_opportunity_type,
      ariba_opportunity_type: a.ariba_opportunity_type, notes_company: a.s2p_strong_signals || a.account_notes || "",
    };
  });
  const erp = companies.map((c) => ({ company_id: c.id, company: c.company_name, name: c.erp || "Unknown", category: "ERP (core)",
    status: c.erp_status, evidence: c.erp_evidence, source_url: "" }));
  return {
    accounts, contacts: people, signals: signals.map(withCo), sources: sources.map(withCo),
    conflicts: conflicts.map((r) => ({ ...r, company: byId.get(r.company_id)?.company_name ?? "" })),
    apps: [...erp, ...apps.filter((x) => !isNoiseApp(x)).map(withCo)], history: history.map((h) => ({ ...h })), runs: runs.reverse(), uploads,
  };
}
