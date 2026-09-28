# Moving Account CoPilot to another Claude account

Use this when the scheduled work should run under a different Claude account (for example from the SCP account to a personal one).
It works for any version of the app: every step reads the **current** setup at the time you migrate instead of relying on a copy made earlier.

## What moves and what doesn't
| Tied to the Claude account (moves) | Not tied to a Claude account (unchanged) |
|---|---|
| The scheduled routine(s): daily 6am run, hourly or instant triggers | The app on Vercel, its URL and users |
| The cloud environment holding `APP_URL` and `ENGINE_TOKEN` | All data in Supabase (accounts, contacts, ICP, settings) |
| The GitHub connection on claude.ai | The GitHub repositories (they belong to your GitHub account) |
| Whose plan the scheduled runs use | Define ICP, roles and regions, paid-actions PIN, HubSpot data in the app |

Before you start: make sure your organisation is happy for its data to be processed under the new Claude account.

## Steps (about 15 minutes)

### A. In the OLD Claude account: record the current setup
1. Open Claude Code signed in to the **old** account, in this project folder, and say:
   > "Follow MIGRATION.md step A: list my Account CoPilot routines and triggers and save their current configuration."

   Claude lists the routines (RemoteTrigger `list` / `get`) and writes their current prompt, schedule, model, environment name and any GitHub triggers to
   `data/verification/routines_backup.json`. This folder is git-ignored and never pushed.
2. Note which GitHub repositories the old connection used (claude.ai → Settings → Connectors → GitHub).

### B. In the NEW Claude account: connect and prepare
1. Sign in to claude.ai with the **new** account and connect GitHub at <https://claude.ai/connect-github>.
   Choose **Only select repositories** and tick the same ones as before (at least `Account-CoPilot`, plus `account-copilot-jobs` if instant triggers are used).
2. In the app, go to **Setup → Settings → Scheduled session access** and click **Regenerate token**. Copy the two lines shown (`APP_URL=…` and `ENGINE_TOKEN=…`).
   This immediately stops the old account's routine from working, so nothing can run twice.
3. In claude.ai (new account) create a cloud environment: **Code → Environments → New**, name it `Account CoPilot engine (token)`,
   paste the two lines into **Environment variables**, and leave the **setup script empty**. Never put the Supabase key there.

### C. In the NEW Claude account: recreate the routines
1. Open Claude Code signed in to the **new** account, in this project folder, and say:
   > "Follow MIGRATION.md step C: recreate my Account CoPilot routines from data/verification/routines_backup.json in this account, using the environment 'Account CoPilot engine (token)'."

   Claude recreates each routine with the same prompt, schedule and model, and re-attaches any GitHub trigger (for example "issue opened in account-copilot-jobs").
   If the backup is missing, Claude rebuilds the routine from `ENGINE.md` and `CLAUDE.md` (the daily run: 02:00 UTC = 6am Dubai, Sonnet, the engine token environment).
2. Ask Claude to **run the routine once now** as a test. Check that the bell in the app shows a new entry.

### D. Clean up the OLD account
1. In the old account open <https://claude.ai/code/routines> and delete the Account CoPilot routine(s).
2. Optionally disconnect GitHub from the old account (claude.ai → Settings → Connectors).
3. If the app uses instant triggers: create a new fine-grained GitHub token if the old one belonged to someone else, and update it in Vercel
   (only needed if the GitHub account changes, not when only the Claude account changes).

## Checks after moving
- **Bell:** the next scheduled run posts a notification.
- **Settings → Search companies:** a queued job moves from Waiting to In progress to Completed.
- **Old account:** its routines page shows nothing for Account CoPilot.
