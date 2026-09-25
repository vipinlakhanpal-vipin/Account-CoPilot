"""Turn Seamless verification results into updates for the reference (your) target list.

Inputs : data/verification/seamless_companies.json, data/verification/seamless_contacts_raw.json,
         data/seed/reference.json
Output : data/verification/updates.json  (applied by `node scripts/apply_verification.mjs`)

Your rows are never edited. Each gets a `claude_check` verdict; material differences become new
Channel State = Claude rows that explain the difference.
"""
import difflib
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from load_data import ROOT, norm, name_key, email_ok  # noqa: E402
from import_reference import toks  # noqa: E402

GENERIC_TOK = {"uae", "dubai", "abu", "dhabi", "emirates", "national", "international", "gulf", "al", "middle", "east", "global", "real", "estate"}


def rootdom(d):
    d = re.sub(r"^https?://", "", str(d or "").lower()).replace("www.", "").split("/")[0]
    parts = d.split(".")
    return parts[-3] if len(parts) >= 3 and parts[-2] in ("gov", "com", "co", "net", "org") else (parts[-2] if len(parts) >= 2 else d)


def same_employer(ref_name, ref_dom, s_name, s_dom):
    """Same organisation (or same group) if domains share a root, or the names share a distinctive keyword/abbreviation."""
    if ref_dom and s_dom and rootdom(ref_dom) == rootdom(s_dom):
        return True
    a = set(toks(ref_name)) | {x.lower() for x in re.findall(r"\(([^)]+)\)", str(ref_name))}
    b = set(toks(s_name)) | {x.lower() for x in re.findall(r"\(([^)]+)\)", str(s_name))}
    a -= GENERIC_TOK; b -= GENERIC_TOK
    if a & b:
        return True
    na, nb = norm(ref_name), norm(s_name)
    return bool(na and nb and (na in nb or nb in na or sim(na, nb) >= 0.75))

V = os.path.join(ROOT, "data", "verification")
TODAY = "2026-09-25"
REV = {"$1B+": 1000, "$500M - $1B": 500, "$100M - $500M": 100, "$50M - $100M": 50, "$20M - $50M": 20}


def sim(a, b):
    return difflib.SequenceMatcher(None, norm(a), norm(b)).ratio()


def company_verdict(s, ref):
    """Seamless is used for revenue/headcount bands only. Its Public/Private flag is unreliable for UAE
    (it lists ADNOC, Nakheel etc. as Private), so listing status is always left 'to confirm'."""
    if not s or not s.get("seamless_found"):
        return "Your target — not found in Seamless", "Not found in Seamless by domain or name; needs web verification."
    rev_txt = s.get("revenue_range") or ""
    try:
        rev = float(s.get("annual_revenue") or 0) / 1e6
    except (TypeError, ValueError):
        rev = 0
    emp = s.get("employee_count") or 0
    reason = (f"Seamless: {s.get('seamless_name')} ({s.get('seamless_domain')}); revenue band {rev_txt or 'unknown'}"
              + (f", ~USD {rev:,.0f}m" if rev else "") + f"; employees {emp or s.get('employee_range') or 'unknown'}"
              + (f"; your size USD {ref['revenue_usd_m']}m" if ref.get("revenue_usd_m") else "")
              + (f"; match note: {s['match_note']}" if s.get("match_note") else "")
              + ". Listing status not confirmed — Seamless's public/private flag is unreliable for UAE companies.")
    if rev_txt in ("$1B+", "$500M - $1B") or rev >= 250:
        return "Your target — revenue ≥ USD 250M (Seamless), listing to confirm", reason
    if rev_txt == "$100M - $500M":
        return "Your target — revenue USD 100–500M band, confirm", reason
    if rev_txt:
        return "Your target — revenue below USD 250M (Seamless)", reason
    return "Your target — revenue unknown", reason


