---
name: account-copilot
description: Account CoPilot B2B procurement-intelligence agent. Researches Middle East (UAE first) listed companies and their procurement/finance/IT/transformation decision makers, detects Coupa / SAP Ariba / S2P signals, ERP and third-party apps, enriches contacts via Seamless.ai, and generates the Master Book workbook, the Stakeholders sheet and the in-app dashboard. Trigger on "research <company>", "find procurement decision makers in <country>", "refresh accounts", "run Account CoPilot", "add Claude rows to the Copilot file".
---

# Account CoPilot

The work is split between separate roles. Don't let one prompt do everything.

| Role | How |
|---|---|
| RESEARCHER / EXTRACTOR / VERIFIER | One subagent per batch of about 8 companies, following `RESEARCH_SCHEMA.md` and writing `data/research/<slug>.json` |
| ENRICHER | Main session: Seamless.ai `research_contacts` (uses credits) → `data/enrichment/seamless.json` |
| RECONCILER / HISTORIAN | `scripts/load_data.py`: stable IDs, fills blanks only, never overwrites, logs conflicts and employment history |
| SIGNAL / OPPORTUNITY ANALYST | Fields in each research file (signal level, Coupa/Ariba opportunity type, potential opportunity), always with evidence |
| REPORTER | `scripts/build_workbook.py` (Master Book) and `scripts/build_dashboard.py` (in-app dashboard) |
| COPILOT MERGE | `scripts/merge_copilot.py <copilot.xlsx>`: append-only Claude rows |

## ICP (default)
UAE stock-listed (ADX / DFM / Nasdaq Dubai), net revenue > USD 250M, at least 100 employees. Next geographies to expand to: KSA, Qatar, Kuwait, Oman, Egypt.

## Run
1. **Universe.** Build or refresh the company list (`data/universe.txt`, one group per line). Check the Seamless `search_companies` coverage (free), but rely on the exchange listings.
2. **Research.** Spawn one general-purpose subagent per group with the researcher prompt in `prompts/researcher.md`. The subagents may call the free Seamless `search_contacts` and `search_companies`. They must NOT call `research_*`, which uses credits.
3. **Enrich.** For each contact without a verified email or phone, call `research_contacts` with `contactName` + `domain` (or `liProfileUrl`), then `poll_contact_research`. Save the results as a `{ "<normcompany>|<normname>": {email, email_status, phone, phone_type, title, company, linkedin_url, location, job_history} }` map in `data/enrichment/seamless.json`. The key uses `load_data.contact_key`. Set email_status to "Verified Active" only when Seamless marks the email valid or verified; otherwise use "Unverified". Check `get_credits` before and after.
   Then run `python3 scripts/build_enrichment.py`, which applies the email/phone rules: only "valid" emails on the company's own domain; catch-all emails go only as labelled candidates.
4. **Reference merge.** `python3 scripts/import_reference.py "<reference xlsx>"` maps the Stakeholders worksheet rows to the ICP accounts and carries them unchanged. Claude rows are kept only when they add a new person or materially different details (see `merge_reference` in `load_data.py`).
5. **Build.** `python3 scripts/build_workbook.py`, then `python3 scripts/build_dashboard.py`. The dashboard embeds the xlsx for its download button.
6. **Publish.** Publish `output/site/index.html` as an Artifact with capabilities `{downloads: true, sample: {}}`.
7. **Copilot comparison (optional).** `python3 scripts/merge_copilot.py <path-to-copilot.xlsx>` writes `<name>_with_Claude.xlsx` and leaves the original untouched.

## Hard rules
- Never invent or pattern-guess emails or phones. Never use generic mailboxes or personal domains.
- Never infer nationality. Titles stay verbatim.
- Only claim LinkedIn or Sales Navigator when a source was actually seen. Search snippets are labelled as snippets.
- Keep every observation. Conflicts keep both values.
- Research Channel ≠ Source. Channel is Claude or Copilot; Source is the actual website, report, LinkedIn page and so on.
