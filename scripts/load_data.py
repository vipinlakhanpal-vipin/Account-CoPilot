"""Account CoPilot — RECONCILER / HISTORIAN.

Loads per-company research JSON (data/research/*.json), applies Seamless.ai
enrichment (data/enrichment/seamless.json) without overwriting research
observations, assigns stable IDs and returns flat tables for the reporter.
"""
import json
import glob
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RESEARCH_DIR = os.path.join(ROOT, "data", "research")
ENRICH_FILE = os.path.join(ROOT, "data", "enrichment", "seamless.json")
RUN_DATE = "2026-09-25"

GENERIC_PREFIXES = {"info", "sales", "contact", "support", "admin", "hello", "enquiries",
                    "enquiry", "procurement", "careers", "hr", "ir", "investor", "investors",
                    "media", "press", "marketing", "office", "mail", "customercare", "service"}
PERSONAL_DOMAINS = {"gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "live.com",
                    "icloud.com", "aol.com", "msn.com", "proton.me", "protonmail.com", "ymail.com"}

SIGNAL_ORDER = ["VERY STRONG SIGNAL", "STRONG SIGNAL", "MODERATE SIGNAL", "WEAK SIGNAL",
                "NO SIGNAL", "CONFLICTING SIGNAL"]


def norm(s):
    return re.sub(r"[^a-z0-9]", "", str(s or "").lower())


def contact_key(company, name):
    return f"{norm(company)}|{norm(name)}"


def email_ok(email):
    """Reject generic mailboxes and personal domains."""
    if not email or "@" not in email:
        return False
    local, domain = email.lower().split("@", 1)
    if domain in PERSONAL_DOMAINS:
        return False
    if local.split(".")[0] in GENERIC_PREFIXES or local in GENERIC_PREFIXES:
        return False
    return True


def load_enrichment():
    if not os.path.exists(ENRICH_FILE):
        return {}
    with open(ENRICH_FILE) as f:
        return json.load(f)


def load_all():
    enrich = load_enrichment()
    accounts, contacts, signals, sources, history, conflicts, apps = [], [], [], [], [], [], []
    files = sorted(glob.glob(os.path.join(RESEARCH_DIR, "*.json")))
    for ci, path in enumerate(files, 1):
        with open(path) as f:
            try:
                d = json.load(f)
            except json.JSONDecodeError as e:
                print(f"SKIP invalid JSON {path}: {e}")
                continue
        co = d.get("company", {})
        cid = f"C{ci:03d}"
        cname = co.get("company_name") or os.path.basename(path)[:-5]
        co["company_id"] = cid
        co["company_name"] = cname
        co.setdefault("country", "UAE")
        co["last_researched"] = RUN_DATE
        co["first_found"] = co.get("first_found") or RUN_DATE
        co["research_channel"] = "Claude"
        co["_file"] = os.path.basename(path)
        accounts.append(co)

        for a in co.get("third_party_apps") or []:
            apps.append({"company_id": cid, "company": cname, **a})

        for s in d.get("signals") or []:
            signals.append({"company_id": cid, "company": cname, "research_channel": "Claude", **s})

        for s in d.get("sources") or []:
            sources.append({"company_id": cid, "company": cname, "research_channel": "Claude", **s})

        for h in d.get("employment_history") or []:
            history.append({"company_id": cid, **h})

        for c in d.get("conflicts") or []:
            conflicts.append({"company_id": cid, "company": cname, **c})

        for pi, p in enumerate(d.get("contacts") or [], 1):
            p = dict(p)
            p["contact_id"] = f"{cid}-P{pi:02d}"
            p["company_id"] = cid
            p["company"] = cname
            p["company_website"] = co.get("company_website", "")
            p["research_channel"] = "Claude"
            p["channel_state"] = "Claude"
            p["research_date"] = RUN_DATE
            p["first_found"] = RUN_DATE
            p["last_verified"] = RUN_DATE if p.get("verification_status") == "VERIFIED" else ""
            p["record_status"] = "New (Claude)"
            p.setdefault("nationality", "Not Publicly Verified")
            if not p.get("nationality"):
                p["nationality"] = "Not Publicly Verified"
            # account-level S2P context on each contact row
            p["existing_s2p_product"] = co.get("existing_s2p_product", "Unknown")
            p["s2p_platform_status"] = co.get("s2p_platform_status", "Unknown")
            p["account_s2p_signal"] = co.get("s2p_signal_level", "NO SIGNAL")
            p["coupa_opportunity_type"] = co.get("coupa_opportunity_type", "No Evidence")
            p["ariba_opportunity_type"] = co.get("ariba_opportunity_type", "No Evidence")
            p["notes_company"] = co.get("s2p_strong_signals") or co.get("account_notes", "")
            if p.get("email") and not email_ok(p["email"]):
                p["notes_contact"] = (p.get("notes_contact", "") +
                                      f" [Removed non-compliant email {p['email']} — generic/personal]").strip()
                p["email"], p["email_status"] = "", "Not Found"

            e = enrich.get(contact_key(cname, p.get("full_name")))
            if e:
                apply_enrichment(p, e, conflicts, history)
            if not p.get("email_status"):
                p["email_status"] = "Not Found"
            contacts.append(p)
    contacts = merge_reference(accounts, contacts, conflicts)
    return dict(accounts=accounts, contacts=contacts, signals=signals, sources=sources,
                history=history, conflicts=conflicts, apps=apps)


