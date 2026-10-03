# Account CoPilot — How It Works

*A one-page explainer for anyone new to the app — what it is, how it works, and how to talk about it.*

## What it is

Account CoPilot is an autonomous AI Agent, not a chatbot you have to prompt. It runs itself every morning, finds and checks companies against your target profile, and reports back — no one has to click anything for the daily work to happen. It never invents a number: every figure it records carries a source and a confidence label (Fact, Likely, Unverified, or Unknown).

## The 4-step engine

Every company goes through the same research loop:

1. **Find** — searches the open web, stock-exchange filings, company sites, business press and job postings for companies that could fit the target profile.
2. **Check** — reads official sources (annual reports, exchange filings, investor results) for the real numbers, before ever relying on an estimate.
3. **Verify** — labels every fact by how solid it is: Fact (official source), Likely (credible estimate), Unverified, or Unknown — always with the source link.
4. **Re-check** — anything short of Fact is revisited on a schedule, so a growing company's status improves automatically over time.

## Procurement & IT maturity — the other question people ask

Finding the right accounts is half the job; knowing how *ready* each one is for a Source-to-Pay implementation is the other half. Every account's brief now opens straight into a **Procurement & IT maturity** rating — Advanced, Developing, Basic or Unknown — built from four things that actually predict readiness: whether they already run a competing S2P suite (Coupa, Ariba, GEP, Jaggaer, Ivalua, Zycus), their core ERP (SAP, Oracle, Microsoft…), the strength of any buying signal found, and their addressable spend. Each rating comes with a plain-English reason, not just a label. This is the question colleagues ask most ("is this account mature enough to pitch?") and now the app answers it before anyone has to dig.

## ICP — what decides targeting

"ICP" (Ideal Customer Profile) is the set of rules that decides which companies are worth tracking: revenue floor, employee count, industries, and which departments to target for contacts. It's set per region — UAE, KSA, Qatar and the rest can each carry different thresholds. Change it once for a region, and the daily run, in-app research, and the account ranking all pick it up automatically — there's no separate copy to fall out of sync.

## Free vs. paid

- **Free** — the daily run, and anything queued for it to pick up, run on the Claude plan. No Anthropic API key is touched.
- **Paid** — on-demand deep research (Research Queue, Research more, Draft pitch, paid Refresh) uses the Anthropic API key. Each shows its estimated cost before you confirm, and a PIN can be required before anything is spent.

## The 5 tabs

| Tab | What it does |
| --- | --- |
| Home | Orientation and the Setup Wizard — where to start someone new |
| Dashboard | The big picture; drill into any number |
| Accounts | Every company, ranked, with ICP status |
| Stakeholders | The people — seniority and buyer-persona fit |
| Data / Setup | Where facts came from, conflicts, and all configuration (ICP rules, engine settings, team access) |

## The 30-second pitch

"It's an AI agent that runs itself every morning — finds companies that fit our target profile, checks their real financials against official sources, and never guesses. For every account it also tells you how procurement-and-IT-mature they are and why, so you know who's actually ready for an S2P conversation. Everything it tells you has a source and a confidence label attached. You set the targeting rules once per region, and it just keeps working."

**Where to start someone new:** Home tab → Setup Wizard. It walks through region, company size, targeting, data sources and daily pace in about five minutes, and shows exactly what to expect once it's running.
