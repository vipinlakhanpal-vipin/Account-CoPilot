"""Import the reference workbook's target lists (Vipin-Profiling + UAE Targets v3 + Stakeholders) as accounts
and contacts, verbatim. Output: data/seed/reference.json (git-ignored), loaded by `node scripts/seed_reference.mjs`.

Usage: python3 scripts/import_reference_lists.py "<path to FINAL-UAE-Target-LIST.xlsx>"

Rules:
  * Reference values are never changed. Companies already researched by Claude keep Claude's fields; the
    reference profile is attached alongside (companies.profile) for comparison.
  * Every Stakeholders row is carried with its own Channel-state.
"""
import glob
import json
import os
import re
import sys

from openpyxl import load_workbook

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from load_data import ROOT, RESEARCH_DIR, norm  # noqa: E402
from import_reference import toks, MANUAL, NOT_SAME  # noqa: E402


def dom(url):
    u = str(url or "").lower().strip()
    u = re.sub(r"^https?://", "", u).replace("www.", "")
    return u.split("/")[0].strip()


def key(name):
    return " ".join(toks(str(name)))


def slugify(s):
    s = re.sub(r"\(.*?\)", "", str(s).lower())
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def clean(v):
    if v is None:
        return None
    if isinstance(v, float) and v.is_integer():
        return int(v)
    return v if not isinstance(v, str) else (v.strip() or None)