REF_FILE = os.path.join(ROOT, "data", "reference", "stakeholders_ref.json")
HONORIFICS = re.compile(r"^(dr|eng|engr|mr|mrs|ms|h\.?e|sheikh|shaikh)\.?\s+", re.I)


def name_key(n):
    n = str(n or "").strip()
    while HONORIFICS.match(n):
        n = HONORIFICS.sub("", n)
    return norm(n)


def similar(a, b):
    import difflib
    return difflib.SequenceMatcher(None, norm(a), norm(b)).ratio()


def ref_channel(state):
    s = str(state or "").lower()
    if s.startswith("copilot"):
        return "Copilot"
    if s.startswith("claude"):
        return "Claude (prior run)"
    return "Reference"


def merge_reference(accounts, contacts, conflicts):
    """Reference rows (Copilot + prior Claude) are carried verbatim. Claude rows from this run are kept only
    when they add a new person, a materially different title, or new contact details."""
    if not os.path.exists(REF_FILE):
        return contacts
    by_slug = {a["_file"][:-5]: a for a in accounts}
    refs = json.load(open(REF_FILE))
    ref_rows = []
    for r in refs:
        a = by_slug.get(r["_slug"])
        if not a:
            continue
        tier = r.get("Contact tier", "")
        ref_rows.append({
            "contact_id": f"{a['company_id']}-R{r['_ref_row']}", "company_id": a["company_id"],
            "company": a["company_name"], "company_ref_name": r.get("Company", ""),
            "company_website": a.get("company_website", ""),
            "full_name": r.get("Full name", ""), "nationality": r.get("Nationality", ""),
            "title_verbatim": r.get("Title (verbatim)", ""), "role_family": r.get("Role family", ""),
            "contact_tier": f"Tier {tier}" if isinstance(tier, int) else str(tier),
            "owner": r.get("Owner", ""), "channel_state": r.get("Channel-state", ""),
            "channel_source": r.get("Channel-state", ""), "research_channel": ref_channel(r.get("Channel-state")),
            "email": r.get("Email", ""), "email_status": r.get("Email status\nActive/Inactive", "") or r.get("Email status", ""),
            "phone": r.get("Phone", ""), "linkedin_url": r.get("LinkedIn URL", ""),
            "warm_intro": r.get("Warm intro?", ""), "notes_contact": r.get("Notes / intel", ""),
            "source": f"FINAL-UAE-Target-LIST-V3.1 · Stakeholders row {r['_ref_row']}",
            "source_type": "Reference workbook (unchanged)", "record_status": "Reference V3.1 (unchanged)",
            "existing_s2p_product": a.get("existing_s2p_product", "Unknown"),
            "s2p_platform_status": a.get("s2p_platform_status", "Unknown"),
            "account_s2p_signal": a.get("s2p_signal_level", "NO SIGNAL"),
            "coupa_opportunity_type": a.get("coupa_opportunity_type", "No Evidence"),
            "ariba_opportunity_type": a.get("ariba_opportunity_type", "No Evidence"),
            "notes_company": a.get("s2p_strong_signals") or a.get("account_notes", ""),
            "claude_check": "", "_is_ref": True,
        })
    kept = []
    for p in contacts:
        same = [r for r in ref_rows if r["company_id"] == p["company_id"]
                and similar(name_key(r["full_name"]), name_key(p.get("full_name"))) > 0.85]
        if not same:
            p["record_status"] = "New (Claude) — not in reference"
            kept.append(p)
            continue
        titles_match = any(similar(r["title_verbatim"], p.get("title_verbatim")) >= 0.8 for r in same)
        ref_emails = {norm(r["email"]) for r in same if r["email"]}
        ref_phones = {re.sub(r"\D", "", str(r["phone"])) for r in same if r["phone"]}
        ref_li = {norm(r["linkedin_url"]).replace("https", "").replace("www", "").rstrip("/") for r in same if r["linkedin_url"]}
        diffs = []
        if not titles_match:
            diffs.append("Title differs — reference: " + " / ".join(f"'{r['title_verbatim']}' ({r['channel_state']})" for r in same)
                         + f" vs Claude: '{p.get('title_verbatim')}' ({p.get('source_type','')}: {p.get('source_url','')})")
        if p.get("email") and norm(p["email"]) not in ref_emails:
            diffs.append(f"Email not in reference: {p['email']} ({p.get('email_status','')}, {p.get('email_source','')})")
        if p.get("phone") and re.sub(r"\D", "", p["phone"]) not in ref_phones:
            diffs.append(f"Phone not in reference: {p['phone']}")
        pli = norm(p.get("linkedin_url")).replace("https", "").replace("www", "").rstrip("/")
        if pli and ref_li and pli not in ref_li:
            diffs.append(f"Different LinkedIn URL: {p['linkedin_url']}")
        if pli and not ref_li:
            diffs.append(f"LinkedIn URL added: {p['linkedin_url']}")
        check = (f"Claude 25-Sep-2026: {p.get('verification_status','')} via {p.get('source_type','')} "
                 f"{p.get('source_url','')}").strip()
        for r in same:
            r["claude_check"] = ("Confirmed — " if titles_match else "Seen with different title — ") + check
        if diffs:
            refs_txt = ", ".join(f"row {r['contact_id'].split('-R')[-1]} ({r['channel_state']})" for r in same)
            p["notes_contact"] = (f"SAME PERSON AS REFERENCE {refs_txt}. Differences: " + " | ".join(diffs)
                                  + (" || " + p["notes_contact"] if p.get("notes_contact") else ""))
            p["record_status"] = "Claude — differs from reference"
            p["_ref_enriched"] = any("seamless" in str(r["channel_state"]).lower() for r in same)
            kept.append(p)
    # reference rows first per company (unchanged), then Claude additions
    return ref_rows + kept


