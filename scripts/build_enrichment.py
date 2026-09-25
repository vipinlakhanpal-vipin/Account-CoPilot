"""Account CoPilot — ENRICHER post-processing.

Turns raw Seamless.ai results (data/enrichment/raw_results*.json) into data/enrichment/seamless.json,
applying the email/phone rules:
  * Email is populated only when Seamless marks it "valid" AND it is on the company's own domain.
    -> Email Status "Verified Active", with the Seamless confidence.
  * "accept all" emails are catch-all domains that cannot be verified; they are kept only as a labelled
    candidate (email_candidate), never in the Email field.
  * invalid / invalid domain / do-not-mail emails are dropped.
  * Personal emails are never used.
  * Phones: contact mobile -> Mobile, contact main line -> Direct/Local. Company switchboards are not used.
  * A result whose name does not match the requested person is rejected as a possible false match.
"""
import difflib
import glob
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from load_data import ROOT, RESEARCH_DIR, norm, name_key, email_ok  # noqa: E402

ENRICH_DIR = os.path.join(ROOT, "data", "enrichment")


def account_domains():
    doms = {}
    for f in glob.glob(os.path.join(RESEARCH_DIR, "*.json")):
        c = json.load(open(f)).get("company", {})
        ds = set()
        for v in (c.get("domain", ""), c.get("company_website", "")):
            for tok in str(v).replace("(", " ").replace(")", " ").replace(",", " ").split():
                tok = tok.lower().replace("https://", "").replace("http://", "").replace("www.", "").strip("/;:")
                if "." in tok and not tok.startswith("legacy"):
                    ds.add(tok.split("/")[0])
        doms[norm(c.get("company_name", ""))] = ds
    return doms


def domain_ok(email, ds, seamless_dom, company_key=""):
    d = email.lower().split("@")[1]
    root = norm(d.split(".")[0])
    generic = {"emirates", "dubai", "abudhabi", "national", "gulf", "bank", "group", "holding", "united", "arab", "global", "international"}
    if len(root) >= 5 and root not in generic and company_key and company_key.startswith(root):
        return True  # e.g. alansari.ae for Al Ansari Financial Services
    cands = set(ds)
    if seamless_dom:
        cands.add(seamless_dom.lower().replace("www.", ""))
    return any(d == x or d.endswith("." + x) or x.endswith("." + d) for x in cands if x)


def main():
    raws = []
    for f in sorted(glob.glob(os.path.join(ENRICH_DIR, "raw_results*.json"))):
        raws += json.load(open(f))
    doms = account_domains()
    queue_names = {}
    for f in sorted(glob.glob(os.path.join(ENRICH_DIR, "queue*.json"))):
        for q in json.load(open(f)):
            queue_names[q["key"]] = q.get("name") or q["key"].split("|")[1]
    out, stats = {}, {"verified_email": 0, "candidate_email": 0, "phone": 0, "rejected_match": 0}
    for x in raws:
        r = x.get("result") or {}
        if x.get("status") != "done" or not r:
            continue
        key = x["key"]
        co_key, want = key.split("|")
        got = name_key(r.get("fullName") or r.get("name") or "")
        if difflib.SequenceMatcher(None, norm(queue_names.get(key, want)), got).ratio() < 0.7 and want[:5] not in got:
            out[key] = {"rejected": True, "rejected_reason": f"Seamless returned '{r.get('fullName')}' — possible false match"}
            stats["rejected_match"] += 1
            continue
        ds = doms.get(co_key, set())
        e = {"title": r.get("title") or r.get("jobTitle") or "", "company": r.get("companyName") or "",
             "linkedin_url": r.get("lIProfileUrl") or "",
             "location": (r.get("contactLocation") or {}).get("fullString", "") if isinstance(r.get("contactLocation"), dict) else "",
             "job_history": r.get("jobHistory") or []}
        best, cand = None, None
        for i in (1, 2, 3):
            em = (r.get(f"email{i}") or "").strip()
            st = (r.get(f"email{i}EmailAI") or "").lower()
            conf = r.get(f"email{i}TotalAI") or ""
            if not em or not email_ok(em) or not domain_ok(em, ds, r.get("companyDomain"), co_key):
                continue
            if st == "valid" and not best:
                best = (em, conf)
            elif st == "accept all" and not cand:
                cand = (em, conf)
        if best:
            e.update(email=best[0], email_status="Verified Active", email_confidence=f"Seamless valid {best[1]}")
            stats["verified_email"] += 1
        elif cand:
            e.update(email_candidate=f"{cand[0]} (Seamless accept-all domain, {cand[1]} — NOT verified)")
            stats["candidate_email"] += 1
        phones, ptypes = [], []
        for i in (1, 2, 3):
            ph = (r.get(f"contactPhone{i}") or "").strip()
            if not ph:
                continue
            t = (r.get(f"contactPhone{i}DataType") or "").lower()
            label = "Mobile" if t == "mobile" else "Direct/Local"
            phones.append(("M: " if label == "Mobile" else "D: ") + ph)
            ptypes.append(label)
        if phones:
            e["phone"] = "; ".join(phones[:2])
            e["phone_type"] = " + ".join(dict.fromkeys(ptypes[:2]))
            stats["phone"] += 1
        out[key] = e
    json.dump(out, open(os.path.join(ENRICH_DIR, "seamless.json"), "w"), indent=1)
    print(f"{len(out)} enriched records · {stats}")


if __name__ == "__main__":
    main()
