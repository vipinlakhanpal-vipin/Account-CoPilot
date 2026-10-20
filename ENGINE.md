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
- `active` lists the regions to work on, **already in the order to work them (High priority first)**, each with its `priority` (high / medium / low), `market` (Market intelligence on or off) and its daily counts (`discover_per_day`, `verify_per_day`). The counts are the user's counts from Define ICP times the priority share (High 100%, Medium half, Low a quarter, rounded up; `set_*` shows the base). Use the counts as printed. Never discover in a region that is not active.

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
If `null`, do step 4. `count: "max"` = as many as you can in this session (aim for 50). A `mode: "discover"` or `company` job may also carry `focus` (`{"<name>":"<text>"}`): the product, solution or service the user said they are looking for at that company (typed in brackets after the name). Research that specifically for the company (does it use it, need it, have a project for it), put what you found in `why_icp`, and put the user's text in `"focus"` on that company's record in the `add` file; the server keeps it in the account notes. Do not assume a vendor or product the user did not name. A `mode: "discover"` job may also carry `company_names` (specific names the user
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
  `.om` → Oman, `.bh` → Bahrain, `.eg` → Egypt, `.za` / `.co.za` → South Africa, `.ke` → Kenya, `.in` / `.co.in` → India, `.ch` → Switzerland, `.ma` → Morocco, `.uk` / `.co.uk` → UK, `.de` → Germany); write the country as the region's plain name (for example "South Africa", not "SouthAfrica"); otherwise use its HQ address, exchange listing or press coverage. While you're determining its real country, also determine
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

