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
  single hotels/hospitals/schools/attractions and local branches of foreign HQs). Write them to `data/verification/new_companies.json`
  as `[{"name","website","country","industry","hq_city","why_icp","source_url"}]`, run `node scripts/engine_client.mjs add data/verification/new_companies.json`,
  then verify the added companies' revenue as in **verify** (use the returned slugs).
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
  `.om` → Oman, `.bh` → Bahrain, `.eg` → Egypt); otherwise use its HQ address, exchange listing or press coverage. Write `data/verification/new_companies.json` with
  ONE entry, `"country"` set to the **real** country and `"watch": true`. Then check `data/verification/icp_rules.json`'s `active` list for that real region:
  - **Region is Active** → run `node scripts/engine_client.mjs add data/verification/new_companies.json`, then verify it using the returned slug.
  - **Region is Paused or Next phase** → do **not** add it yet. Run `node scripts/engine_client.mjs hold data/verification/new_companies.json` instead (same file format) —
    this queues it in the app (Settings → a "Pending — waiting for region activation" card) without creating a live account, until a Super Admin activates that region.
    Do not verify its revenue yet.
  Finish with `finish <id> done "<Company's correct legal/trading name> (<real region>): added|held pending activation|already in the app — <ICP status or 'queued until Active'>, <revenue or 'no official figure yet'>" <slug>`
  — always name the **real** region right after the company's name in parentheses, in every case, even when it matches the job's original region (this is what the app's
  Company Name column and job history parse to show the correct company and region, regardless of what was typed or which region box was used to search).
  (The slug makes a "View" link in the app; omit it for a held company — there is no account yet.) Research and record it even if it looks below the ICP or its region
  is inactive (the user asked for it); its status or hold note will say so.

## 3. Finish and notify
`node scripts/engine_client.mjs finish <id> done "<N verified: X Verified, Y Likely, Z Needs check, W Not ICP; M new companies added>"`
(or `finish <id> error "<reason>"`). Claim the next job if time allows. Then ALWAYS, at the very end:
1. Write `data/verification/run_details.json`: one row per company you checked or added this run (queued jobs and the daily batch together), in this exact shape:
   `[{"name":"<company>","status":"<ICP — Verified|ICP — Likely|ICP — Needs check|Not ICP|Unknown|Held (<region>)>","region":"<its own real region, e.g. UAE>","revenue":"<e.g. $51.8B, ~$625.6M (estimate), Below $250M, or '' if none found>"}]`
   This becomes the small table shown in the bell and in Settings → Scheduled run history — keep `revenue` short (one figure, no sentences). **Always include each row's own `region`** — the app
   groups the bell notification by it, so a row with the wrong or missing region shows up under the wrong heading or gets dropped from every region's table.
2. **Call `log` once per region you worked this run — never combine multiple regions into one call.** If this run touched more than one region (e.g. the daily batch
   ran UAE, KSA, Qatar and Kuwait), run this command separately for EACH one, right after the other:
   `node scripts/engine_client.mjs log "<one-line summary for just this region>" <this region's verified_count> "<this region's new company names separated by ;>" <daily|instant> <region>`
   — the 4th argument is which routine you are (the daily 6am one, or the instant job runner — your own opening instructions say which); the 5th argument is that single region
   (e.g. "UAE") — never a list like "UAE, KSA". Each call reads `run_details.json` and automatically keeps only the rows whose `region` matches this call's region, so the summary,
   table and new-company count you pass must describe that region alone, not the whole run.
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
