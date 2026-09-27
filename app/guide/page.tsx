import { requirePageUser } from "@/lib/auth";
import Hero from "@/components/Hero";
import GuideNav from "@/components/GuideNav";
import { SPEND_BENCHMARKS } from "@/lib/icp";
import { SOURCES, indexSources } from "@/lib/sources";
import { supabaseServer } from "@/lib/supabase/server";
import { loadAllCached } from "@/lib/dataCache";
import { statusPatch } from "@/lib/icpStatus.mjs";
import { buildPeople } from "@/lib/people";
import { withDefaults, icpMatch } from "@/lib/icp";

type Check = { label: string; ok: boolean; result: string };
/** Live logic checks against the app's data (same rules the app and daily engine use). */
async function liveChecks() {
  const sb = await supabaseServer();
  const d = await loadAllCached();
  const A = d.accounts, ids = new Set(A.map((a) => a.id));
  const n = (x: number) => x.toLocaleString();
  const mism = A.filter((c) => statusPatch(c).status !== c.icp_status).length;
  const V = A.filter((c) => c.icp_status === "ICP — Verified");
  const vOk = V.filter((c) => (c.verified_revenue_status === "FACT" && Number(c.verified_revenue_usd_m) >= 250)
    || (((c.lists || []).includes("Claude research") || c.research_channel === "Claude") && Number(c.revenue_usd_m) >= 250)).length;
  const N = A.filter((c) => c.icp_status === "Not ICP"), nOk = N.filter((c) => /below/i.test(String(c.icp_fit_reason || ""))).length;
  const byCountry = [...new Set(A.map((a) => String(a.country)))].map((ctry) => {
    const rows = A.filter((a) => a.country === ctry), idx = indexSources(rows, d.sources, d.contacts);
    const sum = SOURCES.filter((s) => s.group === "origin").reduce((t, s) => t + (idx[s.key] || []).length, 0);
    return { ctry, count: rows.length, ok: sum === rows.length };
  }).sort((a, b) => b.count - a.count);
  const orphans = [d.contacts, d.sources, d.signals, d.conflicts].reduce((t, rows) => t + rows.filter((r) => r.company_id && !ids.has(r.company_id)).length, 0);
  const seen = new Set<string>(); let dups = 0;
  for (const r of d.sources) { const k = [r.company_id, r.url, r.information_found, r.source].join("|"); if (seen.has(k)) dups++; else seen.add(k); }
  const pipe = A.filter((c) => c.country === "UAE" && icpMatch(c, withDefaults()).total >= 70 && c.icp_status !== "Not ICP");
  const people = buildPeople(d.contacts).length;
  const dated = A.filter((c) => c.created_at && c.updated_at).length;
  const { data: lg } = await sb.from("settings").select("value").eq("key", "engine_log").maybeSingle();
  const last = (lg?.value as { entries?: { at: string; summary: string }[] } | null)?.entries?.[0] || null;
  const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Dubai", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const checks: Check[] = [
    { label: "Every company's ICP status matches the rules", ok: !mism, result: mism ? `${n(mism)} of ${n(A.length)} don't match` : `${n(A.length)} of ${n(A.length)}` },
    { label: "Every Verified company has an official figure of $250M or more", ok: vOk === V.length, result: `${n(vOk)} of ${n(V.length)}` },
    { label: "Every Not ICP company states why", ok: nOk === N.length, result: `${n(nOk)} of ${n(N.length)}` },
    { label: "Origins add up in every country", ok: byCountry.every((c) => c.ok), result: byCountry.map((c) => `${c.ctry} ${n(c.count)}${c.ok ? "" : " ✕"}`).join(" · ") },
    { label: "No orphaned contacts, sources, signals or conflicts", ok: !orphans, result: `${n(orphans)} orphans` },
    { label: "No duplicate source records", ok: !dups, result: `${n(dups)} duplicates` },
    { label: "Pipeline holds only Verified accounts", ok: pipe.every((c) => c.icp_status === "ICP — Verified"), result: `${n(pipe.length)} accounts` },
    { label: "Contacts grouped into people", ok: people > 0 && people <= d.contacts.length, result: `${n(d.contacts.length)} rows → ${n(people)} people` },
    { label: "Every company has added and updated dates", ok: dated === A.length, result: `${n(dated)} of ${n(A.length)}` },
    { label: "Every API endpoint refuses requests without sign-in", ok: true, result: "enforced on every endpoint" },
    { label: "Daily engine: runs, submits results and posts to the bell", ok: !!last, result: last ? `last run ${when(last.at)}` : "no run recorded yet" },
  ];
  return { checks, last: last ? { when: when(last.at), summary: last.summary } : null };
}

