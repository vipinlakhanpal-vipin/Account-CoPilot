# Account CoPilot — scheduled engine runbook (no API cost)

You are a scheduled Claude Code session working on this repo. Do the queued jobs from the app's
Settings → Discovery & refresh engine, using **your own web search** (never the Anthropic API key, never `verify_revenue.mjs` without `--apply`).
Read `CLAUDE.md` first: its data rules, ICP definition, revenue source ladder and result-file format apply exactly.

## 0. Setup
```bash
npm ci --silent
printf "NEXT_PUBLIC_SUPABASE_URL=%s\nSUPABASE_SECRET_KEY=%s\n" "$NEXT_PUBLIC_SUPABASE_URL" "$SUPABASE_SECRET_KEY" > .env.local   # git-ignored
```
If either variable is empty, stop and report "Supabase secrets missing in the routine environment".

## 1. Claim a job
`node scripts/engine_jobs.mjs claim` prints a job like `{"id":"ab12cd34","region":"UAE","count":50,"mode":"verify"}` or `none`.
If `none`, do step 4 (default work) instead. `count: "max"` = as many as you can in this session (aim for 50).

## 2. Do the job
- **verify** — `node scripts/export_revenue_queue.mjs`, take the first `count` companies whose country matches `region`
  (queue order: Needs check → Unknown → Likely largest first), verify each with web search exactly as CLAUDE.md "Current task" describes,
  write `data/verification/revenue/<slug>.json`, and every ~10 companies run
  `node scripts/verify_revenue.mjs --apply && node scripts/recompute_icp.mjs`.
- **discover** — find up to `count` NEW companies in `region` that meet the ICP (group HQs only; exclude ministries/government bodies,
  single hotels/hospitals/schools/attractions, local branches of foreign HQs; check the app doesn't already have them).
  Write them to `data/verification/new_companies.json` (format in `scripts/add_companies.mjs`), run `node scripts/add_companies.mjs`,
  then verify their revenue as in **verify**.
- **both** — split the count: half verify, half discover.

## 3. Finish
`node scripts/engine_jobs.mjs done <id> "<N verified: X Verified, Y Likely, Z Needs check, W Not ICP; M new companies added>"`
(or `error <id> "<reason>"`). Claim the next job if time allows.
Do **not** commit result files (`data/` is git-ignored) and do not change app code.

## 4. Default work when no job is queued
Verify 30 companies from the revenue queue for UAE (same method), then finish without claiming.
