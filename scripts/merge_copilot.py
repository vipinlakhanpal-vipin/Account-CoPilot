"""Account CoPilot — append Claude research rows to an existing Copilot workbook.

Rules enforced:
  * Existing Copilot rows are never edited, moved or deleted (append-only).
  * Same person + same/substantially-same title + no new contact details -> no new row.
  * Different person, different title, or materially new contact info -> new row, Channel State = Claude,
    with the difference explained in Notes / Intel.
  * Styling of the last existing data row is copied onto appended rows so the structure is preserved.

Usage:
  python3 scripts/merge_copilot.py <copilot.xlsx> [sheet_name] [out.xlsx]
Writes to <copilot>_with_Claude.xlsx by default (the original file is left untouched).
"""
import copy
import difflib
import os
import re
import sys

from openpyxl import load_workbook

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from load_data import load_all, norm  # noqa: E402

# header text (normalised) -> our contact key
HEADER_MAP = {
    "company": "company", "companyname": "company", "account": "company", "accountname": "company",
    "fullname": "full_name", "name": "full_name", "contactname": "full_name",
    "titleverbatim": "title_verbatim", "title": "title_verbatim", "jobtitle": "title_verbatim",
    "rolefamily": "role_family", "contacttier": "contact_tier", "tier": "contact_tier",
    "channelstate": "channel_state", "researchchannel": "channel_state", "channel": "channel_state",
    "channelsource": "channel_source",
    "email": "email", "emailaddress": "email", "emailstatus": "email_status",
    "phone": "phone", "phonemobilelocalorboardnumbersonly": "phone", "phonenumber": "phone", "mobile": "phone",
    "phonetype": "phone_type",
    "linkedinurl": "linkedin_url", "linkedin": "linkedin_url",
    "notesintelaboutthecontact": "notes_contact", "notesintelaboutcontact": "notes_contact",
    "notesintelaboutthecompany": "notes_company", "notesintelaboutcompany": "notes_company",
    "nationality": "nationality", "location": "location", "country": "country",
    "s2psignal": "account_s2p_signal", "strongsignal": "account_s2p_signal", "s2pstrongsignals": "account_s2p_signal",
    "existings2pproduct": "existing_s2p_product",
}


def find_header(ws):
    for r in range(1, 15):
        vals = [norm(str(c.value or "")) for c in ws[r]]
        if "fullname" in vals or "name" in vals:
            return r, {i + 1: HEADER_MAP.get(v) for i, v in enumerate(vals) if HEADER_MAP.get(v)}
    raise SystemExit("Could not find a header row containing 'Full Name' in the first 15 rows.")


def similar(a, b):
    return difflib.SequenceMatcher(None, norm(a), norm(b)).ratio()


def main(path, sheet=None, out=None):
    wb = load_workbook(path)
    ws = wb[sheet] if sheet else wb.active
    hdr_row, cols = find_header(ws)
    key_to_col = {v: k for k, v in cols.items()}
    last = ws.max_row
    while last > hdr_row and all(ws.cell(row=last, column=c).value in (None, "") for c in cols):
        last -= 1

    existing = []
    for r in range(hdr_row + 1, last + 1):
        existing.append({k: str(ws.cell(row=r, column=c).value or "") for c, k in cols.items()})

    d = load_all()
    appended, skipped = 0, 0
    style_row = last if last > hdr_row else hdr_row
    for p in d["contacts"]:
        match = None
        for e in existing:
            same_co = not e.get("company") or similar(e.get("company"), p["company"]) > 0.6 or \
                norm(p["company"])[:5] in norm(e.get("company"))
            if same_co and similar(e.get("full_name"), p.get("full_name")) > 0.88:
                match = e
                break
        diffs = []
        if match:
            if similar(match.get("title_verbatim"), p.get("title_verbatim")) < 0.8:
                diffs.append(f"Title differs — Copilot: '{match.get('title_verbatim')}' vs Claude: '{p.get('title_verbatim')}' ({p.get('source_url','')})")
            if p.get("email") and norm(p["email"]) != norm(match.get("email")):
                diffs.append(f"Email differs — Copilot: '{match.get('email') or 'blank'}' vs Claude: '{p['email']}' ({p.get('email_source','')}, {p.get('email_status','')})")
            if p.get("phone") and re.sub(r"\D", "", p["phone"]) != re.sub(r"\D", "", match.get("phone", "")):
                diffs.append(f"Phone differs — Copilot: '{match.get('phone') or 'blank'}' vs Claude: '{p['phone']}' ({p.get('phone_source','')})")
            if p.get("linkedin_url") and norm(p["linkedin_url"]) != norm(match.get("linkedin_url")) and not match.get("linkedin_url"):
                diffs.append(f"LinkedIn URL added by Claude: {p['linkedin_url']}")
            if not diffs:
                skipped += 1
                continue
        last += 1
        row = dict(p)
        row["channel_state"] = "Claude"
        note = p.get("notes_contact", "")
        if match:
            note = "SAME PERSON AS COPILOT ROW — differences: " + " | ".join(diffs) + (" || " + note if note else "")
        else:
            note = "NEW CONTACT (not in Copilot data). Source: " + (p.get("source_url") or p.get("source", "")) + (" || " + note if note else "")
        row["notes_contact"] = note
        for c, k in cols.items():
            tgt = ws.cell(row=last, column=c, value=row.get(k, ""))
            src = ws.cell(row=style_row, column=c)
            if src.has_style:
                tgt._style = copy.copy(src._style)
        appended += 1
    out = out or re.sub(r"\.xlsx$", "", path) + "_with_Claude.xlsx"
    wb.save(out)
    print(f"Appended {appended} Claude rows, skipped {skipped} duplicates of Copilot rows. Saved {out}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] else None, sys.argv[3] if len(sys.argv) > 3 else None)
