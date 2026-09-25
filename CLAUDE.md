# Account CoPilot — project briefing for Claude Code

B2B procurement-intelligence app for a Coupa / SAP Ariba implementation and managed-services partner (SCP, Supply Chain Partner) targeting UAE accounts, with KSA, Qatar, Kuwait, Oman and Egypt to follow.

- **Live app:** https://account-copilot.vercel.app (Vercel, auto-deploys from `main`)
- **Repo:** https://github.com/vipinlakhanpal-vipin/Account-CoPilot. It is **public**, so never commit contact data (see `.gitignore`).
- **Database:** Supabase project `zmezqmkszokuvceazllp`. Keys live in `.env.local` (git-ignored): `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `ANTHROPIC_API_KEY`.
- **Stack:** Next.js 15 (`app/`, `components/`, `lib/`), Supabase, exceljs export, Claude Opus 5 research engine (`lib/research/`).
- **Local Node is 18.** Run scripts and builds with Node 22 via npx: `npx -y -p node@22 node <script>`, and build with `npx -y -p node@22 node node_modules/next/dist/bin/next build`.

## Releasing
Bump `APP_VERSION` in `lib/version.ts` (1.9 → 1.10 …), add a line to `RELEASES`, build, commit, `git tag -a v1.x`, `git push origin main --tags`. The in-app Refresh button shows a red badge when a new version is live. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Data rules (the user insists on these)
- **Never overwrite reference data.** Rows from the user's workbook (`FINAL-UAE-Target-LIST-V3.1-SEP-2026.xlsx`: Vipin-Profiling, UAE Targets v3, Stakeholders) are kept verbatim. Channel-state values such as CoPilot or Claude-Seamless are theirs.
- Claude findings go in **new rows** (`channel_state = "Claude"`) or Claude-owned fields (`claude_check`, `icp_status`, `icp_fit_reason`, `verified_revenue_*`, `listing_status`). Explain any difference in the notes.
- Never invent or pattern-guess emails or phones. No generic mailboxes or personal domains. Titles stay verbatim. Never infer nationality.
- Label evidence FACT / LIKELY / UNVERIFIED / UNKNOWN and keep the source URL for every fact.
- Don't bypass paywalls or logins (D&B, ZoomInfo, Refinitiv, LinkedIn). Search-result snippets may be cited as snippets only.

## ICP definition (current)
**Net revenue ≥ USD 250M and ≥ 100 employees. A stock listing is NOT required**; record it separately in `listing_status`. Convert AED at 3.6725 per USD.

Status scale (`companies.icp_status`), recomputed by `scripts/recompute_icp.mjs`:
- `ICP — Verified`: revenue ≥ 250 from an official source (annual report, results, regulator/exchange filing, bond prospectus, rating report, reputable press quoting the company)
- `ICP — Likely`: ≥ 250 per the user's data, Seamless or estimates only
- `ICP — Needs check`: sources disagree across the $250M line
- `Unknown`: no figure from any source
- `Not ICP`: below 250

## Current task: ICP revenue verification (no API cost)
The goal is to move accounts out of Likely / Needs check / Unknown by finding official revenue figures with **this session's own web search**. Don't use `verify_revenue.mjs` without `--apply`: that path spends the user's Anthropic API credit.

1. Refresh the queue: `npx -y -p node@22 node scripts/export_revenue_queue.mjs` → `data/verification/revenue_queue.json`, in priority order: Needs check, Unknown, then Likely by size.
2. For each company, search in this order:
   1. listed-company annual report or results (ADX, DFM, Nasdaq Dubai, or a foreign exchange)
   2. parent's segment disclosure, bond/sukuk prospectus, credit-rating report
   3. official press release or reputable business press (Forbes Middle East, Arabian Business, Zawya, The National, Gulf News, Reuters, Bloomberg)
   4. estimates (Wikipedia, aggregators); these can only make it LIKELY

   Private family groups usually publish nothing. Record them as LIKELY with the best estimate and say so. Don't burn searches on them once two queries find nothing official.
3. Write one file per company to `data/verification/revenue/<slug>.json` with exactly these keys:
   ```json
   {"slug":"","company_name":"","checked_at":"ISO date","listing_status":"Listed|Private|Government-owned|Subsidiary of listed group|Unknown",
    "exchange":"","ticker":"","parent_company":"","net_revenue_usd_m":null,"fiscal_year":"",
    "revenue_type":"Net revenue|Gross revenue|Total operating income|Estimate|Not found","revenue_local":"e.g. AED 12.3bn",
    "source_name":"","source_url":"","source_kind":"Company report/website|Parent or bond disclosure|Business press|Estimate/aggregator|None",
    "revenue_status":"FACT|LIKELY|UNVERIFIED|UNKNOWN","employees":"","employees_source_url":"",
    "icp_verdict":"Verified ICP|Likely ICP|Below $250M|Revenue not found","reasoning":"what you found and why"}
   ```
   `icp_verdict` is "Verified ICP" only with `revenue_status` FACT and revenue ≥ 250. For banks use total operating income; for insurers use insurance revenue or GWP, and say which.
4. After every ~10 companies, load the results and refresh the statuses:
   `npx -y -p node@22 node scripts/verify_revenue.mjs --apply && npx -y -p node@22 node scripts/recompute_icp.mjs`
5. When the session's web-search allowance runs out, stop and report progress. The next session resumes from the queue, which skips companies already done.

## Other pipelines
- Research new companies (in-app, uses the API): Research Queue page → `app/api/research` → `lib/research/engine.ts` + `reconcile.ts`.
- Seamless.ai (Claude connector): contact enrichment and verification (`scripts/build_verification.py` → `scripts/apply_verification.mjs`). The user approved credit use; check `get_credits` before and after.
- Reference workbook import: `scripts/import_reference_lists.py` → `scripts/seed_reference.mjs`.
- Known data issue: in the user's Stakeholders sheet, the Company column is shifted by 1–2 rows in patches (rows 17–648). Verification rows marked "Claude — corrected company (sheet row shift)" hold the right company.

## Open items (as of v1.11, 2026-09-25)
- **Revenue verification queue:** 39 of 145 checked (as of v1.11). All Needs check / Unknown accounts done; the next session starts on Likely by size (ADNOC first). Session 2026-09-25 results (37 companies): 6 Verified, 13 Likely, 6 Not ICP, 11 still Needs check (no official figure: Khazna, Moro Hub, Crescent Petroleum, Stanford Marine, UNEC, Union Iron & Steel, Al Islami, Sky Jewellery, Gulf Data Hub, Royal Development, Liwa), 1 Unknown (MBF Group). Borderline: NBQ $246M, Al Rawabi $239M, DRC $239M (Not ICP); Amanat $254M, Conares $272M (Verified). "Saeed Ahmed Lootah & Sons" looks like a duplicate of SS Lootah Group; ask the user before merging.
- **Status rules in `recompute_icp.mjs`:** only FACT figures give Verified/Not ICP; LIKELY and UNVERIFIED estimates give Likely (≥250) or Needs check (<250). Revenue-check notes are kept in `profile["Revenue check"]`; every status change is stamped in `profile["Status changed"]` and `updated_at`.
- **User-confirmed platform customers:** the user's own Coupa customer list (UAE, KSA, Kuwait, Qatar) lives in `data/seed/coupa_customers.json` (git-ignored; never put customer names in this public repo). Apply or re-apply with `node scripts/apply_customer_list.mjs data/seed/coupa_customers.json` then `recompute_icp.mjs`. It's safe to re-run. Existing accounts get Coupa / Confirmed Current / VERY STRONG plus a signal and a source, and the earlier research finding is kept as a conflict. Missing companies are added as channel "User" with list "Coupa customers (Vipin)". When adding a new region, match accounts against this list first.
- **Seamless discovery (not yet imported, awaiting the user's go-ahead):** a free Seamless search for UAE + revenue ≥ $500M + 200+ staff returned 774 companies. Of the first 500, 386 are not in the app (saved in `data/verification/seamless_discovery.json`). Before importing, clean out ministries/government bodies (or tag them separately), single hotels, local branches of foreign groups and duplicates. Import as list "Seamless discovery", status ICP — Likely.
- **Sources not available:** LinkedIn / Sales Navigator (no login access; public search snippets only), Copilot (no integration; its data arrives only via the user's workbook), ZoomInfo / D&B / Refinitiv (paid, not connected; the user may send exports).
- **Settings page:** tiers, team invites (temporary password or email invite), Costs & usage guide. Profile menu in the header.
- **LinkedIn coverage:** 727 of 835 unique contacts have a LinkedIn URL. The user asked to use their LinkedIn login to collect the rest. That was declined (LinkedIn ToS / account risk). Instead, fill the 108 gaps via Seamless `research_contacts` (≈1 credit each; ~50 are "Not publicly identified" placeholders that can't be looked up) or a Sales Navigator export the user makes themselves.
- **App features as of v1.11:** clickable dashboard tiles (drill-down drawer), contact cards, profile menu, team invites, Costs & usage in Settings, one-row filters, country tiles under the nav (`?country=`, `lib/countries.ts`), record dates (added / updated / status since) in the app and Excel, cost-impact notes (`components/CostNote.tsx`) on every action that calls the Anthropic API (add one to any new paid action), footer credit.
