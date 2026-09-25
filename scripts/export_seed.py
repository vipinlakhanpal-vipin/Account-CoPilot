"""Export the researched dataset (research + reference + Seamless enrichment) to data/seed/seed.json
for loading into Supabase with `npm run seed`. The output contains personal data and is git-ignored."""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from load_data import load_all, ROOT  # noqa: E402

COMPANY_KEYS = ["company_name", "company_website", "domain", "country", "hq_city", "exchange", "ticker", "industry", "revenue_usd_m",
                "revenue_local", "revenue_fy", "revenue_source_url", "employee_range", "employee_source", "icp_fit", "icp_fit_reason", "ownership",
                "parent_company", "subsidiaries", "procurement_model", "erp", "erp_status", "erp_evidence", "existing_s2p_product",
                "existing_s2p_detail", "s2p_platform_status", "s2p_signal_level", "s2p_strong_signals", "digital_transformation_signals",
                "procurement_transformation_signals", "relevant_technologies", "known_implementation_partner", "known_consulting_partner",
                "coupa_opportunity_type", "ariba_opportunity_type", "potential_opportunity", "board_phone", "board_phone_source",
                "account_notes", "research_confidence", "research_channel"]
CONTACT_KEYS = ["full_name", "nationality", "title_verbatim", "standardized_title", "role_family", "contact_tier", "research_channel",
                "channel_state", "channel_source", "source", "source_type", "source_url", "second_source_url", "verification_status", "email",
                "email_status", "email_source", "email_confidence", "email_candidate", "phone", "phone_type", "phone_source", "location",
                "country", "linkedin_url", "employment_status", "previous_company", "previous_title", "s2p_contact_signal", "notes_contact",
                "confidence", "record_status", "claude_check", "company_ref_name", "owner", "warm_intro"]


def pick(d, keys):
    out = {}
    for k in keys:
        v = d.get(k)
        if isinstance(v, (list, dict)):
            v = json.dumps(v, ensure_ascii=False)
        out[k] = None if v in ("", None) else v
    return out


def main():
    d = load_all()
    slug = {a["company_id"]: a["_file"][:-5] for a in d["accounts"]}
    rv = lambda x: x if isinstance(x, (int, float)) else None  # noqa: E731
    companies = []
    for a in d["accounts"]:
        c = pick(a, COMPANY_KEYS)
        c["revenue_usd_m"] = rv(a.get("revenue_usd_m"))
        c["slug"] = slug[a["company_id"]]
        companies.append(c)
    contacts = []
    for p in d["contacts"]:
        c = pick(p, CONTACT_KEYS)
        c["external_id"] = p["contact_id"]
        c["is_reference"] = bool(p.get("_is_ref"))
        c["company_slug"] = slug[p["company_id"]]
        contacts.append(c)
    ev = lambda rows, keys: [{**pick(r, keys), "company_slug": slug[r["company_id"]]} for r in rows if r.get("company_id") in slug]  # noqa: E731
    seed = {
        "companies": companies, "contacts": contacts,
        "s2p_signals": ev(d["signals"], ["category", "signal", "level", "platform", "evidence", "source_url", "date", "research_channel"]),
        "sources": ev(d["sources"], ["related_contact", "source", "source_type", "source_tier", "url", "research_channel", "information_found", "evidence",
                                     "date_published", "confidence", "supports_current_employment", "supports_current_title", "supports_s2p_status"]),
        "technology_evidence": ev(d["apps"], ["name", "category", "status", "evidence", "source_url"]),
        "employment_history": ev(d["history"], ["full_name", "company", "title", "source", "source_url", "determination", "evidence"]),
        "conflicts": ev(d["conflicts"], ["entity", "field", "value_a", "source_a", "value_b", "source_b", "determination", "evidence"]),
    }
    os.makedirs(os.path.join(ROOT, "data", "seed"), exist_ok=True)
    out = os.path.join(ROOT, "data", "seed", "seed.json")
    json.dump(seed, open(out, "w"), ensure_ascii=False, default=str)
    print({k: len(v) for k, v in seed.items()}, "->", out)


if __name__ == "__main__":
    main()