def main(path):
    # researched accounts (Claude)
    mine = {}
    for f in glob.glob(os.path.join(RESEARCH_DIR, "*.json")):
        c = json.load(open(f))["company"]
        slug = os.path.basename(f)[:-5]
        mine[slug] = {"key": key(c.get("company_name", slug)), "dom": dom(c.get("domain") or c.get("company_website")),
                      "icp_fit": c.get("icp_fit")}

    def match_mine(name, website=None, email=None):
        lc = str(name).strip().lower()
        if lc in NOT_SAME:
            return None
        if lc in MANUAL and MANUAL[lc] in mine:
            return MANUAL[lc]
        d = dom(website)
        if d:
            for s, m in mine.items():
                if m["dom"] and (d == m["dom"] or d.endswith("." + m["dom"])):
                    return s
        k = key(name)
        kt = k.split()
        for s, m in mine.items():
            at = m["key"].split()
            if k and (k == m["key"] or (min(len(kt), len(at)) >= 2 and (at[:len(kt)] == kt or kt[:len(at)] == at))):
                return s
        return None

    wb = load_workbook(path, read_only=True, data_only=True)
    ut_hdr, *ut_rows = list(wb["UAE Targets v3"].iter_rows(values_only=True))
    ut = {key(r[1]): dict(zip(ut_hdr, r)) for r in ut_rows if r and r[1]}
    vp_rows = list(wb["Vipin-Profiling"].iter_rows(values_only=True))
    vp_hdr = vp_rows[0]

    companies = {}  # slug -> record
    for r in vp_rows[2:]:
        if not r or not r[2]:
            continue
        rec = {h: clean(v) for h, v in zip(vp_hdr, r) if h}
        extra = ut.get(key(r[2]), {})
        profile = {"Vipin-Profiling": {k: v for k, v in rec.items() if v not in (None, "")},
                   "UAE Targets v3": {k: clean(v) for k, v in extra.items() if k and clean(v) not in (None, "")}}
        m = match_mine(rec["Company"], rec.get("Website"))
        slug = m or "ref-" + slugify(rec["Company"])
        size = rec.get("Size (USD m)")
        companies[slug] = {
            "slug": slug, "matched_claude": bool(m), "company_name": rec["Company"],
            "company_website": rec.get("Website"), "domain": dom(rec.get("Website")) or None,
            "industry": rec.get("Industry"), "hq_city": rec.get("HQ"), "country": "UAE",
            "revenue_usd_m": size if isinstance(size, (int, float)) else None,
            "employee_range": str(rec.get("Number of employees")) if rec.get("Number of employees") else None,
            "erp": rec.get("ERP"), "ref_sl_no": rec.get("Sl#") if isinstance(rec.get("Sl#"), int) else None,
            "lists": ["Your profiling"] + (["Claude research"] if m else []),
            "icp_status": ("Verified ICP" if mine[m]["icp_fit"] == "Yes" else f"Claude researched — ICP {mine[m]['icp_fit']}") if m
                          else "Your target — not yet verified",
            "profile": profile,
        }

    # Stakeholders: every row, verbatim
    st_rows = list(wb["Stakeholders"].iter_rows(values_only=True))
    hdr_i = next(i for i, r in enumerate(st_rows) if r and "Full name" in [str(x) for x in r])
    hdr = [str(x or "").strip() for x in st_rows[hdr_i]]
    by_key = {key(c["company_name"]): s for s, c in companies.items()}
    contacts = []
    for i, r in enumerate(st_rows[hdr_i + 1:], hdr_i + 2):
        rec = dict(zip(hdr, r))
        if not rec.get("Full name") or not rec.get("Company") or str(rec["Company"]).startswith("Company ("):
            continue
        co = str(rec["Company"]).strip()
        email = str(rec.get("Email") or "")
        slug = match_mine(co, None, email)
        if not slug:
            k = key(co)
            slug = by_key.get(k)
            if not slug:  # fuzzy against profiled companies (prefix of two+ tokens)
                kt = k.split()
                for kk, s in by_key.items():
                    at = kk.split()
                    if min(len(kt), len(at)) >= 2 and (at[:len(kt)] == kt or kt[:len(at)] == at):
                        slug = s
                        break
            if not slug and "@" in email:
                ed = email.split("@")[1].lower()
                slug = next((s for s, c in companies.items() if c.get("domain") and ed == c["domain"]), None)
        if not slug:
            slug = "ref-" + slugify(co)
            if slug not in companies:
                companies[slug] = {"slug": slug, "matched_claude": False, "company_name": co, "country": "UAE",
                                   "lists": ["Stakeholders"], "icp_status": "Your target — not yet verified",
                                   "profile": {"Stakeholders": {"Company (as written)": co}}}
                by_key[key(co)] = slug
        elif slug in companies and "Stakeholders" not in companies[slug]["lists"]:
            companies[slug]["lists"].append("Stakeholders")
        tier = rec.get("Contact tier")
        state = clean(rec.get("Channel-state")) or ""
        contacts.append({
            "row": i, "company_slug": slug, "company_ref_name": co,
            "full_name": clean(rec.get("Full name")), "nationality": clean(rec.get("Nationality")),
            "title_verbatim": clean(rec.get("Title (verbatim)")), "role_family": clean(rec.get("Role family")),
            "contact_tier": f"Tier {tier}" if isinstance(tier, int) else clean(tier),
            "owner": clean(rec.get("Owner")), "channel_state": state, "channel_source": state,
            "research_channel": "Copilot" if state.lower().startswith("copilot") else ("Claude (prior run)" if state.lower().startswith("claude") else "Reference"),
            "email": clean(rec.get("Email")), "email_status": clean(rec.get("Email status\nActive/Inactive")),
            "phone": str(rec.get("Phone")) if rec.get("Phone") else None, "linkedin_url": clean(rec.get("LinkedIn URL")),
            "warm_intro": clean(rec.get("Warm intro?")), "notes_contact": clean(rec.get("Notes / intel")),
            "source": f"FINAL-UAE-Target-LIST-V3.1 · Stakeholders row {i}", "source_type": "Reference workbook (unchanged)",
            "record_status": "Reference V3.1 (unchanged)", "is_reference": True,
        })

    # Claude-researched accounts that are not in your lists: tag them too
    for s, m in mine.items():
        if s not in companies:
            companies[s] = {"slug": s, "matched_claude": True, "lists": ["Claude research"],
                            "icp_status": "Verified ICP" if m["icp_fit"] == "Yes" else f"Claude researched — ICP {m['icp_fit']}", "profile": None}

    # stable contact ids: rows on Claude accounts reuse the ids already loaded ("C0xx-R<row>")
    files = sorted(glob.glob(os.path.join(RESEARCH_DIR, "*.json")))
    cid = {os.path.basename(f)[:-5]: f"C{i:03d}" for i, f in enumerate(files, 1)}
    for c in contacts:
        c["external_id"] = f"{cid[c['company_slug']]}-R{c['row']}" if c["company_slug"] in cid else f"REF-R{c['row']}"
    out = {"companies": list(companies.values()), "contacts": contacts}
    os.makedirs(os.path.join(ROOT, "data", "seed"), exist_ok=True)
    json.dump(out, open(os.path.join(ROOT, "data", "seed", "reference.json"), "w"), ensure_ascii=False, default=str)
    new = [c for c in companies.values() if not c["matched_claude"]]
    print(f"companies total: {len(companies)} · matched to Claude research: {len(companies) - len(new)} · new from your lists: {len(new)}")
    print(f"stakeholder contacts: {len(contacts)} · on Claude accounts: {sum(1 for c in contacts if not c['company_slug'].startswith('ref-'))}")


if __name__ == "__main__":
    main(sys.argv[1])
