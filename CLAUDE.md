# Account CoPilot — project briefing for Claude Code

B2B procurement-intelligence app for a Coupa / SAP Ariba implementation and managed-services partner (SCP, Supply Chain Partner) targeting UAE accounts, with KSA, Qatar, Kuwait, Oman and Egypt to follow.

- **Live app:** https://account-copilot.vercel.app (Vercel, auto-deploys from `main`)
- **Repo:** https://github.com/vipinlakhanpal-vipin/Account-CoPilot. It is **public**, so never commit contact data (see `.gitignore`).
- **Database:** Supabase project `zmezqmkszokuvceazllp`. Keys live in `.env.local` (git-ignored): `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `ANTHROPIC_API_KEY`.
- **Stack:** Next.js 15 (`app/`, `components/`, `lib/`), Supabase, exceljs export, Claude Opus 5 research engine (`lib/research/`).
- **Local Node is 18.** Run scripts and builds with Node 22 via npx: `npx -y -p node@22 node <script>`, and build with `npx -y -p node@22 node node_modules/next/dist/bin/next build`.

## Releasing
Bump `APP_VERSION` in `lib/version.ts`. Numbering (user rule, 2026-10-19): two digits after the point, rolling over at 99, so 4.99 → 5.00 → 5.01 … 5.99 → 6.00 → 6.01 … 6.99 → 7.00; never 4.100, add a line to `RELEASES`, build, commit, `git tag -a v1.x`, `git push origin main --tags`. The in-app Refresh button shows a red badge when a new version is live. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Data rules (the user insists on these)
- **Never overwrite reference data.** Rows from the user's workbook (`FINAL-UAE-Target-LIST-V3.1-SEP-2026.xlsx`: Vipin-Profiling, UAE Targets v3, Stakeholders) are kept verbatim. Channel-state values such as CoPilot or Claude-Seamless are theirs.
- Claude findings go in **new rows** (`channel_state = "Claude"`) or Claude-owned fields (`claude_check`, `icp_status`, `icp_fit_reason`, `verified_revenue_*`, `listing_status`). Explain any difference in the notes.
- Never invent or pattern-guess emails or phones. No generic mailboxes or personal domains. Titles stay verbatim. Never infer nationality.
- Label evidence FACT / LIKELY / UNVERIFIED / UNKNOWN and keep the source URL for every fact.
- Don't bypass paywalls or logins (D&B, ZoomInfo, Refinitiv, LinkedIn). Search-result snippets may be cited as snippets only.

## ICP definition (current)
**Source of truth since v1.44: Setup → Define ICP** (`settings.icp_definition`, `lib/icpDefinition.mjs`), with one rule set per region (UAE, KSA, Qatar, Kuwait, Oman, Bahrain, Egypt, then Europe and USA as the next phase). `statusPatch(c, rulesFor(def, c.country))` in `lib/icpStatus.mjs`, `recompute_icp.mjs`, the engine worker (`icp` action / `engine_client.mjs icp`), in-app research, the Pipeline weights and the left-panel defaults all read it. Saving in the app re-applies statuses at once and records history. **Roles & regions (v1.54, replaces the v1.52 owner lock):** `public.user_access` (user_id, role `super_admin` | `standard`, regions[]), set in Setup → Team.
  - Super Admin (v5.17: the owner only): every region, consolidated view, team, engine, all ICPs, and **the only role that can download** (Master Book, PDF, Excel). `access.isOwner`.
  - Admin (v5.17): everything a Super Admin can do except downloads (`access.canDownload` false; `isSuper` stays true for full access). The download buttons are hidden by `body[data-nodl]` + `.btn-dl:not(.keep)` and the routes `/api/export`, `/api/report/*` and Aria's create_excel / create_pdf refuse. Manages Standard Users only. Pavel, Henk and Kevin become Admin after the v5.17 deploy.
  - Standard User: only their region(s), meaning their data, exports and research. Their region's ICP is **read-only** (v4.98): Define ICP, the Setup Wizard and `/api/icp` refuse changes with "Consult Super Admin if any change is required."
  - Enforcement: `lib/access.ts` (`getAccess`, `scopeData`) scopes every page and API server-side. The RLS in `supabase/migrations/0004_region_access.sql` enforces the same rule in the database (run once in the Supabase SQL editor). Until that migration is run, `getAccess` treats everyone as Super Admin. The defaults below equal the rules before v1.44; if the saved definition differs, the saved definition wins.

**Default:** net revenue ≥ USD 250M and ≥ 100 employees. A stock listing is NOT required**; record it separately in `listing_status`. Convert AED at 3.6725 per USD.

Status scale (`companies.icp_status`), recomputed by `scripts/recompute_icp.mjs`:
- `ICP — Verified`: revenue ≥ 250 from an official source (annual report, results, regulator/exchange filing, bond prospectus, rating report, reputable press quoting the company)
- `ICP — Likely`: ≥ 250 per the user's data, Seamless or estimates only
- `ICP — Needs check`: sources disagree across the $250M line
- `Unknown`: no figure from any source
- `Not ICP`: official revenue below 250, or, on estimates only, below 100 with headcount ≤ 1,000 ("Not ICP (estimate)", user rule 2026-09-27). Companies are never deleted. Any non-Verified company is re-queued 180 days after its last revenue check, so companies that grow move up to Verified. The >1,000-staff companies are never auto-marked Not ICP on estimates.

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
    "icp_verdict":"Verified ICP|Likely ICP|Below minimum|Revenue not found","reasoning":"what you found and why"}
   ```
   `icp_verdict` is "Verified ICP" only with `revenue_status` FACT and revenue ≥ the region's minimum (default 250; "Below $250M" is still accepted). For banks use total operating income; for insurers use insurance revenue or GWP, and say which.
4. After every ~10 companies, load the results and refresh the statuses:
   `npx -y -p node@22 node scripts/verify_revenue.mjs --apply && npx -y -p node@22 node scripts/recompute_icp.mjs`
5. When the session's web-search allowance runs out, stop and report progress. The next session resumes from the queue, which skips companies already done.

## ICP scoring & discovery (v1.12)
- `lib/icp.ts` is the engine (pure functions, reusable for a future multi-tenant product): criteria types and defaults, ICP Match, Opportunity and Coupa Fit scores (each 0-100 with parts and reasons), benchmark spend and transaction estimates (always labelled ESTIMATE), contact seniority, buying roles and engagement, and recommended actions. `components/DiscoveryPanel.tsx` is the left panel; criteria are saved in `settings.icp_criteria`. Pipeline rank = 50% match + 30% opportunity + 20% fit; the Pipeline tab shows match ≥ 70 and excludes Not ICP.
- **Seamless discovery import:** `scripts/clean_seamless_discovery.py` sorts rows into buckets: KEEP, DUP (already in the app, or a unit of an account in the app), GOV, SINGLE (single hotel, hospital, school or attraction), BRANCH (local branch of a foreign HQ; not the decision-making entity), REGION and JUNK. Then `scripts/import_seamless_discovery.mjs <COUNTRY>` imports the KEEP rows. In `recompute_icp.mjs`, a Seamless band counts only when headcount agrees: 1,001+ staff gives Likely, 201-1,000 gives Needs check. Seamless revenue is unreliable: 8 of 11 companies with official figures fell on the wrong side of $250M, with some off by 10-1,000×. For UAE (2026-09-26), 224 of 386 were imported.
- **Phase 2: ON HOLD (user decision, 2026-09-26; no API spend for now).** Continue verification in Claude Code sessions, and at the start of each session state how many companies will be verified (40–60 has been realistic). Phase 2 would be scheduled autonomous discovery and monitoring (Vercel cron → research engine), which spends Anthropic API credit. LinkedIn activity signals are not available (no scraping).

## HubSpot (v1.38–1.40) — DISCONNECTED 2026-10-13
**Status:** the user disconnected HubSpot. It is hidden in the account brief, PDF report, Master Book and Guide through `SHOW_HUBSPOT = false` in `lib/features.ts`. The stored copy (`companies.profile["HubSpot"]`, 464 companies) was deliberately kept. Do not run the matching steps below or `scripts/apply_hubspot.mjs` unless the user asks to reconnect; flip the flag to show it again.
SCP's HubSpot is connected through the user's own HubSpot login (the claude.ai connector), and we only read from it; never write to HubSpot.

**Rule:** the user wants HubSpot data kept inside this app only (the database, the account page and the Master Book). Never commit it; the repo is public. Keep the working files in the scratchpad or in the git-ignored `data/verification/`.

Matching steps:
1. Match companies by domain first (`query_crm_data` with `domain IN (...)`, batches of about 120; HubSpot domains can start with `www.`), then by normalised name against HubSpot's Gulf-country companies and those with no country set (the query caps at 500 rows, so page with `hs_object_id >`).
2. Reject false name hits by eye.
3. Pull `lifecyclestage`, `hubspot_owner_id` and `num_associated_deals`, then resolve owners with `search_owners`.
4. Pull deals with `SELECT … FROM DEAL WHERE COMPANY.hs_object_id IN (...)`.
5. Match contacts with `CONTACT email IN (...)`.
6. Run `node scripts/apply_hubspot.mjs <matches.json> <hubspot_contacts.txt>`.

This writes `profile["HubSpot"]` = {in_hubspot, hubspot_id, hubspot_name, records, stage, owner, deals[], contact_emails[], checked_at}. The account page shows it in its HubSpot block. The Master Book shows it in the Contact List (Company in HubSpot, Stage, Owner, Deals, Latest Deal, Contact in HubSpot, HubSpot Import Action) and in the HubSpot Deals sheet.


## Spend benchmarks (v1.36)
`SPEND_BENCHMARKS` in `lib/icp.ts` holds, per sector: the addressable ratio, the split, a confidence `level` (Sourced / Partly sourced / Judgement) and a source string, researched on 2026-09-27. Oil & gas, logistics and utilities are still Judgement; update them when a credible published split is found. The Guide table and every estimate's "basis" show the level and source.

## Tables (v4.88): one rule for all
- Every table inside `.tablewrap` follows the "TABLES" block at the end of `app/globals.css`: one line per value, text that does not fit is cut with an **i** (added at run time by `components/TableNeat.tsx`; click the cell to read it all). Do not style cell wrapping per table. Opt out only with `className="prose"` (running text) and `.mkt-table` / `.aria-table` (their own layouts). List tables (`FilterTable`) also turn long text columns into a lead plus an i (`components/LongText.tsx`); company names use `shortName()` (`lib/shortName.ts`); ICP status is plain coloured text; the S2P signal is a four-bar meter. New tables just use `<div className="tablewrap"><table>`.

## Navigation & performance (v1.30)
- `components/Header.tsx` is rendered ONCE in `app/layout.tsx` (not by pages). It works out the active tab from the URL and hides itself on /login and /auth. The sub-tab row stays hidden until it has been measured, so it never slides. Pages must not render their own `<Header>`.
- `lib/dataCache.ts`: `loadAllCached()` is an in-memory 60-second cache of `loadAll`, using the admin client. Call it only after `requirePageUser()`. Routes that write data call `invalidateAllData()` (research, discover, engine worker). The Excel export still loads fresh data.
- `app/**/loading.tsx` show skeleton placeholders below the persistent header.

## Engine (v1.20)
- **Settings → Discovery & refresh engine** (`components/EngineSettings.tsx`, `app/api/engine`). It stores its state in `settings`: `engine_jobs` (queued no-cost jobs), `engine_refresh` (paid batches: budget, planned counts) and `engine_balance` (the Console balance the user enters). Spend is the sum of `research_runs.stats.cost_usd`; every paid call is metered (`Meter` in `lib/research/engine.ts`). Carry-over = total budgets − total spent.
- **Scheduled sessions** follow `ENGINE.md` and have NO database key. They use `scripts/engine_client.mjs` → `app/api/engine/worker`, authenticated by `ENGINE_TOKEN`. Only the token's SHA-256 is stored, in `settings.engine_token`; generate or revoke it in Settings. The worker can claim and finish jobs, read the queue, submit results, add companies, hold companies pending region activation and log notifications, and nothing else. Two routines share environment "Account CoPilot engine (token)" (needs `APP_URL` and `ENGINE_TOKEN` only — never the Supabase secret key): the **daily engine** (`trig_01Ejcoe2zFPedeo1jZnv1RMx`, daily 02:00 UTC = 6am Dubai, Sonnet 5) and the **instant job runner** (`trig_01U3xFkdw4kd3CFHnxVaNiwL`, fires on a GitHub `issues.opened` event in `vipinlakhanpal-vipin/account-copilot-jobs`). Both clone the public repo themselves (GitHub isn't connected to claude.ai) and need an empty setup script. These IDs are per-Claude-account — see `MIGRATION.md` if moved again. ICP rules live in `lib/icpStatus.mjs`, shared by the scripts and the app. `scripts/engine_jobs.mjs` and `scripts/add_companies.mjs` are local (DB-key) equivalents.
- **Instant trigger (v1.84):** queuing a job (`app/api/engine` → `openJobIssue`) opens a GitHub issue in `account-copilot-jobs` so the instant job runner fires within a minute or two instead of waiting for 6am. Needs `GITHUB_JOBS_TOKEN` in Vercel (a fine-grained PAT scoped only to that repo, Issues: write) — without it, queuing still works exactly as before, just picked up at the next 6am run. The opened issues are never closed automatically; harmless clutter, safe to bulk-close by hand any time.

## Engine priority (v5.10)
- Per region in `settings.icp_definition` (Define ICP, Super Admin only): `priority` high | medium | low (default medium) and `market` (Market intelligence on). `effectiveEngine()` in `lib/icpDefinition.mjs` turns the set counts into the worked counts: share 1, 1/2, 1/4 (rounded up). The worker `icp` action returns `active` already ordered High first with those counts; `market_targets` covers only Active regions with `market` on (High first, SAP and Coupa before other vendors, a job that names a region always runs).
- Kinds of work are tiered in `ENGINE.md` section 4 (High: queued jobs, new and Needs check / Unknown verification; Medium: discovery, Likely, SAP and Coupa market, signals; Low: 180-day re-checks, other vendors, contacts, deep dives). Set 2026-10-19: High UAE, KSA, Qatar, Kuwait, Oman, Egypt; Medium South Africa, UK, USA; Low Kenya, Morocco; market on for High and Medium.
- Shown in Define ICP, the bell (one line under the region name, and a Today's plan table of planned against done per Active region, v5.11) and Home → About; the Guide intro explains it.

## Left panel on every page (v5.16 experiment, final v5.19, on every page from v5.29)
- The panel comes from the root layout (`components/AppShell.tsx`, hidden on /login and /auth); there is no Home tab any more; the top bar keeps Dashboard, Accounts, Data, the version badge, Online now, the theme switch and (Super Admin) the Master Book. Account Discovery Criteria is a Filters drawer (closed by default). Pages under `/nav/*`, `app/nav/layout.tsx`): a left panel (`components/NavPanel.tsx`: Market intelligence with vendor sub-items, Buying signals, About CoPilot, Setup wizard with step sub-items, Team above Settings; Settings pinned at the bottom with Define ICP / Engine and PIN / Learn me; drop-downs for Market intelligence, Setup wizard and Settings) and the chosen page on the right. Market and Signals use `NavTool` (scan buttons, Pop out to the floating `AppWindow` through the `appwin-open` / `appwin-close` events); About and Wizard use `HomeWorkspace` with `layout="about" | "wizard"`; the Settings pages re-export the existing `/icp`, `/settings` and `/team` pages. v5.19: this replaced the old Home page and the separate Find / Signals / Market / Setup icons in the top bar (the top bar keeps Home, Dashboard, Accounts, Data); `/home` redirects here; the old `/find`, `/market`, `/signals`, `/icp`, `/settings`, `/team`, `/guide` pages still exist and are re-exported under `/nav`. The floating windows remain for Pop out.

## Inactive users (v5.33)
- `lib/inactivity.ts` + `app/api/inactive` (Super Admin only): everyone except the Super Admin; last activity = latest of sign-in, page or action, online signal, the day the Super Admin chose Keep, or the day they were added. 15 days idle = **suspended** (Supabase auth ban, `user_access.suspended_at`), never deleted by itself; the scan runs when the Super Admin's panel or Team page loads.
- Team → Inactive users: **Keep** (unban, `kept_at` restarts the clock) or **Archive and delete** (confirm lists what is removed: sign-in, activity log, their saved filters; what stays: every company, contact, partner, signal; suggestions and jobs stay as history). The snapshot goes to `user_archive` (migration 0011) with profile, activity, saved filters, suggestions and jobs; Archived users can be downloaded, reactivated (new sign-in, role, regions, saved filters back, temporary password) or deleted (kept 12 months, then the Super Admin's to delete).

## Property under an account (v5.03)
- `contacts.business_unit` (migration `0009_contact_business_unit.sql`, applied 2026-10-19): the property or business unit a contact belongs to under the account; empty = the account itself (group level). Claude-owned, never set on workbook rows. Example: Kerzner International (Atlantis Dubai) with the Atlantis The Palm team (10 people, Seamless 2026-10-19). Atlantis names are aliases in `profile["Merged companies"]`, so there is one record per entity.
- Shown as a tree on the account page, a Property / unit column on the Stakeholders tab, and a column in the Excel contact list, Master Book and PDF. Seamless emails under 90% go only to `email_candidate`.

## Duplicates & the Guide intro (v1.41–1.42)
- **Discovery duplicate check:** `sameCompany()` in `app/api/engine/worker/route.ts` compares every discovered company with existing names, domains and merged aliases (spelling variants, acronyms, domain roots, group vs subsidiary). The routine runs `engine_client.mjs names` before searching.
- **Merging (standing user approval, 2026-09-28):** the same entity must be one record. Run `node scripts/merge_companies.mjs <keep_slug> <drop_slug> "note"`, then `recompute_icp.mjs`.
  - Keep the workbook record first, then the earliest added; fill only empty fields.
  - Stronger revenue evidence wins.
  - Aliases are stored in `profile["Merged companies"]`; the engine treats them as existing.
- **Guide "Get to know me" intro** (`.intro-box` frames) must be updated in the same release whenever engine logic changes.

## Moving to another Claude account
Follow `MIGRATION.md`, which is written to stay valid. Step A reads the current routines into `data/verification/routines_backup.json` (git-ignored); step C recreates them in the new account.

## Paid-actions PIN (v1.58)
Every Anthropic-API route (`/api/research`, `/api/discover`, `/api/pitch`, and `/api/engine` refresh) calls `requirePaidApproval()` in `lib/paidGuard.ts` first.
- **Storage:** the PIN is a salted scrypt hash in `settings.paid_pin`, set by a Super Admin in Settings.
- **Who is asked:** Standard users always; Super Admins only when `ask_super` is on. With no PIN set, only Super Admins can spend.
- **Client:** uses `paidFetch()` from `components/Confirm.tsx`, which asks for the PIN in-app and retries with the `x-paid-pin` header. The engine refresh forwards that header to the research and discovery calls it starts.
- **Any new paid action** must use both the guard and `paidFetch`.

## Find company (v3.88+)
- **Page:** `/find` (first item of the Home left panel, "Find and search", also reachable as `/nav/find`; `components/FindCompany.tsx`). `Search Company` = `GET /api/find` (`lib/findSearch.ts`, read-only, scoped by `scopeData`); `Find New Company` = `POST /api/engine` queue (free) or `/api/research` (paid, PIN). `GET /api/engine?only=find` returns only the user's regions and jobs (no balance or spend).
- **Replaces the header search bar** (removed). The Mission Control "Search & refresh" tab stays for bulk jobs and the paid refresh and links here. Remove other search entry points only after the user confirms Find company works.
- Standard users may queue, cancel, add and ignore for their own regions only (job region is checked server-side).

## Buying signals (v4.18)
- **Where:** pulse icon beside Find company → `/signals` (`components/BuyingSignals.tsx`); alert badge in `components/Header.tsx` (new Hot/Warm signals, polled from `GET /api/signals?count=1`). Data is in `settings.buying_signals` {items, scans, sweeps} (no table), types in `lib/signals.ts`; scoped by region in `app/api/signals`.
- **Three lanes:** tenders and RFPs (`rfp`), ERP/S2P/procurement-consulting intent (`erp`), SAP ECC owners heading to S/4HANA (`ecc`, only for companies already in the app). Strength Hot/Warm/Watch (Hot needs FACT; the worker downgrades otherwise); labels FACT/LIKELY/UNVERIFIED; every signal has a source URL.
- **Free:** scheduled sessions follow the "Buying signals" section of `ENGINE.md` (job mode `signals`, plus daily step 5, UAE and KSA only in phase 1) and save through worker actions `signal_targets` / `add_signals`. The daily routine's own prompt overrides ENGINE.md, so step 5 only runs once that prompt mentions it.
- **Tenders:** `doc_url` is a link only when the documents open without a login; otherwise `needs_login` and the notice page is the source. Never log in, register, bypass or re-host documents.

## Activity log and online now (v4.20)
- **Tables (migration `0007_activity_log.sql`, applied 2026-10-16 through the Supabase connector):** `activity_log` (user, kind, detail, path, time) and `user_presence` (one row per user, last_seen). RLS on with no policies: only the server (service role) reads and writes, through `app/api/activity`.
- **What is recorded:** `components/ActivityTracker.tsx` (in `app/layout.tsx`) logs one "visit" per browser session, every page or tab open, and a heartbeat every 45 s while the tab is visible. `logActivity()` (`lib/activityClient.ts`) records searches (Find company), report downloads, Find contacts, scans (signals, market) and Aria questions (the question text, first 200 characters).
- **Time on a page (v4.22, migration `0008_activity_last_seen.sql`):** each heartbeat or action moves `last_seen` on the person's current page row (unless idle over 2 minutes); time on a page = `last_seen - created_at`; a day's total merges the pages' spans (Dubai days). The Buying signals and Market windows count as their own place (`act-view` event). **% used** (Team table) = distinct places and features opened in the last 30 days divided by `USAGE_AREAS` in `lib/activity.ts` (22; Team and Settings are not counted for Standard Users).
- **Who sees it:** Super Admins only. "Online now" chip in the header (`components/OnlineNow.tsx`, active in the last 5 minutes; the heartbeat only runs while the tab is visible) and Setup → Team → Activity (`components/ActivityLog.tsx`). Tell new users the app keeps this log; it is not hidden.

## Market intelligence (v4.19, vendors v4.26)
- **Where:** network icon beside Buying signals; both icons open Aria-style floating windows (`components/AppWindow.tsx`, hosted by `components/Header.tsx`; pages `/signals` and `/market` remain). UI `components/MarketIntel.tsx`, API `app/api/market` (read-only, scoped by region).
- **Vendors (v4.26):** nine by default (SAP, Coupa, Oracle, Microsoft, Boomi, MuleSoft, Ivalua, GEP, Jaggaer); a Super Admin adds or removes extra ones in the window (`settings.market_vendors` {custom}, `vendorList()` in `lib/market.ts`). The user wrote "Jaeggar" and "iValua"; the app uses the official spellings Jaggaer and Ivalua.
- **Data:** one settings document per vendor and region, key `market_intel:<vendor>:<region>` (types in `lib/market.ts`): partners (name, tier, services, source) and the customers each partner publishes, with optional public named contacts (same rules as Find contacts, validated in the worker). Customers are matched to the app's companies; unmatched ones link to Find company → Find New Company ("Add as account").
- **Which partners are listed (v4.60-4.63):** a partner belongs under a region only if it is based there or has an office there confirmed by a cited page (`presenceOk` in `lib/market.ts`; `branch` + `branch_source`). Coverage-only or global listings are saved with `presence_pending` and show under the **Other regions** row in the window, never deleted. Never remove partner data without asking; hide it instead.
- **Free:** scheduled sessions follow the "Market intelligence" section of `ENGINE.md` (job mode `market`, daily step 6: partners for 2 vendor x region pairs, oldest first, then customers by default for 8 partners from `customers_due`, v5.09; every Active region) through worker actions `market_targets` / `add_market`. Only public pages; partners that publish no customers simply have none.

## Find contacts (v4.12)
- **Button:** "Find contacts" on the account page and in each Search Company result (`lib/findContactsClient.ts`) → `POST /api/engine` `{action:"queue", mode:"contacts", slug}`. The server looks the company up (region, domain), checks the user's region, and refuses a duplicate while one is queued or running.
- **Free:** a scheduled Claude session follows the **contacts** job in `ENGINE.md` (public web search only; no Seamless credits, no LinkedIn login) and saves people with `engine_client.mjs add_contacts <slug> <file>` → worker action `add_contacts`.
- **Server-side rules (worker):** email only if named and on the company's domain (generic mailboxes and personal domains dropped); LinkedIn must be a `/in/` profile; phone format checked; source URL required; dedupe by name, email or LinkedIn. New rows are `channel_state "Claude"`, `external_id` WEB-<hash>; only Claude-owned rows may get empty fields filled; reference rows are never touched. Like all `ENGINE.md` changes, it reaches the routines only after the user pushes.
- **Seamless option (v4.17):** the button is a menu, Free or Free + Seamless. `job.seamless` tells the session to also use Seamless (≤5 credits per company, skipped under 20 credits left) and save people with `via:"seamless"`, `seamless_id` (external_id SMLS-<id>). Scheduled routines have no Seamless connector unless the user attaches it in claude.ai; without it the session does the free search and says so. Seamless jobs can also be run from a local Claude Code session that has the connector (claim via the DB, apply with `apply_people.mjs`-style rows). The NEW badge keys on `record_status` containing "Find contacts".
- **Aria history (v4.12):** the History button (before Expand) lists chats saved in the browser's localStorage by day; Aria opens clean each time. History is per browser, not in the database.

## Aria, the in-app assistant (v3.72+)
- **Where:** the robot icon beside the suggestions bulb (`components/AriaChat.tsx`, a thin wrapper over the copy-in package `packages/aria`). Server: `app/api/aria/route.ts`.
- **Free first, AI second (v3.77):** `lib/aria/router.ts` reads common questions by plain rules (counts, lists, one company, contacts, ICP rules, PDF, Excel with its region / how-many / pick-by questions) and answers from the database with **no API cost and no PIN**. Only what the rules cannot read goes to the AI (`lib/aria/agent.ts`, default model Haiku 4.5, override with `ARIA_MODEL`), which is behind `requirePaidApproval`. Every reply carries a note saying which path answered.
- **Tools** live in `lib/aria/tools.ts` (all read-only, scoped by `scopeData`). Excel and PDF go through the existing `/api/report/*` routes.
- **One topic per chat (v4.72):** `conversation()` in `lib/aria/router.ts` builds the question from the chat so far: refinements ("only verified", "revenue above 400m") are added to the earlier question (a newer revenue range or status replaces the older); a new standalone question while a topic is open is not run, Aria asks to close the chat (it stays in History) or keep going. Buttons send `flow: true` and are never questioned; `§new:` / `§keep:` prefixes carry the choice.
- **Plan first (v4.74):** when the free rules cannot answer, `lib/aria/interpret.ts` makes one small call to the Aria model (Haiku, `ARIA_MODEL`) with a forced `plan` tool; `lib/aria/plan.ts` shows "I read this as:" and asks for confirmation when the plan is unsure, has assumptions, has unsupported limits or is a report, then runs it with the app's own tools (`§plan:` carries a confirmed plan, `§rephrase` asks again). `intent: other` falls back to the full agent (`runAria`).
- **Voice** uses the browser's speech recognition; nothing extra to configure. Aria's spend is not yet added to the Settings spend total.

## Free pitch plan (v4.81)
- Account page → Pitch planner: **Draft pitch plan (free)** (`components/FreePitch.tsx`) queues job mode `pitch`; a scheduled session reads `pitch_facts` (`lib/pitchFacts.ts`, contacts as names and titles only), may search public news, writes the plan and saves it with `save_pitch` into `companies.profile["Pitch plan"]` (read back by `GET /api/pitch?slug=`). The paid **Draft now (instant)** button (`/api/pitch` POST, Opus, PIN) is kept for when the answer is needed at once. The free one adds public-news research and an opening message; it takes minutes and uses the routine's model (Sonnet).

## Guide & Research more (v1.14)
- `/guide` documents every feature, the point system and the engine steps. Update it whenever a feature or rule changes (the spend table reads `SPEND_BENCHMARKS` from `lib/icp.ts`).
- **Research more** (left panel) → `app/api/discover` → `discoverCompanies()` in `lib/research/engine.ts`. It is paid and user-triggered with a confirmation: it adds companies as list "Claude discovery" and, optionally, runs a Quick research per company. `app/api/research` now sets ICP status from the researched revenue (same rule as recompute).

## Source catalogue (v1.17: origin / contributor / trust / evidence)
- **Origin** (`originOf` in `lib/sources.ts`): exactly one per company (workbook, then Seamless discovery, Claude discovery, Claude research, user list), so the tiles add up to the total. **Contributors** (CoPilot, Claude in Copilot, Claude-Seamless, Claude check, revenue check, user confirmations) are breakdowns, never separate company counts. The user's workbook is ONE source that already combines CoPilot, Claude-in-Copilot and Claude-Seamless work.
- **People** (`lib/people.ts`): contact rows are grouped by company + name into one person (835 people from 1,093 rows). Trust: Conflicting (CONFLICTING, possible job change, different emails, or differs from the sheet); Confirmed by 2+ sources (2+ contributors, or Claude VERIFIED); otherwise Single source. No rows are deleted.
- Left panel criteria are a draft until Refresh (apply) or Save (apply + `settings.icp_criteria` with `_meta` {by, at}); Reset asks first.

### Earlier (v1.13)
`lib/sources.ts` defines every source (channels: workbook, Stakeholders sheet, CoPilot, Claude research, Claude-Seamless, Seamless discovery, revenue check, user knowledge, LinkedIn snippets; evidence: filings, websites/portals, press, Seamless data, aggregators, job posts) with what it provides, how it's collected, its reliability and its cost. The Sources tab shows them as tiles (Source | Region → companies). Add a definition whenever a new source is used. `verify_revenue.mjs --apply` no longer duplicates source rows.

## Other pipelines
- Research new companies (in-app, uses the API): Research Queue page → `app/api/research` → `lib/research/engine.ts` + `reconcile.ts`.
- Seamless.ai (Claude connector): contact enrichment and verification (`scripts/build_verification.py` → `scripts/apply_verification.mjs`). The user approved credit use; check `get_credits` before and after.
  - **Stakeholders for every region (2026-10-14):** 691 people added across all regions (270 of 294 Verified ICP companies and 241 of 263 Likely companies now have people; Coupa customers excluded). Flow: `search_contacts` by `companyDomain` + `contactCountry` (procurement pass, then finance/IT pass, 12 domains per call, limit 50 so the result is saved to a file) → rank and pick up to 4 per company (procurement first, then CFO, IT) → `research_contacts` for emails and mobiles → rows inserted by `scripts/apply_people.mjs <batch>` as NEW contacts (`external_id` SMLS-<contactId>, channel_state "Claude", status LIKELY CURRENT). Emails are stored only when Seamless marks them valid at 90%+ and the domain belongs to the company; personal and generic addresses are dropped. Working files live in the git-ignored `data/verification/people/`. Public-snippet LinkedIn checks confirmed 4 of 6 sampled people (those rows are VERIFIED with the source in `claude_check`); the rest are LIKELY CURRENT. Credits: 1,039 at the start, 370 left (shows a refresh time of 15 Oct 00:00 UTC; the amount is unknown). Up to 4 people per Verified company and 3 per Likely company was this run's choice, not an engine rule. Still without people: 24 Verified and about 40 Likely companies (mostly no match in Seamless).
- Reference workbook import: `scripts/import_reference_lists.py` → `scripts/seed_reference.mjs`.
- Known data issue: in the user's Stakeholders sheet, the Company column is shifted by 1–2 rows in patches (rows 17–648). Verification rows marked "Claude — corrected company (sheet row shift)" hold the right company.

## Open items (as of v1.11, 2026-09-25)
- **Revenue verification (as of v1.26, 2026-09-27):** 464 accounts: 87 Verified, 285 Likely, 57 Needs check, 30 Not ICP, 5 Unknown. All Needs check/Unknown accounts from the workbook, the 12 Coupa accounts and the top 50 Seamless discovery companies are checked. The daily 6am engine (routine `trig_01AeGrW9KXEgLXF6udy4tSm7`) does any queued jobs, then finds 5 new UAE ICP companies and verifies 25 (the 5 new plus 20 from the queue), as approved by the user on 2026-09-27; the first test run did 30. Next for manual sessions: big-name Likely accounts (ADNOC, Emirates Airline and similar, one search each), then the remaining Seamless Likely accounts. Duplicates merged at the user's request (2026-09-27): "National Corporation for Tourism & Hotels" into "…and Hotels", and "Al Batha Group" into "Albatha Group" (recorded in `profile["Merged companies"]`).
- **Status rules in `recompute_icp.mjs`:** only FACT figures give Verified/Not ICP; LIKELY and UNVERIFIED estimates give Likely (≥250) or Needs check (<250). Revenue-check notes are kept in `profile["Revenue check"]`; every status change is stamped in `profile["Status changed"]` and `updated_at`.
- **User-confirmed platform customers:** the user's own Coupa customer list (UAE, KSA, Kuwait, Qatar) lives in `data/seed/coupa_customers.json` (git-ignored; never put customer names in this public repo). Apply or re-apply with `node scripts/apply_customer_list.mjs data/seed/coupa_customers.json` then `recompute_icp.mjs`. It's safe to re-run. Existing accounts get Coupa / Confirmed Current / VERY STRONG plus a signal and a source, and the earlier research finding is kept as a conflict. Missing companies are added as channel "User" with list "Coupa customers (Vipin)". When adding a new region, match accounts against this list first.
- **Seamless discovery (not yet imported, awaiting the user's go-ahead):** a free Seamless search for UAE + revenue ≥ $500M + 200+ staff returned 774 companies. Of the first 500, 386 are not in the app (saved in `data/verification/seamless_discovery.json`). Before importing, clean out ministries/government bodies (or tag them separately), single hotels, local branches of foreign groups and duplicates. Import as list "Seamless discovery", status ICP — Likely.
- **Sources not available:** LinkedIn / Sales Navigator (no login access; public search snippets only), Copilot (no integration; its data arrives only via the user's workbook), ZoomInfo / D&B / Refinitiv (paid, not connected; the user may send exports).
- **Settings page:** tiers, team invites (temporary password or email invite), Costs & usage guide. Profile menu in the header.
- **LinkedIn coverage:** 727 of 835 unique contacts have a LinkedIn URL. The user asked to use their LinkedIn login to collect the rest. That was declined (LinkedIn ToS / account risk). Instead, fill the 108 gaps via Seamless `research_contacts` (≈1 credit each; ~50 are "Not publicly identified" placeholders that can't be looked up) or a Sales Navigator export the user makes themselves.
- **App features as of v1.11:** clickable dashboard tiles (drill-down drawer), contact cards, profile menu, team invites, Costs & usage in Settings, one-row filters, country tiles under the nav (`?country=`, `lib/countries.ts`), record dates (added / updated / status since) in the app and Excel, cost-impact notes (`components/CostNote.tsx`) on every action that calls the Anthropic API (add one to any new paid action), footer credit.
