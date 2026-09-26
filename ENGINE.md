# Account CoPilot — scheduled engine runbook (no API cost)

You are a scheduled Claude Code session working on this repo. Do the queued jobs from the app's Settings → Discovery & refresh engine
using **your own web search** — never the Anthropic API key. You do NOT have database access: everything goes through
`scripts/engine_client.mjs`, which calls the app's limited engine API with `APP_URL` and `ENGINE_TOKEN` from the environment.
Read `CLAUDE.md` first: its data rules, ICP definition, revenue source ladder and result-file format apply exactly.

## 0. Setup
`npm ci --silent` (the environment's setup script may already have done it). If `APP_URL` or `ENGINE_TOKEN` is empty, stop and report
"Engine token missing in the routine environment".

## 1. Claim a job
`node scripts/engine_client.mjs claim` prints e.g. `{"id":"ab12cd34","region":"UAE","count":50,"mode":"verify"}` or `null`.
If `null`, do step 4. `count: "max"` = as many as you can in this session (aim for 50).

## 2. Do the job
- **verify** — `node scripts/engine_client.mjs queue <region> <count>` writes `data/verification/revenue_queue.json`
  (order: Needs check → Unknown → Likely, largest first; companies already checked are excluded). Verify each with web search exactly as
  CLAUDE.md "Current task" describes and write `data/verification/revenue/<slug>.json` in the CLAUDE.md format.
  Every ~10 companies run `node scripts/engine_client.mjs submit` (it applies results and recalculates ICP status in the app).
- **discover** — find up to `count` NEW companies in `region` that meet the ICP (group HQs only; exclude ministries/government bodies,
  single hotels/hospitals/schools/attractions and local branches of foreign HQs). Write them to `data/verification/new_companies.json`
  as `[{"name","website","country","industry","hq_city","why_icp","source_url"}]`, run `node scripts/engine_client.mjs add data/verification/new_companies.json`,
  then verify the added companies' revenue as in **verify** (use the returned slugs).
- **both** — half verify, half discover.

## 3. Finish and notify
`node scripts/engine_client.mjs finish <id> done "<N verified: X Verified, Y Likely, Z Needs check, W Not ICP; M new companies added>"`
(or `finish <id> error "<reason>"`). Claim the next job if time allows. Then ALWAYS, at the very end:
`node scripts/engine_client.mjs log "<one-line summary>" <verified_count> "<new company names separated by ;>"`
— this is the notification under the bell in the app. Do not commit or push anything and do not change app code.

## 4. Default work when no job is queued
Verify 30 UAE companies from the queue (step 2 verify), then notify (step 3 log).