def apply_enrichment(p, e, conflicts, history):
    """Seamless.ai data is an additional observation — it fills blanks, never overwrites."""
    notes = []
    if e.get("rejected"):
        p["notes_contact"] = (p.get("notes_contact", "") + " | Seamless: " + e.get("rejected_reason", "")).strip(" |")
        return
    if e.get("email_candidate") and not p.get("email"):
        p["email_candidate"] = e["email_candidate"]
    em = (e.get("email") or "").strip()
    if em and email_ok(em):
        if not p.get("email"):
            p["email"] = em
            p["email_status"] = e.get("email_status", "Unverified")
            p["email_source"] = "Seamless.ai"
            p["email_confidence"] = e.get("email_confidence", "")
        elif p["email"].lower() != em.lower():
            conflicts.append({"company_id": p["company_id"], "company": p["company"],
                              "entity": p["full_name"], "field": "Email",
                              "value_a": p["email"], "source_a": p.get("email_source", "Research"),
                              "value_b": em, "source_b": "Seamless.ai",
                              "determination": "Both retained; research value kept in row",
                              "evidence": ""})
    ph = (e.get("phone") or "").strip()
    if ph and not p.get("phone"):
        p["phone"] = ph
        p["phone_type"] = e.get("phone_type", "")
        p["phone_source"] = "Seamless.ai"
    if e.get("linkedin_url") and not p.get("linkedin_url"):
        p["linkedin_url"] = e["linkedin_url"]
    st = e.get("title")
    if st and norm(st) != norm(p.get("title_verbatim")):
        conflicts.append({"company_id": p["company_id"], "company": p["company"],
                          "entity": p["full_name"], "field": "Title",
                          "value_a": p.get("title_verbatim", ""), "source_a": p.get("source", ""),
                          "value_b": st, "source_b": "Seamless.ai",
                          "determination": "CONFLICT — TITLE (both retained)", "evidence": ""})
        notes.append(f"Seamless title: '{st}'")
    sc = e.get("company")
    if sc and norm(sc)[:6] and norm(sc)[:6] not in norm(p["company"]) and norm(p["company"])[:6] not in norm(sc):
        notes.append(f"Seamless shows current company '{sc}' — possible employment change")
        history.append({"company_id": p["company_id"], "full_name": p["full_name"], "company": sc,
                        "title": st or "", "source": "Seamless.ai", "source_url": "",
                        "date_found": RUN_DATE, "determination": "Possible employment change — review",
                        "evidence": "Seamless.ai record company differs from research source"})
        p["employment_status"] = "Recently Changed?"
    for j in e.get("job_history") or []:
        history.append({"company_id": p["company_id"], "full_name": p["full_name"],
                        "company": j.get("companyName", ""), "title": j.get("title", ""),
                        "source": "Seamless.ai job history", "source_url": "",
                        "date_found": RUN_DATE,
                        "determination": "Previous employment",
                        "evidence": f"{j.get('startedAt','')} – {j.get('endedAt','')}"})
    if e.get("location") and not p.get("location"):
        p["location"] = e["location"]
    cs = p.get("channel_source", "Claude-Web")
    if "Seamless" not in cs:
        p["channel_source"] = cs + " + Seamless"
    if notes:
        p["notes_contact"] = (p.get("notes_contact", "") + " | " + "; ".join(notes)).strip(" |")


if __name__ == "__main__":
    d = load_all()
    for k, v in d.items():
        print(k, len(v))
