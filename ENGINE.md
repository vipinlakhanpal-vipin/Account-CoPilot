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

## 1. Claim a job
`node scripts/engine_client.mjs claim` prints e.g. `{"id":"ab12cd34","region":"UAE","count":50,"mode":"verify"}` or `null`.
If `null`, do step 4. `count: "max"` = as many as you can in this session (aim for 50).

## 2. Do the job
- **verify** — `node scripts/engine_client.mjs queue <region> <count>` writes `data/verification/revenue_queue.json`
  (order: Needs check → Unknown → Likely, largest first; then re-checks of any non-Verified company whose last check is over 180 days old — entries marked `"recheck": true`; overwrite their result file with the new finding). Verify each with web search exactly as
  CLAUDE.md "Current task" describes and write `data/verification/revenue/<slug>.json` in the CLAUDE.md format.
  Every ~10 companies run `node scripts/engine_client.mjs submit` (it applies results and recalculates ICP status in the app).
- **discover** — run `node scripts/engine_client.mjs names` first (existing companies; never propose any of them, under any name or domain), then find up to `count` NEW companies in `region` that meet the ICP (group HQs only; exclude ministries/government bodies,
  single hotels/hospitals/schools/attractions and local branches of foreign HQs). Write them to `data/verification/new_companies.json`
  as `[{"name","website","country","industry","hq_city","why_icp","source_url"}]`, run `node scripts/engine_client.mjs add data/verification/new_companies.json`,
  then verify the added companies' revenue as in **verify** (use the returned slugs).
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
  Finish with `finish <id> done "<Company>: added|held pending <region> activation|already in the app — <ICP status or 'queued until <region> is Active'>, <revenue or 'no official figure yet'>" <slug>`
  (the slug makes a "View" link in the app; omit it for a held company — there is no account yet). Research and record it even if it looks below the ICP or its region is inactive
  (the user asked for it); its status or hold note will say so.

## 3. Finish and notify
`node scripts/engine_client.mjs finish <id> done "<N verified: X Verified, Y Likely, Z Needs check, W Not ICP; M new companies added>"`
(or `finish <id> error "<reason>"`). Claim the next job if time allows. Then ALWAYS, at the very end:
1. Write `data/verification/run_details.json`: one row per company you checked or added this run (queued jobs and the daily batch together), in this exact shape:
   `[{"name":"<company>","status":"<ICP — Verified|ICP — Likely|ICP — Needs check|Not ICP|Unknown|Held (<region>)>","revenue":"<e.g. $51.8B, ~$625.6M (estimate), Below $250M, or '' if none found>"}]`
   This becomes the small table shown in the bell and in Settings → Scheduled run history — keep `revenue` short (one figure, no sentences).
2. `node scripts/engine_client.mjs log "<one-line summary>" <verified_count> "<new company names separated by ;>"`
   — this reads `run_details.json` automatically and posts both the summary and the table as the notification under the bell.
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
2. **Verify `verify_per_day` companies**: first the ones you just added (use the returned slugs), then the rest from
   `node scripts/engine_client.mjs queue <region> <verify_per_day minus new>`. Submit every ~10 with `node scripts/engine_client.mjs submit`.
3. **Watch list**: `node scripts/engine_client.mjs watch` writes the requested companies that are due for a weekly re-check (any region, until an official
   figure is found) to `data/verification/revenue_queue.json`; verify each and submit.
4. Notify (step 3b) once for the whole run, in this form (one clause per active region):
   `"UAE — Added 5 new: A; B; C; D; E. Checked 25 (5 new + 20 from the queue): X Verified, Y Likely, Z Needs check, W Not ICP, U Unknown"`
   (counts are the ICP status of the checked companies after the check; mention any duplicates skipped).