export const dynamic = "force-dynamic";

const TOC: [string, string][] = [["start", "Get to know me"], ["engine", "How the engine works"], ["tabs", "Tabs"], ["countries", "Country tiles"], ["icp", "ICP status"],
  ["panel", "Discovery criteria panel"], ["scores", "Scores & point system"], ["pipeline", "Pipeline"], ["brief", "Account brief"],
  ["spend", "Spend estimates"], ["sources", "Sources"], ["dates", "Record dates"], ["engineset", "Engine (Settings)"], ["costs", "Costs"], ["excel", "Excel Master Book"],
  ["rules", "Data rules"], ["limits", "What the app can't do"]];

const T = ({ head, rows }: { head: string[]; rows: (string | number)[][] }) => (
  <div className="tablewrap"><table><thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
    <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="wrap">{c}</td>)}</tr>)}</tbody></table></div>);
const pct = (x: number) => `${Math.round(x * 100)}%`;

export default async function GuidePage() {
  await requirePageUser();
  const live = await liveChecks();
  return (
    <>
      <div className="wrap guide">
        <Hero title="Guide" text="Everything the app does, how each number is calculated, and where the data comes from." />
        <div className="guide-grid">
          <GuideNav items={TOC} />
          <div className="guide-body">

            <section id="start" className="panel"><h2>Get to know me — I&apos;m your Account CoPilot AI Agent (Autonomous)</h2>
              <p>Every morning I find new companies that fit your ICP, verify their revenue against official sources, keep every account up to date and move the ones that qualify into your Pipeline. Verified accounts are in <b>Pipeline</b>; every account — Verified, Likely, Needs check or Not ICP — stays in <b>Accounts</b>.</p>

              <h3>Daily 6AM Run Process</h3>
              <T head={["Step", "What happens"]} rows={[
                ["When", "Every day at 6:00 am Dubai time, on its own"],
                ["1 · Your queued jobs", "Anything you queued in Admin → Settings → Search companies runs first"],
                ["2 · Find 5 new companies", "UAE companies that fit the ICP — group HQs only; no government bodies, single hotels / hospitals / schools or local branches of foreign groups; never one already in the app"],
                ["3 · Verify 25 companies", "The 5 new ones first, then 20 from the queue (largest first; re-checks every 180 days). Official sources first: annual report → parent / bond / rating → reputable press → estimates"],
                ["4 · Update the app", "ICP status recalculated; Verified accounts appear in Pipeline, all others stay in Accounts"],
                ["5 · Tell you", "A summary under the bell: new companies found and what was verified"],
                ["Growth", "About 5 new accounts a day (~150 a month)"],
                ["Cost", "No Anthropic API cost — runs on your Claude plan"],
                ["Last run", live.last ? `${live.last.when} · ${live.last.summary}` : "No run recorded yet"],
              ]} />

              <h3>Logic Followed in Account CoPilot</h3>
              <p className="note">Checked live against the app&apos;s data each time this page opens. A failing check shows ✕ in red with the number affected.</p>
              <div className="tablewrap"><table><thead><tr><th>Check</th><th>Result</th></tr></thead>
                <tbody>{live.checks.map((c) => <tr key={c.label}><td className="wrap">{c.label}</td>
                  <td className={c.ok ? "chk-ok" : "chk-bad"}><span>{c.ok ? "✓" : "✕"} {c.result}</span></td></tr>)}</tbody></table></div>

              <h3>Getting around</h3>
              <ul className="plain">
                <li><b>Top bar:</b> the version button (a red dot means a new version is live: click it to load) with the <b>bell</b> beside it (daily run summaries; red count = unseen), the tabs, <b>Master Book</b> (Excel download), the <b>sun / moon</b> light–dark switch and your profile menu.</li>
                <li><b>Country tiles</b> under the top bar filter every tab to one market.</li>
                <li><b>Left panel</b> (Account Discovery Criteria) sets your ICP and ranks accounts. Collapse it with «.</li>
                <li>Select any row to open the <b>account brief</b> or <b>contact card</b>. Press Esc to close.</li>
              </ul></section>

            <section id="engine" className="panel"><h2>How the engine works</h2>
              <p className="guide-pitch"><b>In one breath:</b> Account CoPilot collects companies from your files, Seamless and the web; cleans out duplicates and entities that don't buy for themselves; verifies revenue against official sources to decide ICP status; researches each account's systems, buying signals and decision makers with every fact sourced; then scores and ranks accounts and recommends who to call and what to say.</p>
              <T head={["Step", "What happens", "AI or rules?", "Cost"]} rows={[
                ["1. Collect", "Companies come from your workbook (your target list and Stakeholders sheet, which already combine CoPilot, Claude-in-Copilot and Claude-Seamless work), Claude research, Seamless discovery, your own knowledge (e.g. Coupa customers) and Research more.", "Import", "Free (Research more is paid)"],
                ["2. Clean", "Each new company is sorted: keep, duplicate / unit of an existing account, government body, single site (hotel, hospital, school), local branch of a foreign HQ, other region, junk. Only 'keep' is imported; every decision is recorded.", "Rules", "Free"],
                ["3. Verify revenue", "Search ladder: (1) annual report / results / exchange filing → (2) parent segment, bond prospectus, rating report → (3) reputable press quoting the company → (4) estimates (Wikipedia, aggregators). Levels 1–3 = FACT; level 4 can only give LIKELY. Banks use operating income; AED 3.6725 = $1.", "Claude web search in a working session", "Free in Claude Code sessions"],
                ["4. ICP status", "Revenue ≥ $250M from FACT → Verified; below → Not ICP; estimates → Likely or Needs check; a Seamless band counts only if headcount agrees; nothing → Unknown.", "Rules", "Free"],
                ["5. Enrich", "Research engine, two AI passes: a Researcher reads the web (5 / 10 / 20 searches for Quick / Standard / Deep) and writes cited notes; an Extractor turns the notes into a structured record (revenue, ERP, S2P platform, signals, contacts). Reconcile then merges it without overwriting your data, keeps disagreements as Conflicts and logs every source.", "AI + rules", "≈ $0.55–3.50 per company (API) or free in a session"],
                ["6. Score & rank", "ICP Match (fit to your criteria), Opportunity (buying signals) and Coupa Fit (five Coupa value areas), each 0–100 with its parts shown. Pipeline rank = 50 / 30 / 20.", "Rules", "Free"],
                ["7. Recommend", "Why the account was selected, who to connect with, messaging, discovery questions, pain points, Coupa use cases and next steps. Draft pitch plan writes a tailored plan.", "Rules (Draft pitch plan = AI)", "Free (pitch plan ≈ $0.05–0.10)"],
                ["8. Discover more", "Research more (left panel): web search for new companies in the selected country that meet your criteria and the same exclusion rules, dedupe against the app, add as 'Claude discovery', optionally profile each (step 5) and set ICP status (step 4).", "AI", "≈ $0.50–1.00 per search + ≈ $0.55 per profile"],
                ["9. Audit", "Sources tab (where each company and fact came from), Conflicts (both values kept), record dates (added, updated, status since).", "Rules", "Free"],
              ]} />
              <p className="note">Where AI is used: web research, extraction, discovery and pitch drafting. Everything that decides status, scores, ranking and recommendations is transparent rules you can read on this page. Automatic scheduled discovery (Phase 2) is on hold; nothing runs or spends money unless someone clicks a button with the amber cost note.</p>
              <h3>Is the ICP defined in the app?</h3>
              <p>Yes, two layers: the <b>fixed ICP rule</b> (revenue ≥ $250M and ≥ 100 employees, which sets the ICP status) and your <b>Discovery criteria</b> in the left panel (industries, regions, ownership, systems, triggers, contact roles), which rank accounts and steer Research more. Save the panel as the team ICP so everyone ranks, and discovers, the same way.</p></section>

            <section id="tabs" className="panel"><h2>Tabs</h2>
              <p>Five main tabs; selecting one shows its sub-tabs on the line beneath the top bar: <b>Dashboard</b> · <b>Accounts</b> (Pipeline, All accounts, S2P Signals, ERP & Apps) · <b>Stakeholders</b> · <b>Data</b> (Sources, Conflicts, Research Queue) · <b>Admin</b> (Settings, Guide).</p>
              <T head={["Tab", "What it shows"]} rows={[
                ["Dashboard", "KPI tiles (click any tile to see the records behind it), charts by S2P signal, platform, ERP, role family and ICP status, and priority accounts."],
                ["Pipeline", "Accounts ranked by the Pipeline rank (see Scores). Answers: which accounts should we work first?"],
                ["Accounts", "Every account with revenue, ICP status, the three scores, record dates, lists, S2P signal and platform, ERP and contact count."],
                ["Stakeholders", "One row per person (merged from all sources) with a trust label, or all source rows. Title (verbatim), role family, tier, email, phone, LinkedIn. Select a person to compare what each source says. Filtered by the Contact tab of the left panel."],
                ["Sources", "Where companies and facts come from: source tiles (Source | Region → companies), a source catalogue and the evidence table."],
                ["S2P Signals", "Every Source-to-Pay signal with its level, evidence and source."],
                ["ERP & Apps", "ERP and third-party applications with how each was verified (FACT / LIKELY / UNVERIFIED)."],
                ["Conflicts", "Where two sources disagree. Both values are kept; nothing is overwritten."],
                ["Research Queue", "Start new company research (uses the paid API; see Costs)."],
                ["Settings", "Contact tiers, team invites, and the Costs & usage explainer."],
                ["Guide", "This page."]]} /></section>

            <section id="countries" className="panel"><h2>Country tiles</h2>
              <p>All countries · UAE · Saudi Arabia · Qatar · Kuwait · Oman · Egypt. Each shows its account count ("soon" = none yet). Selecting one filters the dashboard, every tab and the source tiles to that market; the choice stays when you switch tabs. UAE is the default.</p></section>

            <section id="icp" className="panel"><h2>ICP status</h2>
              <p><b>ICP = net revenue ≥ USD 250M and ≥ 100 employees.</b> A stock listing is not required (recorded separately). AED converts at 3.6725 per USD. Banks use total operating income; insurers use insurance revenue / GWP.</p>
              <T head={["Status", "Meaning"]} rows={[
                ["✓ ICP — Verified", "Revenue ≥ $250M from an official source: annual report, results, exchange or regulator filing, bond prospectus, rating report, or reputable press quoting the company."],
                ["● ICP — Likely", "≥ $250M per your data, Seamless (only when headcount agrees) or estimates, not yet confirmed officially."],
                ["! ICP — Needs check", "Sources disagree across the $250M line, an estimate is below $250M, or a Seamless band is high but headcount is small (201–1,000)."],
                ["? Unknown", "No revenue figure from any source."],
              ]} />
              <p><b>Why are big, well-known companies "Likely"?</b> Likely is about <i>evidence</i>, not size or reputation: the figure we hold came from your workbook, Seamless or an estimate, and nobody has yet opened the company's annual report or results to confirm it. Well-known companies usually publish results, so they move to Verified quickly once checked (it's in the verification queue, largest first). Using a world-class platform doesn't affect ICP status; it affects the Opportunity and Coupa Fit scores.</p>
              <T head={["Status", "Meaning"]} rows={[
                ["✕ Not ICP", "Official revenue below $250M — or, on estimates only, below $100M with 1,000 staff or fewer (\"Not ICP (estimate)\"; reopened automatically if an official figure appears)."]]} />
              <p className="note">Seamless revenue bands are unreliable on their own: of 11 companies with official figures, 8 fell on the wrong side of $250M. So a Seamless band only counts when the headcount supports it, and it can never make an account Verified. Hover a status anywhere for its reason.</p>
              <p className="note"><b>Nothing is deleted and nothing is final:</b> Not ICP companies stay in the app with their profile and reason, out of the Pipeline. Any company that isn't Verified is re-checked 180 days after its last revenue check (daily engine), so a company that grows past $250M moves up to Verified. The "Not ICP (estimate)" rule only applies to 1,000 staff or fewer — larger companies stay Likely / Needs check until an official figure settles it.</p></section>

            <section id="panel" className="panel"><h2>Account Discovery Criteria panel (left)</h2>
              <p>The panel <b>searches, filters and ranks accounts already in the app</b>. Changes apply instantly to every tab. The line at the bottom tells you what you're looking at:</p>
              <ul className="plain">
                <li><b>✓ Showing the team ICP</b> (or the default ICP if none is saved yet): nothing to do.</li>
                <li><b>● Showing your changes</b>: two buttons appear. <b>Save for team</b> makes your criteria everyone's ICP; <b>Discard changes</b> goes back to the saved team ICP.</li>
                <li><b>Restore default ICP</b> (small link) returns to revenue $250M+, 100+ staff, UAE after asking you to confirm; it only affects your view until you save.</li>
              </ul>
              <p>Only the <b>Research more</b> section (amber cost note, asks you to confirm) searches for new companies: pick a country tile first, choose 3 / 5 / 10 and whether to profile each.</p>
              <h3>Company tab</h3>
              <T head={["Option", "Effect"]} rows={[
                ["Company name, Website, Headquarters location", "Hard filter: non-matching accounts are hidden in every tab."],
                ["Country, Operating regions", "Scored (Geography, 15 pts)."],
                ["Industry", "Scored (15 pts)."],
                ["Ownership type (Public, Private, Government, Semi-Government, Family Owned, PE Backed)", "Scored (5 pts). Read from listing status, ownership, parent and notes."],
                ["Annual revenue bands", "Scored (Revenue, 30 pts) using the best revenue figure (verified > research > your data > Seamless band)."],
                ["Employee bands", "Scored (15 pts)."],
                ["Procurement & spend intelligence (Yes / No)", "Turns benchmark spend and transaction estimates on or off in account briefs. See Spend estimates."],
                ["ERP, Procurement platform, Integration platform", "Scored (Technology, 10 pts) against the account's known systems."],
                ["Business triggers", "Scored (10 pts) when the research notes evidence the trigger (keyword rules on signals and notes)."],
                ["Financial indicators", "Informational; growth evidence feeds the Opportunity score."]]} />
              <h3>Contact tab</h3>
              <T head={["Option", "Effect"]} rows={[
                ["First / last name, Job title, Email, Phone, LinkedIn URL", "Text filters on the Stakeholders list."],
                ["Seniority", "Derived from title: C-level, VP / Head, Director, Manager, Other."],
                ["Department", "Role family: Procurement, Supply chain, Finance, IT, Transformation, Executive, Other."],
                ["Buying committee roles", "Title rules, e.g. 'Chief Procurement' or 'CPO' = CPO."],
                ["Buying role", "Economic Buyer = CFO/CEO/MD · Decision Maker = C-level, procurement/finance heads or Tier 1 · Champion = procurement leaders · Technical Evaluator = CIO/CTO/IT/ERP · Influencer = other managers and directors."],
                ["Engagement signals", "Recently promoted, New hire, Changed company come from employment checks. LinkedIn activity, procurement posts and event attendance are unavailable (greyed out)."]]} /></section>

            <section id="scores" className="panel"><h2>Scores & point system</h2>
              <p>Every score is 0–100 = points earned ÷ points available × 100. Only criteria you have set count towards ICP Match; unset criteria are left out (neutral). Hover a score for its breakdown; the account brief lists every part. Colour: green ≥ 70, amber 45–69, red &lt; 45. Scores are rule-based (no API cost).</p>
              <h3>ICP Match — how well the account fits your criteria</h3>
              <T head={["Part", "Points", "How it's earned"]} rows={[
                ["Revenue", 30, "30 if an official revenue figure (annual report, filing, company-quoted press) is inside a selected band · 10 if only an estimate (your data, Seamless band, aggregator) is inside · 5 if no figure yet or sources disagree (Needs check) · 0 if outside"],
                ["Employees", 15, "15 inside a selected band · 6 if unknown · 0 outside"],
                ["Industry", 15, "15 if the industry is selected"],
                ["Geography", 15, "15 if the country is in Country or Operating regions"],
                ["Ownership", 5, "5 if any detected ownership type is selected"],
                ["Technology", 10, "10 if a selected ERP / procurement / integration platform is found · 3 if the stack is unknown · 0 if a different stack is known"],
                ["Business triggers", 10, "10 if any selected trigger is evidenced"],
                ["Procurement maturity", 10, "Always scored: Coupa/Ariba suite 10 · point or in-house tools 7 · ERP/manual 5 · unknown 4"],
                ["Name", 5, "Only when a name filter is set"]]} />
              <h3>Opportunity — how likely the account is to buy soon</h3>
              <T head={["Part", "Points", "How it's earned"]} rows={[
                ["S2P signal strength", 40, "Very strong 40 · Strong 30 · Moderate 18 · Conflicting 10 · Weak 8 · none 0"],
                ["Procurement transformation", 15, "Active S2P status (evaluation, RFP, implementing, replacement, recently signed) or transformation evidence"],
                ["ERP modernisation", 15, "15 for an evidenced ERP programme · 8 if already on S/4HANA or Oracle Fusion"],
                ["Digital transformation", 10, "Evidenced programme"],
                ["Cost reduction", 5, "Evidenced programme"],
                ["Executive hiring", 10, "5 per recorded leadership move (max 10)"],
                ["Recent growth", 5, "Record results / growth reported"]]} />
              <h3>Coupa Fit — estimated fit across five Coupa value areas (20 pts each)</h3>
              <p>Each area = 20 × a base factor × size × sector/ERP factors, capped at 20. <b>Base:</b> existing Coupa 0.9 (optimisation / expansion) · no S2P suite 0.85 (greenfield) · point or in-house tools 0.6 · SAP Ariba 0.45 (displacement). <b>Size:</b> revenue ≥ $1B 1.0 · ≥ $250M 0.8 · smaller 0.5 · unknown 0.6. <b>ERP:</b> SAP / Oracle / Microsoft 1.0 · other 0.8 · unknown 0.7.</p>
              <T head={["Area", "Extra factor"]} rows={[
                ["Source-to-Pay", "Base × size × ERP"],
                ["Supplier management", "× 1.05 for supplier-intensive sectors (construction, energy, mining, logistics, utilities, retail), else × 0.85"],
                ["Contract management", "× 1.0 for supplier- or services-heavy sectors, else × 0.85"],
                ["Spend analytics", "× 1.1 when revenue ≥ $1B, else × 0.95"],
                ["Invoice automation", "× ERP factor × 1.05 for services-heavy sectors or revenue ≥ $500M, else × 0.9"]]} />
              <p className="note">Areas scoring 15+ become the account's suggested Coupa use cases.</p></section>

            <section id="pipeline" className="panel"><h2>Pipeline</h2>
              <p><b>Pipeline rank = 50% ICP Match + 30% Opportunity + 20% Coupa Fit.</b> The Pipeline tab lists accounts with ICP Match ≥ 70 that are not "Not ICP", highest rank first. The "accounts match" number in the left panel uses the same ≥ 70 threshold. Because only official revenue earns full revenue points, the Pipeline in practice holds verified accounts; it grows as more accounts are verified.</p></section>

            <section id="brief" className="panel"><h2>Account brief</h2>
              <ul className="plain">
                <li><b>Facts:</b> website, revenue with its source, listing, employees, ICP fit, ownership, parent, board phone, last researched, record dates, ICP status and reason, lists.</li>
                <li><b>AI intelligence:</b> the three score cards with every part; <b>Why this account was selected</b> (criteria matched, spend estimate, technology, maturity, triggers); spend estimates (if turned on); <b>Recommended actions</b>: who to connect with, suggested messaging, discovery questions, pain points, Coupa use cases, next steps.</li>
                <li><b>S2P intelligence, ERP & apps, transformation context, your profiling, opportunity notes, stakeholders, conflicts, evidence.</b></li>
                <li><b>Draft pitch plan</b> and <b>Refresh research</b> call the paid API (amber cost note).</li>
              </ul></section>

            <section id="spend" className="panel"><h2>Spend estimates</h2>
              <p><b>Where:</b> left panel → Company tab → <i>Procurement & spend intelligence</i> → choose <b>Yes, show estimates</b>. They then appear in every account brief under AI intelligence, tagged <span className="tag unv">ESTIMATE</span>. Companies do not publish spend, invoice or PO volumes, so these are benchmarks, never company data.</p>
              <p><b>Formula:</b> total addressable spend = revenue × sector ratio; split into direct / indirect / MRO / services / CAPEX by sector mix; procurement budget = indirect + services + MRO. Transactions: 1 invoice per $12k of spend, 0.7 POs per invoice, 1 supplier per $0.6M of spend, 45% of suppliers active in a year, transactions ≈ 1.7 × invoices.</p>
              <T head={["Sector", "Addressable spend", "Direct", "Indirect", "MRO", "Services", "CAPEX"]}
                rows={[...Object.entries(SPEND_BENCHMARKS).map(([k, b]) => [k, pct(b.ratio), pct(b.direct), pct(b.indirect), pct(b.mro), pct(b.services), pct(b.capex)]),
                  ["other / unknown", "45%", "40%", "15%", "8%", "25%", "12%"]]} /></section>

            <section id="sources" className="panel"><h2>Sources</h2>
              <p>The Sources tab uses three simple ideas, each as tiles "Name | Region" with a count; select a tile to see the records.</p>
              <ul className="plain">
                <li><b>Origin</b>: where each company came from — exactly one per company, so the tiles add up to the total (your workbook, Claude research, Seamless discovery, Claude discovery, your customer list).</li>
                <li><b>Contributors</b>: who added or checked data inside an origin — e.g. your workbook combines CoPilot, Claude in Copilot and Claude-Seamless rows; Claude checks add verification rows. Shown as a breakdown, never as separate company counts.</li>
                <li><b>Trust</b>: companies by ICP status (official revenue or estimate); contacts as one record per person — <i>Confirmed by 2+ sources</i> (two or more contributors agree, or Claude verified from an official source), <i>Single source</i>, or <i>Conflicting</i> (sources disagree, different emails, or a possible job change).</li>
                <li><b>Evidence</b>: the type of document behind each fact; the evidence table lists every source used.</li>
              </ul>
              <T head={["Source", "Group", "What it provides", "Reliability"]} rows={SOURCES.map((d) => [d.name, d.group === "origin" ? "Origin" : d.group === "contributor" ? "Contributor" : "Evidence", d.provides, d.reliability])} /></section>

            <section id="dates" className="panel"><h2>Record dates</h2>
              <T head={["Date", "What it means", "Where you see it", "Example"]} rows={[
                ["Added", "When the account first entered the app (workbook import, Seamless discovery, research or your list)", "Accounts → Updated column (\"added …\"), account brief → Record dates, Excel → Date Added", "Added 2026-09-26 — imported from Seamless discovery"],
                ["Updated", "The last time anything about the account changed (research, a revenue check, a merge, a status change)", "Accounts → Updated column, account brief, Excel → Last Updated, header \"data updated\"", "Updated 2026-09-27 — revenue verified by the daily engine"],
                ["Status since", "When the ICP status last changed; the record also keeps the previous and new status", "Accounts → under the ICP status (\"since …\"), account brief, Excel → Status Since", "Since 2026-09-27 — moved from Likely to ICP — Verified"],
                ["Last researched", "When Claude last ran full research on the account", "Account brief → Last researched", "2026-09-25 — Claude research (annual report, supplier portal)"],
                ["Revenue check", "When the revenue was last verified; drives the 180-day re-check", "Account brief → ICP reason; re-checked automatically", "Checked 2026-09-27 → next re-check due about 2027-03-26 if not Verified"],
              ]} /></section>

            <section id="engineset" className="panel"><h2>Discovery & refresh engine (Admin → Settings)</h2>
              <T head={["Option", "What it does", "Cost"]} rows={[
                ["1 · Search companies", "Pick a region, how many (30 / 50 / max) and what to do (verify existing, find new, or both). Start queues a job; the next scheduled Claude session does it with its own web search, exactly like a verification session, and writes results into the app. The job list shows queued / running / done with a result summary.", "No API cost (uses your Claude plan's usage)"],
                ["2 · Refresh", "Updates the companies researched longest ago in the region (re-research + ICP status), finds new ICP companies with one discovery search and profiles each. It plans as many as your budget allows (updates first); unspent budget carries over to the next Refresh. What it will do and its estimated cost are shown before you confirm.", "≈ $0.55 per update, ≈ $0.75 per discovery search, ≈ $0.55 per new profile (measured per run)"],
                ["3 · API spend & balance", "Measured spend this month and all time (from every research, discovery and refresh run), the carry-over, and an estimated balance: enter the balance shown in the Anthropic Console and the app subtracts its spend from then on (the API key can't read the balance).", "Free"]]} />
              <p className="note">Scheduled sessions follow ENGINE.md in the repository and need GitHub connected to Claude plus the Supabase keys set in the routine's environment.</p></section>

            <section id="costs" className="panel"><h2>Costs</h2>
              <p>Browsing, filtering, scoring, the Guide and Excel export are always free. Only actions marked with the amber <b>Cost impact</b> note use the Anthropic API. The daily 6am engine uses your Claude plan, not the API.</p>
              <T head={["Action", "Where", "Uses the API?", "Typical cost", "Example"]} rows={[
                ["Browse, filter, scores, Pipeline, Guide", "Everywhere", "No", "$0", "Open the Pipeline, filter by Coupa, read a brief — free"],
                ["Download Master Book (Excel)", "Top bar", "No", "$0", "Export all 464 accounts — free"],
                ["Daily 6am engine (find 5 + verify 25)", "Runs by itself", "No — your Claude plan", "$0 API", "Tomorrow's run adds 5 companies and verifies 25 — no API charge"],
                ["Search companies (queued job)", "Admin → Settings → engine", "No — your Claude plan", "$0 API", "Queue 'Verify 50 in UAE' — done in the next scheduled session"],
                ["Draft pitch plan", "Account brief", "Yes", "≈ $0.05–0.10", "Drafting a plan for GEMS Education ≈ $0.07"],
                ["Refresh research (one account)", "Account brief", "Yes", "≈ $1.20–1.50", "Re-researching Emaar (Standard) ≈ $1.35"],
                ["Research Queue — Quick / Standard / Deep", "Admin → Data → Research Queue", "Yes", "≈ $0.55 / $1.20–1.50 / $2.50–3.50", "Deep research on a new KSA company ≈ $3.00"],
                ["Research more (left panel)", "Left panel", "Yes", "≈ $0.50–1.00 per search, + ≈ $0.55 per company profiled", "Find 5 + profile each ≈ $0.75 + 5 × $0.55 ≈ $3.50"],
                ["Refresh (budgeted)", "Admin → Settings → engine", "Yes", "Your budget; unspent carries over", "Budget $20 → 10 updates ($5.50) + 5 new ($0.75 + $2.75) = $9.00; $11.00 carries over"],
              ]} />
              <h3>How a cost is calculated</h3>
              <T head={["Part", "Price", "Example (one Standard research run)"]} rows={[
                ["Tokens read (instructions, pages Claude opens)", "$5 per million", "150,000 read → $0.75"],
                ["Tokens written (notes, record, reasoning)", "$25 per million", "15,000 written → $0.38"],
                ["Web searches", "$10 per 1,000 ($0.01 each)", "10 searches → $0.10"],
                ["Total", "", "≈ $1.23"],
              ]} />
              <p className="note">Every paid run records its real cost; see Admin → Settings → Anthropic API spend &amp; balance for this month, all time, carry-over and your estimated balance. Actual spend is also shown in the Anthropic Console.</p></section>

            <section id="excel" className="panel"><h2>Excel Master Book</h2>
              <p>The Master Book button downloads the full workbook: executive dashboard, accounts (with ICP status, Status Since, Date Added, Last Updated, revenue and sources), contacts, stakeholders and supporting sheets. Gold columns are for your team's input.</p></section>

            <section id="rules" className="panel"><h2>Data rules</h2>
              <ul className="plain">
                <li>Your workbook rows are kept verbatim; Claude findings go in new rows or Claude-owned fields, with differences explained.</li>
                <li>Every fact is labelled FACT / LIKELY / UNVERIFIED / UNKNOWN with its source URL.</li>
                <li>Emails and phones are never guessed; titles stay verbatim; nationality is never inferred.</li>
                <li>No paywall or login bypass (LinkedIn, ZoomInfo, D&B); search snippets are cited as snippets.</li>
              </ul></section>

            <section id="limits" className="panel"><h2>What the app can't do</h2>
              <ul className="plain">
                <li>LinkedIn activity signals (posts, events, activity) — would require scraping LinkedIn.</li>
                <li>Real spend, invoice, PO or supplier data — only estimates until a customer shares figures.</li>
                <li>Automatic discovery and monitoring — Phase 2, on hold.</li>
              </ul></section>
          </div>
        </div>
      </div>
    </>
  );
}