- **pitch** — a free pitch plan for ONE account (`slug`, `company_name`). `node scripts/engine_client.mjs pitch_facts <slug>` writes `data/verification/pitch_facts.json` (the account's facts: ICP, revenue and its status, ERP, S2P, signals, buying signals, technology, contact names and titles).
  Optionally search the web for fresh PUBLIC information about the company (news, capex or ERP programmes, tenders, leadership changes, partner announcements) and use only what you can cite. Write the plan to `data/verification/pitch.txt`, plain text under about 400 words, with exactly these headings:
  1. Situation (2-3 bullets citing the evidence; say where a fact is an estimate or conflicts), 2. What to pitch, ranked (managed services, optimisation, integration, implementation, evaluation support) and why, 3. Who to approach first and the angle for each named contact (flag any contact whose employer is doubtful), 4. Five discovery questions for the first call, 5. Risks and what to validate, then 6. Opening message: a short email or LinkedIn note (under 90 words) to the first contact, using only facts on file.
  Use ONLY the facts and what you cite; where something is unknown, say it must be validated; never invent a figure, system or name. SCP is a Coupa and SAP Ariba implementation, integration and managed-services partner in the Middle East. Save with `node scripts/engine_client.mjs save_pitch <slug> data/verification/pitch.txt`, then `finish <id> done "<Company>: pitch plan written"`.
- **market** — market intelligence (Market intelligence window): the job has `vendor` (SAP, Coupa, Oracle, Microsoft or `all`) and `region`. The work is the **Market intelligence** procedure below.
- **signals** — buying signals (Buying signals tab). A job with `slug` = scan that one company; a job without `slug` = a region sweep (`region`, `count` companies). The work is the **Buying signals** procedure below.

## Enrichment: ERP, S2P platform, S2P signal and people (since v5.97)
Why: Priority accounts, the Pipeline and the account pages only come alive for a company once it has an ERP, an existing S2P platform, an S2P signal level and people. A company that was only revenue-verified shows nothing, so a new region looks empty (South Africa did: 50 verified accounts, no signal, no ERP, no contacts). So **research these four things whenever you verify**, not only revenue.
For every company you verify (the new ones first), and then for `node scripts/engine_client.mjs enrich_queue <region> <N>` (N = half of `verify_per_day`, rounded up, at least 3; it lists Verified and Likely accounts never enriched, largest first), use public web search only:
- **ERP**: the company's website, annual report, careers and job posts (SAP, S/4HANA, Oracle, Dynamics, Infor ...), implementation-partner case studies, vendor customer pages. `erp` is the system's name; `erp_status` FACT (a document names it), LIKELY (job posts or partner pages), UNVERIFIED, UNKNOWN.
- **Existing S2P / procurement platform**: Coupa, SAP Ariba, Other S2P (Jaggaer, Ivalua, GEP, Zycus ...), or No Evidence (searched, nothing found). Look at supplier-portal and supplier-onboarding pages, job posts, vendor customer lists, press. A confirmed Coupa customer is not a prospect: record it, and say so in `existing_s2p_detail`.
- **S2P signal level** (`s2p_signal_level`): VERY STRONG SIGNAL = an announced procurement, S2P or ERP programme with a scope or date, or a live tender or RFP, from a document; STRONG SIGNAL = an executive statement or press about procurement transformation, plus hiring; MODERATE SIGNAL = hiring or indirect evidence; WEAK SIGNAL = generic; NO SIGNAL = searched and nothing found. Put what you found in `s2p_strong_signals`, in your own words. Never invent.
Write `data/verification/enrich.json` as `[{"slug","erp","erp_status","erp_evidence","existing_s2p_product","s2p_platform_status","existing_s2p_detail","s2p_signal_level","s2p_strong_signals","known_implementation_partner","source_url"}]` and run `node scripts/engine_client.mjs enrich data/verification/enrich.json`. Every strong claim needs a `source_url` (the server caps it otherwise). A company you searched with nothing found still goes in (UNKNOWN, No Evidence, NO SIGNAL) so it is not repeated. The server fills only empty fields and skips reference and user rows.
**People**: for up to 5 Verified companies per run that have no people (High regions first), search the public web for named procurement, finance and IT leaders (title exactly as published) and save them with `add_contacts` (as in the contacts job: it needs a LinkedIn profile URL or a published named email on the company's domain; never guess an address).
Include in each region's summary line how many companies were enriched and how many strong signals were found.

## Buying signals (job `signals`, and the daily step in section 4)
Goal: find companies that are *seriously looking* for an ERP, a source-to-pay (S2P) solution or procurement consulting, public tenders and RFPs for those, and SAP ECC owners who will need an S/4HANA partner.
Free: public web search only (no API key, no logins, no CAPTCHAs). Regions: every **Active Middle East region** (UAE, KSA, Qatar, Kuwait, Oman, Bahrain, Egypt), in the order `icp` lists them (since v5.67; it was UAE and KSA only). Skip a region outside the Middle East.
Save signals with `node scripts/engine_client.mjs add_signals data/verification/new_signals.json`, a file shaped
`{"scanned":["<slug>",...],"sweep_region":"UAE","signals":[{"lane","strength","label","company_name","slug","region","title","evidence","why","source_name","source_url","doc_url","needs_login","published","closes"}]}`.
- A job with `lane` (`rfp`, `erp` or `ecc`) means search ONLY that lane; a job without `lane` covers all three.
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
Finish a job with `finish <id> done "<Company or Region>: N signals added (X Hot)"` or `"... no signals found"`. Never add signals for a company outside the Middle East regions above.

### Middle East sweep: what counts and where to look (v5.67)
**What counts** (a tender, award, announcement or hiring signal for any of these, at an entity in the region):
- **ERP**: new implementation or replacement, rollout to more entities, ERP support and application management (AMS), upgrades and migrations (SAP ECC to S/4HANA, RISE with SAP, Oracle EBS to Fusion, Dynamics, Infor, local ERPs), licence renewals and enterprise licence agreements (ELA), cloud and hosting for ERP, e-invoicing readiness (ZATCA in KSA, UAE e-invoicing) that forces an ERP change.
- **S2P**: procurement or e-procurement platform, SAP Ariba, Coupa, Jaggaer, Ivalua, GEP, Oracle Procurement, supplier portals and supplier onboarding, invoice automation, P2P support services.
- **S2C**: sourcing and e-tendering tools, contract lifecycle management, supplier management and risk, spend analytics, category management.
- **Procurement transformation**: consulting, managed procurement services, shared-service centres.
- **Upsell and cross-sell** (only for companies already in the app that run SAP, Ariba, Coupa or another platform): a new entity, acquisition or merger, a go-live announced, an Ariba customer facing the SAP Ariba move to SAP BTP, a Coupa customer hiring for modules it does not yet use (sourcing, CLM, supplier risk, spend analytics), a support contract coming to an end. Save these as lane `erp`, title starting "Upsell:" or "Cross-sell:", usually Warm or Watch.
- **Awards** (a contract already given, e.g. "ERP support for three years awarded to X"): lane `erp`, strength Watch, label FACT, `closes` empty; say who won, the term and when the renewal window opens. This shows who is exposed to a competitor's renewal. Never save an award as a tender (`rfp` needs a still-open date).

**Where to look** (public pages only; never register, log in or download-and-rehost):
- KSA: Etimad (the notice pages), Saudi Aramco, SABIC, Ma'aden, STC, SEC and NEOM / PIF-company tender pages, ministries' and municipalities' tender sections, Argaam and Arab News for announcements.
- UAE: Ministry of Finance (federal), Abu Dhabi (ADGPG, ADNOC, EWEC, Mubadala companies, ADQ companies), Dubai (Dubai Government eSupply, DEWA, RTA, Emaar, DP World), Sharjah and other emirates' entity tender pages; Zawya, Gulf News, Arabian Business, Khaleej Times, The National.
- Qatar: Monaqasat (the Ministry of Finance portal; the notice and award pages are public), QatarEnergy, Ooredoo, Qatar Airways, Ashghal, Hamad Medical, Kahramaa.
- Kuwait: Central Agency for Public Tenders (CAPT), KPC, KNPC, KIPIC, Zain, ministries' tender notices; Arab Times and Kuwait Times.
- Oman: Oman Tender Board, OQ, PDO, Omantel, OMRAN, Oman Broadband and other companies' own "Invitation to Bid" PDFs; Times of Oman and Oman Observer.
- Bahrain: Tender Board, Bapco, Alba, Batelco, Tamkeen, Mumtalakat companies; Gulf Daily News.
- Egypt: eTenders portal, the holding companies under the Ministry of Public Enterprise Sector, EGPC and petroleum companies, banks; Amwal Al Ghad, Daily News Egypt, Ahram Online.
- Aggregators (TendersOnTime, GlobalTenders, bidsfactory, TenderTiger): a listing page is only a pointer. Open the notice itself, confirm the title, issuer, dated `published` and a `closes` of today or later, and use the notice page as `source_url`. Many listings are already closed; do not save those as tenders.
- Typical queries (add the country and the year): `ERP implementation tender`, `SAP S/4HANA RFP`, `SAP support services tender`, `application management services tender SAP OR Oracle`, `Oracle Fusion ERP tender`, `e-procurement system tender`, `source to pay RFP`, `Coupa OR Ariba tender OR implementation`, `contract lifecycle management tender`, `procurement transformation consultancy tender`, `supplier portal tender`, `ERP licence renewal tender`, `selects SAP OR Oracle OR Coupa OR Ariba` (press, last 12 months), `awarded ERP support`.
- Search thin results honestly: if a region has no open tender today, say "no open tender found" in the job or run summary. Never fill a quiet day with closed tenders or marketing pages.

## Market intelligence (job `market`, and the daily step in section 4)
Goal: for each vendor, list ALL its partners in a region (a busy region such as UAE has well over 20 for SAP) and the customers each partner publishes on its own website, with public contact details where they exist. Free: public web search only, no logins.
`node scripts/engine_client.mjs market_targets 4` writes `data/verification/market_targets.json` (the vendor x region pairs due, oldest first, with the partner names already known). For a job use `market_targets 1 <VENDOR> <REGION>` (the job's own `vendor` and `region`; `all` = every vendor the app lists, printed in `vendors`).
Only Active regions. Save with `node scripts/engine_client.mjs add_market data/verification/new_market.json`; you may call it several times for the same vendor and region (at most 40 partners and 120 customers per call). File shape:
`{"vendor":"SAP","region":"UAE","checked_partners":["<names of partners whose customers you finished>"],"partners":[{"name","website","tier","services","hq_city","source_url","label","contacts":[]}],"customers":[{"partner","customer","customer_website","project","source_url","published","contacts":[]}]}`
- **Vendors:** SAP, Coupa, Oracle, Microsoft, Boomi, MuleSoft, Ivalua, GEP and Jaggaer by default, plus any the user added in the window; use the name exactly as the app gives it in `vendor`.
- **Partners, be thorough:** go through the vendor's own public partner directory (SAP Partner Finder / PartnerEdge, Coupa partner directory, Oracle PartnerNetwork partner finder, Microsoft partner finder / AppSource, and for the others their own "partners" or "find a partner" page) filtered to the region, page by page and filter by filter (services, industry, city), until the directory has nothing new, then add partners found on the vendor's press releases, events and the partners' own sites. Aim for at least 25 partners per vendor and region where the vendor has that many; the app already lists the ones in `known`, so spend the run on NEW ones (a name already known is simply updated). Skip a partner you cannot tie to the region. **Proof of partnership:** a partner counts as FACT only when the vendor's own partner directory or page lists it (for Coupa, a page under coupa.com/partners). A company's own website or press release saying it works with the vendor is self-announced: save it with `label` LIKELY and say "self-announced, not in the vendor's directory" in `scope_note`. **Which partners to list (strict):** list a partner under a region ONLY if it has a local office in that region, shown by a street address: put the office address in `office_address` and the page that shows it in `office_source` (its own contact or offices page, a regulator register such as DFSA or ADGM, or the vendor's partner page). This applies to local companies and to foreign firms alike. A vendor listing that merely says it supports, covers or serves the region, or lists it as global, is NOT enough. A partner with no office address and source is saved as "Other regions" (hidden from the region list), not listed. A partner with real offices in several regions gets a separate row, with that region's address, for each. Set `branch` true (and `branch_source` = the same page) when the company is headquartered elsewhere. Record where it is actually BASED: `hq_city` and `hq_country` from its own site or listing (for example Chennai and India, or Dubai and UAE). If the vendor's listing says the partner's coverage is Global or a wide region and not this region, set `label` to LIKELY and write that in `scope_note` (for example "Coupa lists it as global, not UAE-specific"); list such a partner under a region only if you also confirm it has an office there. Set `branch` true only when its office in this region is confirmed by a page you cite in `branch_source`, and only when its listing or website shows an office in that region while it is headquartered elsewhere. Never put the scanned region's city on a partner just because you are scanning that region; if you cannot tell where it is based, leave `hq_city` and `hq_country` empty. `hq_city` is the partner's own city (Dubai, Abu Dhabi, Riyadh, Doha ... never the country name); `website` is required whenever the directory listing or the partner shows one (the app links the partner's name to it); `tier` as the vendor states it (Gold, Platinum, Premier ...). `services` in a few words. `source_url` = the page that lists the partner.
- **Customers: do this for EVERY partner you saved, one by one (a partner with no customers after a real search is the exception, not the rule).** A customer counts when the partner or the vendor names it publicly in the same region. Look in all of these, in this order:
  1. the partner's own website: customers, clients, references, portfolio, success stories, case studies, projects, industries and "who we serve" pages (open them; logos with names count when the name is readable text or alt text);
  2. its news, blog, media and press-release pages: go-lives ("went live", "go-live"), new customer wins ("selects", "chooses", "partners with", "awarded", "signs"), project completions, awards, event and webinar speakers from customers;
  3. the vendor's own customer stories and press releases that name the partner as the implementer ("implemented by <partner>");
  4. the partner's LinkedIn company page ONLY through public search-result snippets (search "<partner> go-live", "<partner> new customer", "site:linkedin.com/company/<slug> <customer word>"); cite the snippet's page as `source_url`, label the row LIKELY in `project` text ("per LinkedIn snippet"), and never log in, scroll or scrape LinkedIn;
  5. business press (Zawya, Gulf News, Arabian Business, The National, Reuters, trade sites) quoting the partner and the customer.
  Typical searches per partner: "<partner> customers", "<partner> case study", "<partner> go-live", "<partner> selects", "<partner> successfully implemented", "<partner> SAP S/4HANA" (or the vendor's own product name), "<customer> <partner> implementation". After finishing a partner (even one with no published customers) add its name to `checked_partners`. Record ALL you find: a large implementer can have 50 or more, so page through every list. `market_targets 1 <VENDOR> <REGION>` lists the customers already saved in `known_customers`, so add the ones still missing (a known one is simply updated). Use several `add_market` calls if needed (120 customers per call). `project` = what was delivered; `source_url` = the page that names the customer; `published` when dated. Only customers in the same region (the customer's own operations or HQ there). Do not invent customers from guesses, and do not take them from third-party "top lists" with no link to the partner. Every customer row names its `partner` exactly as in `partners` (the same file, or a partner already saved).
- **Contacts:** after the customers are saved, look for named contacts for up to 5 customers that have none (and for each partner's published alliance or sales contact if it names a person), using the customer's own website, press releases, annual report and search snippets: procurement, supply chain, finance and IT heads first. Put them in `contacts` on that customer row (same file shape, `partner` and `customer` as saved). Rules as Find contacts: title as published, never guess or pattern-build an email or phone, an email must be a named address on that company's own domain (no info@, sales@, personal domains), LinkedIn only from a public page or search snippet, each needs `source_url`; do not open LinkedIn or log in.
- **Job variants:** a job with `phase: "partners"` = partners only: do the **Partners** step thoroughly and do NOT search customers. A job with `phase: "customers"` = customers only for partners already saved: `market_targets 1 <VENDOR> <REGION>` lists up to 8 partners in `partners_due` (their customers were never searched, or not in 45 days; `partners_due_total` is how many remain): run the **Customers** step for each of them, save the customers with `add_market`, and put the names of the partners you completed in `checked_partners` (a partner with no published customers is still listed there, so it is not repeated). Finish with `finish <id> done "<Vendor> · <Region>: customers searched for N partners, C customers added (M partners still due)"`. a job with `partner` and no `customer` = a deep dive into that one partner: read its whole published customer list (every case study, reference and press page, any customer page or PDF that opens without a login) and add every customer not yet in `known_customers`; do not add other partners. Finish with `finish <id> done "<Partner>: N new customers added"`. a job with `customer` (and `partner`) = find contacts for that one customer only: run the contact search above and save with `add_market` using one `customers` row (`partner`, `customer`, `customer_website`, `contacts`) and no new partners. A job with `contacts_only` = find contacts for up to 10 customers of that vendor and region that have none: `market_targets 1 <VENDOR> <REGION>` lists them in `needs_contacts` (partner, customer, customer_website) in `data/verification/market_targets.json`; run the contact search for each and save with `add_market`. Finish with `finish <id> done "<Vendor> · <Region>: contacts found for N of M customers"`.
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
**Priority (set by the Super Admin per region in Define ICP, and per kind of work here).** The user's own jobs always come first. Then work every region in the order `active` lists them (High, then Medium, then Low), finishing a region's steps 1 to 3 before the next. If the session runs short, the Low regions and the later steps are what get cut, never the High ones.

| Priority | Work | When |
|---|---|---|
| **High** | queued jobs; verifying and enriching (ERP, S2P platform, S2P signal) the companies you just added; "Needs check" and "Unknown" accounts; the watch list | every run, first |
| **Medium** | the enrichment queue (`enrich_queue`) and people for up to 5 Verified companies; finding new companies; verifying "Likely" accounts; Market intelligence partners and customers for SAP and Coupa (regions with `market` on); buying signals (a tender sweep in every Active Middle East region: High regions daily, Medium every 3 days, Low weekly) | every run, after High |
| **Low** | the 180-day re-checks; the other vendors' partner scans (Oracle, Microsoft, Boomi, MuleSoft, Ivalua, GEP, Jaggaer, added vendors); contacts for accounts with no people; deep dives into one partner | only with spare time, a slice per run |

For **each region in `active`** of `icp_rules.json` (default: UAE, find 5, verify 25), in that order:
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
   **Enrich as you verify** (see "Enrichment" above): for the same companies research ERP, existing S2P platform and S2P signal level, save with `engine_client.mjs enrich`, then work `enrich_queue <region> N` for older accounts that have never been enriched.
3. **Watch list**: `node scripts/engine_client.mjs watch` writes the requested companies that are due for a weekly re-check (any region, until an official
   figure is found) to `data/verification/revenue_queue.json`; verify each and submit.
4. Notify (step 3b) separately for EACH active region worked this run — one `log` call per region, each covering only that region's own companies and rows
   (never combine regions into one call or one comma-joined region). Each region's own summary, in this form:
   `"UAE — Added 5 new: A; B; C; D; E. Checked 25 (5 new + 20 from the queue): X Verified, Y Likely, Z Needs check, W Not ICP, U Unknown"`
   (counts are the ICP status of the checked companies after the check; mention any duplicates skipped). If a region's planned count can't be reached normally
   (e.g. its queue is empty) and you pad it with extra new companies to still hit the day's target, say so plainly in that region's own summary and flag it as
   over quota — the user reviews these.
5. **Buying signals (every Active Middle East region, after the rest, if time allows)**: for each region in `active` that is in the Middle East (UAE, KSA, Qatar, Kuwait, Oman, Bahrain, Egypt), in the order `icp` printed them, run the **Buying signals** procedure and the **Middle East sweep** above:
   `signal_targets <REGION> N` (it also prints `last_sweep`). A High region gets a sweep every run and N = 10; a Medium region only when `last_sweep` is more than 3 days old (N = 5); a Low region only when it is more than 7 days old (N = 3).
   The sweep searches all categories (ERP, S2P, S2C, support and upgrades, upsell and cross-sell, awards) in that region; then scan the returned companies; save with `add_signals` (`sweep_region` set). Skip it silently if the session is short on time; never let it delay the revenue work above.
6. **Market intelligence (after everything above)**:
   a. **Partners:** `market_targets 2`, then the **Partners** step of the Market intelligence procedure for those vendor x region pairs only (do not search their customers in this step). The app already lists only Active regions whose `market` switch is on, High priority first, and SAP and Coupa before the other vendors; the other vendors get a turn once SAP and Coupa for that region were scanned in the last 7 days. Save with `add_market`.
   b. **Customers (the default: nobody has to click "Find more customers"):** the same command also writes `data/verification/customers_due.json`: Active vendor x region pairs with partners whose customers were never searched, or not in 45 days (SAP and Coupa first). Work down it until you have searched the customers of **8 partners in total this run**: run the **Customers** step for each one (exactly as in a `phase: "customers"` job), save with `add_market` and put every finished partner in `checked_partners` (a partner with no published customers still goes in, so it is not repeated). `customers_due` shrinks by itself as partners are checked, so unfinished partners carry over to the next run. Skip silently only if the session is short; the revenue work above always comes first.
