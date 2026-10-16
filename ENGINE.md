# Account CoPilot — scheduled engine runbook (no API cost)

You are a scheduled Claude Code session working on this repo. Do the queued jobs from the app's Settings → Discovery & refresh engine
using **your own web search** — never the Anthropic API key. You do NOT have database access: everything goes through
`scripts/engine_client.mjs`, which calls the app's limited engine API with `APP_URL` and `ENGINE_TOKEN` from the environment.
Read `CLAUDE.md` first: its data rules, ICP definition, revenue source ladder and result-file format apply exactly.

## 0. Setup
No install is needed: `scripts/engine_client.mjs` uses only built-in Node (fetch, fs). If `APP_URL` or `ENGINE_TOKEN` is empty, stop and report
"Engine token missing in the routine environment". (The cloud environment's setup script must be empty — it runs before the repo is cloned.)

## 0b. Read the ICP definition (ALWAYS, before anything else)
`node scripts/engine_client.mjs icp` writes `data/verification/icp_rules.json`: the user's ICP per region from Setup → Define ICP.
**It overrides the ICP numbers in CLAUDE.md.** For each company, use the rules of its region:
- `revenue.min_usd_m` / `max_usd_m` and `employees.min` / `max`: the ICP line. `icp_verdict` = "Verified ICP" only with an official figure at or above `min_usd_m`
  from one of `evidence.verified_sources`; below it with an official figure = "Below minimum"; estimates at or above = "Likely ICP".
- `revenue.basis_*`: which revenue measure to report (general / banks / insurers); convert local currency with `currency.per_usd`.
- `listing`, `ownership_allowed`, `entity_level`, `industries_include` / `industries_exclude`, `exclude.*` and `notes`: what to search for and what never to add.
- `focus` (platforms, ERP, triggers): signals to look for and mention in the reasoning.
- `active` lists the regions to work on and their daily counts (`discover_per_day`, `verify_per_day`). Never discover in a region that is not active.

## 0c. Reading an uploaded list (ALWAYS check, before claiming a job)
`node scripts/engine_client.mjs uploads` writes `data/verification/uploaded_lists.json`: `[{"id","filename","region","url"}]` — spreadsheets a user
uploaded from the Setup Wizard's "Add Data" step, waiting to be read in. If it's empty, skip to step 1. For each one:
1. Download the file from its `url` (a signed link, valid ~1 hour) and open it — first worksheet only, ignore any others.
2. The header row's exact wording varies — map columns by meaning, not literal text: a company-name column (e.g. "Company Name", "Company", "Name")
   is required; website, country, industry, HQ city and notes columns are optional and may be named slightly differently or missing entirely.
   Skip a row with no usable company name. Never invent a value for a blank cell.
3. If `region` isn't given for a row, use the upload's own `region` field. Do not research or verify revenue for these — they're the user's own list,
   added as-is (same principle as the original workbook import in CLAUDE.md: reference data is kept verbatim, never pattern-guessed or invented).
4. Write the extracted rows to a file (e.g. `data/verification/upload_rows.json`): `[{"name","website","country","industry","hq_city","notes"}]`,
   then run `node scripts/engine_client.mjs add_upload data/verification/upload_rows.json "<original filename>"`. It skips anything already in the
   app (by name or domain) the same way `add` does.
5. Finish with `node scripts/engine_client.mjs upload_done <id> done "<N added, M already in the app>"` (or `upload_done <id> error "<reason>"`
   if the file couldn't be read at all — e.g. wrong format, no recognizable company-name column).
Do this for every pending upload before moving on to step 1.

## 1. Claim a job
`node scripts/engine_client.mjs claim` prints e.g. `{"id":"ab12cd34","region":"UAE","count":50,"mode":"verify"}` or `null`.
If `null`, do step 4. `count: "max"` = as many as you can in this session (aim for 50). A `mode: "discover"` job may also carry `company_names` (specific names the user
typed in) — see "Multi-name discover jobs" under step 2.

## 2. Do the job
- **verify** — `node scripts/engine_client.mjs queue <region> <count>` writes `data/verification/revenue_queue.json`
  (order: Needs check → Unknown → Likely, largest first; then re-checks of any non-Verified company whose last check is over 180 days old — entries marked `"recheck": true`; overwrite their result file with the new finding). Verify each with web search exactly as
  CLAUDE.md "Current task" describes and write `data/verification/revenue/<slug>.json` in the CLAUDE.md format.
  Every ~10 companies run `node scripts/engine_client.mjs submit` (it applies results and recalculates ICP status in the app).
- **discover** — run `node scripts/engine_client.mjs names` first (existing companies; never propose any of them, under any name or domain), then find up to `count` NEW companies in `region` that meet the ICP (group HQs only; exclude ministries/government bodies,
  single hotels/hospitals/schools/attractions and local branches of foreign HQs). For each one, record `"entity_type"`: `"Regional HQ"` if this company's own headquarters is in the Middle
  East (the normal case — anything else shouldn't have passed the filter above), `"Branch"` if research turns up that it's actually a local branch or subsidiary of a company headquartered in
  a DIFFERENT Middle East country, `"Foreign Branch"` if it's a branch or subsidiary of a company headquartered outside the Middle East entirely (keep either kind of branch only if the active
  region's `entity_level` rule allows it, e.g. "Group HQ and major operating subsidiaries"), or `"Unknown"` if genuinely unclear. Write them to
  `data/verification/new_companies.json` as `[{"name","website","country","industry","hq_city","why_icp","source_url","entity_type"}]`, run
  `node scripts/engine_client.mjs add data/verification/new_companies.json`, then verify the added companies' revenue as in **verify** (use the returned slugs).
  - **Multi-name discover jobs (`company_names` is present on the claimed job, e.g. `{"mode":"discover","company_names":["Almarai","Gulf Steel Works"],...}`)** — the user named these
    specific companies for a free, one-off check; they are reviewed and added (or ignored) by hand in the app, so do **not** run `add` or `hold` for any of them. For each name in
    `company_names`: run `names` first (skip it if already in the app — note that in its result entry instead), determine its real country as in **company** below, and research enough
    to say whether it looks like an ICP fit (industry, size signal, why) — no need to verify an official revenue figure for this path. Write `data/verification/job_details.json`:
    `[{"name","status":"<a short read, e.g. 'Looks like an ICP fit' | 'Below the ICP floor' | 'Already in the app' | 'Not enough public information'>","industry","hq_city","why_icp","source_url","country"}]`
    (one entry per name, in the same order). Finish with `finish <id> done "<count> companies checked, ready for review"` — the `finish` command sends `job_details.json` automatically.
- **both** — half verify, half discover.
- **company** — one specific company the user asked for (`company_name`, optional `website`, `region`). Run `node scripts/engine_client.mjs names` and check
  whether it is already in the app (any spelling, acronym or domain). **If it is**: verify its revenue now (as in **verify**) and add it to the watch list with
  `node scripts/engine_client.mjs watch <slug>`. **If not**: research it and determine its **real** country — never assume it's the job's `region` (that's only
  where the request happened to be queued from). The domain's country-code TLD is a strong signal (`.ae` → UAE, `.sa` / `.com.sa` → KSA, `.qa` → Qatar, `.kw` → Kuwait,
  `.om` → Oman, `.bh` → Bahrain, `.eg` → Egypt); otherwise use its HQ address, exchange listing or press coverage. While you're determining its real country, also determine
  `"entity_type"`: `"Regional HQ"` if the company itself is headquartered there, `"Branch"` if it's a branch or subsidiary of a company headquartered in a different Middle East country,
  `"Foreign Branch"` if headquartered outside the Middle East entirely, or `"Unknown"` if unclear. Write `data/verification/new_companies.json` with ONE entry, `"country"` set to the
  **real** country, `"entity_type"` set, and `"watch": true`. Then check
  `data/verification/icp_rules.json`'s `active` list for that real region:
  - **Region is Active** → run `node scripts/engine_client.mjs add data/verification/new_companies.json`, then verify it using the returned slug.
  - **Region is Paused or Next phase** → do **not** add it yet. Run `node scripts/engine_client.mjs hold data/verification/new_companies.json` instead (same file format) —
    this queues it in the app (Settings → a "Pending — waiting for region activation" card) without creating a live account, until a Super Admin activates that region.
    Do not verify its revenue yet.
  Finish with `finish <id> done "<Company's correct legal/trading name> (<real region>): added|held pending activation|already in the app — <ICP status or 'queued until Active'>, <revenue or 'no official figure yet'>" <slug>`
  — always name the **real** region right after the company's name in parentheses, in every case, even when it matches the job's original region (this is what the app's
  Company Name column and job history parse to show the correct company and region, regardless of what was typed or which region box was used to search).
  (The slug makes a "View" link in the app; omit it for a held company — there is no account yet.) Research and record it even if it looks below the ICP or its region
  is inactive (the user asked for it); its status or hold note will say so.

- **contacts** — "Find contacts" for ONE existing company (`company_name`, `slug`, `website`). Free: public web search only, no Seamless credits, no LinkedIn login.
  Find up to 6 named people who matter to buying (procurement/purchasing/supply chain heads first, then CFO/finance, then IT/digital) at THIS company, using the company's own
  website (team, leadership, contact and press pages), annual reports, exchange filings, press releases, conference speaker lists and search-result snippets. Rules (the app also enforces them):
  - Titles exactly as published. Never infer nationality. Never guess or pattern-build an email or phone.
  - `email` only if it is printed on a public page, belongs to a named person (no info@, sales@, hr@ ...), and is on the company's own domain. Otherwise leave it empty.
  - `phone` only if printed for that person (set `phone_type` Direct / Mobile) or the company switchboard on its own site (`Switchboard`, attach to the person only if the page names them).
  - `linkedin_url` only a `linkedin.com/in/...` link that appears in a search-result snippet or on a public page. Do not open LinkedIn, log in or scrape.
  - Every person needs `source_url` (the page that shows them) and, ideally, a short `source_note`. A person with no email, phone or LinkedIn is not saved.
  Write `data/verification/new_contacts.json` as `[{"full_name","title_verbatim","email","phone","phone_type","linkedin_url","source_url","source_note"}]` (Seamless people also `"via":"seamless","seamless_id"`), then run
  `node scripts/engine_client.mjs add_contacts <slug> data/verification/new_contacts.json` (people already on file are skipped; empty fields of Claude-added rows may be filled).
  - **`seamless: true` on the claimed job** — the user also allowed Seamless credits for this company. Only if this session has the Seamless tools (`search_contacts`, `research_contacts`, `poll_contact_research`, `get_credits`):
    `search_contacts` with `companyDomain` (the job's website domain) and `contactCountry`; pick up to 4 people (procurement first, then CFO/finance, then IT), then `research_contacts` for those ids
    (about 1 credit each; never more than 5 credits for the job, and none if `get_credits` shows fewer than 20 left). Save a person with `"via":"seamless"` and `"seamless_id":"<contactId>"` (no `source_url` needed);
    keep the email only if Seamless marks it valid at 90%+ and it is on the company's own domain (the app re-checks); `linkedin_url` from the Seamless record; title verbatim. Public-web finds (`"via":"web"`,
    with `source_url`) can go in the same file. If the session has NO Seamless tools, do the free web search only and end the result with " (Seamless was not available in this session)". Add "Seamless credits used: K" to the result text when used.
  Finish with `finish <id> done "<Company> (<Region>): N contacts added, M updated"` or, if nothing public was found, `finish <id> done "<Company> (<Region>): no public contact details found"`. Do not run `add`, `hold` or revenue steps for this job.

- **market** — market intelligence (Market intelligence window): the job has `vendor` (SAP, Coupa, Oracle, Microsoft or `all`) and `region`. The work is the **Market intelligence** procedure below.
- **signals** — buying signals (Buying signals tab). A job with `slug` = scan that one company; a job without `slug` = a region sweep (`region`, `count` companies). The work is the **Buying signals** procedure below.

## Buying signals (job `signals`, and the daily step in section 4)
Goal: find companies that are *seriously looking* for an ERP, a source-to-pay (S2P) solution or procurement consulting, public tenders and RFPs for those, and SAP ECC owners who will need an S/4HANA partner.
Free: public web search only (no API key, no logins, no CAPTCHAs). Phase 1 regions: **UAE and KSA** only (skip any other region).
Save signals with `node scripts/engine_client.mjs add_signals data/verification/new_signals.json`, a file shaped
`{"scanned":["<slug>",...],"sweep_region":"UAE","signals":[{"lane","strength","label","company_name","slug","region","title","evidence","why","source_name","source_url","doc_url","needs_login","published","closes"}]}`.
- `lane`: `rfp` (tender or RFP), `erp` (ERP / S2P / procurement-consulting intent), `ecc` (SAP ECC owner heading to S/4HANA; the company MUST already be in the app and its ERP field or evidence must show ECC).
- `label`: FACT (a document you read: tender notice, annual report, press release, job post) · LIKELY (credible but indirect) · UNVERIFIED. Never invent. Every signal needs `source_url` (the page itself) and a dated `published` when the page shows one.
- `strength`: **Hot** = a live tender/RFP, or an announced programme with a named scope or date (needs FACT; the app downgrades otherwise) · **Warm** = executive statement or press plus hiring, or an ECC owner with a named S/4HANA plan but no partner · **Watch** = hiring only, or ECC owner with no announcement.
- `evidence`: what the page says, in your own words, 1-3 sentences (no long quotes). `why`: one line on why it matters to SCP (a Coupa / SAP Ariba implementation and managed-services partner) and what to do first.
- `slug`: the app's slug when the company is in the app (from `signal_targets`, `names` or the job); otherwise leave empty and give `company_name` exactly as the issuer states it, and the `region`.
**Tender sweep** (once per region per run, `sweep_region` set): search for open tenders and RFPs for ERP implementation or replacement, SAP S/4HANA migration or support, source-to-pay or procurement platform
(Coupa, SAP Ariba), procurement transformation or consulting, managed procurement services. Look at the public tender sections of government entities and large private companies, national tender portals
(KSA: Etimad; UAE: federal and emirate e-procurement and entity "tenders" pages), and business press. Only tenders that are still open (`closes` today or later) and issued in that region.
`doc_url`: a direct link to the tender documents or the notice's download page, ONLY if it opens without logging in; if documents need registration or payment, put the notice page in `source_url`,
leave `doc_url` empty and set `needs_login` true. Never log in, register, bypass a paywall or CAPTCHA, or download and re-host a document.
**Company scan** (`node scripts/engine_client.mjs signal_targets <REGION> <N>` writes `data/verification/signal_targets.json`; or the job's own company): for each company search its website, annual report,
press (last 12 months), and job posts for the three lanes. Typical queries: "<company> ERP implementation", "<company> procurement transformation", "<company> S/4HANA", "<company> SAP ECC", "<company> tender
ERP", "<company> careers Coupa OR Ariba OR SAP". A company with nothing found is simply listed in `scanned` (so it rotates to the back of the queue).
Finish a job with `finish <id> done "<Company or Region>: N signals added (X Hot)"` or `"... no signals found"`. Never add signals for a company outside UAE/KSA in phase 1.

## Market intelligence (job `market`, and the daily step in section 4)
Goal: for each vendor, list its partners in a region and the customers each partner publishes on its own website, with public contact details where they exist. Free: public web search only, no logins.
`node scripts/engine_client.mjs market_targets 4` writes `data/verification/market_targets.json` (the vendor x region pairs due, oldest first, with the partner names already known). For a job, use its own `vendor` and `region`
(`all` = the four vendors). Only Active regions. Save with `node scripts/engine_client.mjs add_market data/verification/new_market.json`, one file per vendor and region:
`{"vendor":"SAP","region":"UAE","partners":[{"name","website","tier","services","hq_city","source_url","label","contacts":[]}],"customers":[{"partner","customer","customer_website","project","source_url","published","contacts":[]}]}`
- **Partners:** from the vendor's own public partner directory (SAP Partner Finder / PartnerEdge, Coupa partner directory, Oracle PartnerNetwork partner finder, Microsoft partner finder / AppSource) filtered to the region,
  and the partner's own website. `tier` as the vendor states it (Gold, Platinum, Premier ...). `services` in a few words (implementation, managed services, consulting). `source_url` = the page that lists the partner. Up to 15 partners per run; prefer ones not already known; skip a partner you cannot tie to the region.
- **Customers:** only customers the partner itself publishes (case studies, customer or reference pages, press releases, project pages), where the customer is in the same region. `project` = what was delivered (for example "SAP S/4HANA migration"). `source_url` = the partner page that names the customer; `published` when dated. A partner that publishes no customers simply has none; do not infer customers from logos you cannot read or from third-party lists.
  Every customer row names its `partner` exactly as in `partners` (same file).
- **Contacts (optional, `contacts` on a partner or a customer):** named people with an email, phone or LinkedIn link that is printed on a public page. Same rules as Find contacts: title as published, never guess or pattern-build an email or phone, an email must be a named address on that company's own domain (no info@, sales@, personal domains), LinkedIn only from a public page or search snippet, and each needs `source_url`. Do not open LinkedIn or log in.
- Labels: `label` FACT when the partner page or directory entry is what you read, LIKELY otherwise.
Finish a job with `finish <id> done "<Vendor or all> · <Region>: P partners, C customers added"`. Do not add companies to the app from here; the app offers "Add as account" itself.

## 3. Finish and notify
`node scripts/engine_client.mjs finish <id> done "<N verified: X Verified, Y Likely, Z Needs check, W Not ICP; M new companies added>"`
(or `finish <id> error "<reason>"`). Claim the next job if time allows. Then ALWAYS, at the very end:
1. Write `data/verification/run_details.json`: one row per company you checked or added this run (queued jobs and the daily batch together), in this exact shape:
   `[{"name":"<company>","status":"<ICP — Verified|ICP — Likely|ICP — Needs check|Not ICP|Unknown|Held (<region>)>","region":"<its own real region, e.g. UAE>","entity_type":"<Regional HQ|Branch|Foreign Branch|Unknown, omit for a company you only verified today — see below>","revenue":"<e.g. $51.8B, ~$625.6M (estimate), Below $250M, or '' if none found>"}]`
   This becomes the small table shown in the bell and in Settings → Scheduled run history — keep `revenue` short (one figure, no sentences). **Always include each row's own `region`** — the app
   groups the bell notification by it, so a row with the wrong or missing region shows up under the wrong heading or gets dropped from every region's table. **Include `entity_type` for any
   company you discovered or added this run** (you already determined it per the discover/company steps above) — leave it out for a row that's only a revenue re-check of an existing company,
   since you're not re-researching its structure that day.
2. **Call `log` once per region you worked this run — never combine multiple regions into one call.** If this run touched more than one region (e.g. the daily batch
   ran UAE, KSA, Qatar and Kuwait), run this command separately for EACH one, right after the other:
   `node scripts/engine_client.mjs log "<one-line summary for just this region>" <this region's verified_count> "<this region's new company names separated by ;>" <daily|instant> <region>`
   — the 4th argument is which routine you are (the daily 6am one, or the instant job runner — your own opening instructions say which); the 5th argument is that single region
   (e.g. "UAE") — never a list like "UAE, KSA". Each call reads `run_details.json` and automatically keeps only the rows whose `region` matches this call's region, so the summary,
   table and new-company count you pass must describe that region alone, not the whole run.
   **Spell every company name identically in the new-company list (3rd argument) and its `run_details.json` row** — even a spelling difference as small as an apostrophe
   ("Ma'aden" vs "Maaden") stops the app from matching the two and silently drops that company's "New" flag in the bell.
Do not commit or push anything and do not change app code.

## 4. Default daily work (always, after any queued jobs)
For **each region in `active`** of `icp_rules.json` (default: UAE, find 5, verify 25):
1. **Discover `discover_per_day` new companies** in that region that meet its rules (entity level, size, listing, ownership, industries; never anything in
   `exclude` or `notes`; not already in the app).
   **First run `node scripts/engine_client.mjs names`** and read `data/verification/existing_companies.json`. Do not propose any company on it,
   including the same company under another name, spelling or domain (e.g. "Al Fara'a Group" = "Al Faraa Construction and Industrial Group",
   "Al Shafar General Contracting (ASGC)" = "ASGC Construction LLC"), or the parent group of a company already in the app ("Khansaheb Group" when
   "Khansaheb Civil Engineering LLC" is in). Add them with `node scripts/engine_client.mjs add data/verification/new_companies.json`.
   If it prints SKIPPED lines (the app found a duplicate), find replacements and add again until the day's number is actually added.
   **Never discover more than `2 × discover_per_day` new companies in one region in one day** (10 by default) — even if the queue below is short and
   `verify_per_day` won't be reached as a result. A young region with few existing accounts grows by `discover_per_day` each day; padding discovery all
   the way up to `verify_per_day` to manufacture a full day's work is exactly the 5x-over-quota deviation the user flagged on 2026-10-03 and asked to
   have capped, not a target to hit.
2. **Verify `verify_per_day` companies**: first the ones you just added (use the returned slugs), then the rest from
   `node scripts/engine_client.mjs queue <region> <verify_per_day minus new>`. Submit every ~10 with `node scripts/engine_client.mjs submit`.
   **If the queue returns fewer than needed and the discovery cap above means you can't make up the difference, verify however many you actually
   have and say so plainly in this region's own summary** (e.g. "queue nearly empty — found 10 new (the 2x cap), verified 13 total; short of the
   25 target until more days of discovery build up the queue"). Never invent companies or exceed the cap to hit the verify number.
3. **Watch list**: `node scripts/engine_client.mjs watch` writes the requested companies that are due for a weekly re-check (any region, until an official
   figure is found) to `data/verification/revenue_queue.json`; verify each and submit.
4. Notify (step 3b) separately for EACH active region worked this run — one `log` call per region, each covering only that region's own companies and rows
   (never combine regions into one call or one comma-joined region). Each region's own summary, in this form:
   `"UAE — Added 5 new: A; B; C; D; E. Checked 25 (5 new + 20 from the queue): X Verified, Y Likely, Z Needs check, W Not ICP, U Unknown"`
   (counts are the ICP status of the checked companies after the check; mention any duplicates skipped). If a region's planned count can't be reached normally
   (e.g. its queue is empty) and you pad it with extra new companies to still hit the day's target, say so plainly in that region's own summary and flag it as
   over quota — the user reviews these.
5. **Buying signals (UAE and KSA only, after the rest, if time allows)**: for each of UAE and KSA that is in `active`, run the **Buying signals** procedure: one tender sweep, then
   `signal_targets <REGION> 10` and scan those companies; save with `add_signals`. Skip it silently if the session is short on time; never let it delay the revenue work above.
6. **Market intelligence (after everything above, if time allows)**: `market_targets 4`, then run the **Market intelligence** procedure for those vendor x region pairs; save each with `add_market`. Skip silently if short on time.