def main():
    ref = json.load(open(os.path.join(ROOT, "data", "seed", "reference.json")))
    comps = {c["slug"]: c for c in ref["companies"]}
    sc_path = os.path.join(V, "seamless_companies.json")
    sc = {r["slug"]: r for r in json.load(open(sc_path))} if os.path.exists(sc_path) else {}
    company_updates = []
    for slug, c in comps.items():
        if not slug.startswith("ref-"):
            continue
        status, reason = company_verdict(sc.get(slug), c)
        s = sc.get(slug) or {}
        company_updates.append({"slug": slug, "icp_status": status, "icp_fit_reason": reason,
                                "claude_verification": {k: s.get(k) for k in ("seamless_name", "seamless_domain", "company_type", "ticker", "exchange",
                                                                              "revenue_range", "annual_revenue", "employee_count", "employee_range",
                                                                              "city", "industry", "match_note") if s.get(k) not in (None, "")},
                                "technologies": s.get("technologies") or []})

    raw_path = os.path.join(V, "seamless_contacts_raw.json")
    raws = json.load(open(raw_path)) if os.path.exists(raw_path) else []
    by_ext = {c["external_id"]: c for c in ref["contacts"]}
    by_row = {c["row"]: c for c in ref["contacts"]}
    checks, new_rows = [], []
    stats = {"confirmed": 0, "title_changed": 0, "moved": 0, "email_new": 0, "email_invalid": 0, "not_found": 0, "false_match": 0}
    for x in raws:
        base = by_ext.get(x["external_id"])
        if not base:
            continue
        # every reference row for the same person gets the same verdict
        same = [c for c in ref["contacts"] if c["company_slug"] == base["company_slug"] and name_key(c["full_name"]) == name_key(base["full_name"])]
        r = x.get("result") or {}
        if x.get("status") != "done" or not r:
            verdict = f"Claude {TODAY}: not found in Seamless — needs LinkedIn / website check"
            stats["not_found"] += 1
            checks += [{"external_id": c["external_id"], "claude_check": verdict} for c in same]
            continue
        got = r.get("fullName") or r.get("name") or ""
        if sim(name_key(got), name_key(base["full_name"])) < 0.7:
            stats["false_match"] += 1
            checks += [{"external_id": c["external_id"], "claude_check": f"Claude {TODAY}: Seamless returned a different person ('{got}') — unverified"} for c in same]
            continue
        s_title, s_co = r.get("title") or r.get("jobTitle") or "", r.get("companyName") or r.get("company") or ""
        ref_co = base["company_ref_name"]
        ref_dom = comps.get(base["company_slug"], {}).get("domain")
        moved = bool(s_co) and not same_employer(ref_co, ref_dom, s_co, r.get("companyDomain"))
        shifted_to = None
        if moved:
            for dlt in (-1, 1, -2, 2):
                n = by_row.get(base["row"] + dlt)
                if n and same_employer(n["company_ref_name"], comps.get(n["company_slug"], {}).get("domain"), s_co, r.get("companyDomain")):
                    shifted_to = (n, dlt)
                    break
        title_diff = s_title and base.get("title_verbatim") and sim(s_title, base["title_verbatim"]) < 0.75
        valid = None
        for i in (1, 2, 3):
            em, st = (r.get(f"email{i}") or "").strip(), (r.get(f"email{i}EmailAI") or "").lower()
            if em and st == "valid" and email_ok(em):
                valid = (em, r.get(f"email{i}TotalAI") or "")
                break
        ref_emails = {norm(c.get("email")) for c in same if c.get("email")}
        ref_email_invalid = any(norm(r.get(f"email{i}")) in ref_emails and (r.get(f"email{i}EmailAI") or "").lower() == "invalid" for i in (1, 2, 3))
        phones = [("M: " if (r.get(f"contactPhone{i}DataType") or "").lower() == "mobile" else "D: ") + r[f"contactPhone{i}"]
                  for i in (1, 2, 3) if r.get(f"contactPhone{i}")][:2]
        parts, diffs = [], []
        if shifted_to:
            n, dlt = shifted_to
            parts.append(f"Company in your sheet appears shifted: Seamless shows this person at '{s_co}' as '{s_title}' — the company on row {base['row'] + dlt} ({n['company_ref_name']})")
            diffs.append("company (sheet row shift)"); stats["row_shift"] = stats.get("row_shift", 0) + 1
        elif moved:
            parts.append(f"now at '{s_co}' as '{s_title}' — possible employment change"); diffs.append("employer"); stats["moved"] += 1
        elif title_diff:
            parts.append(f"current title per Seamless: '{s_title}'"); diffs.append("title"); stats["title_changed"] += 1
        else:
            parts.append("employer and title match"); stats["confirmed"] += 1
        if valid and norm(valid[0]) not in ref_emails:
            parts.append(f"valid email {valid[0]} ({valid[1]}) differs from / adds to reference"); diffs.append("email"); stats["email_new"] += 1
        elif valid:
            parts.append(f"reference email is Seamless-valid ({valid[1]})")
        if ref_email_invalid:
            parts.append("reference email marked INVALID by Seamless"); stats["email_invalid"] += 1
        verdict = f"Claude {TODAY} (Seamless): " + "; ".join(parts)
        checks += [{"external_id": c["external_id"], "claude_check": verdict} for c in same]
        if diffs:
            new_rows.append({
                "external_id": f"CLV-{x['external_id']}", "company_slug": shifted_to[0]["company_slug"] if shifted_to else base["company_slug"], "full_name": base["full_name"],
                "title_verbatim": s_title or base.get("title_verbatim"), "role_family": base.get("role_family"), "contact_tier": base.get("contact_tier"),
                "research_channel": "Claude", "channel_state": "Claude", "channel_source": "Claude-Seamless",
                "source": "Seamless.ai verification", "source_type": "Seamless.ai", "verification_status": "LIKELY CURRENT" if (shifted_to or not moved) else "UNVERIFIED",
                "email": valid[0] if valid else None, "email_status": "Verified Active" if valid else "Not Found",
                "email_source": "Seamless.ai" if valid else None, "email_confidence": f"Seamless valid {valid[1]}" if valid else None,
                "phone": "; ".join(phones) or None, "phone_type": "Mobile" if phones and phones[0].startswith("M") else ("Direct/Local" if phones else None),
                "phone_source": "Seamless.ai" if phones else None, "linkedin_url": r.get("lIProfileUrl") or base.get("linkedin_url"),
                "location": (r.get("contactLocation") or {}).get("fullString") if isinstance(r.get("contactLocation"), dict) else None,
                "employment_status": "Recently Changed" if (moved and not shifted_to) else "Current",
                "notes_contact": f"SAME PERSON AS REFERENCE ROW {base['external_id']} ({base.get('channel_state')}). Differences: {', '.join(diffs)}. " + "; ".join(parts),
                "record_status": "Claude — corrected company (sheet row shift)" if shifted_to else "Claude — differs from reference",
                "company_ref_name": shifted_to[0]["company_ref_name"] if shifted_to else ref_co,
            })
    out = {"companies": company_updates, "contact_checks": checks, "new_contacts": new_rows, "stats": stats}
    json.dump(out, open(os.path.join(V, "updates.json"), "w"), ensure_ascii=False, indent=1)
    from collections import Counter
    print("companies:", Counter(c["icp_status"] for c in company_updates))
    print("contacts:", stats, "| checks:", len(checks), "| new Claude rows:", len(new_rows))


if __name__ == "__main__":
    main()
